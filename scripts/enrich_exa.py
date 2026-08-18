#!/usr/bin/env python3
"""Enriquecimiento web de comunidades vía Exa (batch, un solo archivo).

NO se llama desde ninguna ruta de Next. Corre a mano/CI.

Lee frontend/data/seed/sf-communities.json y, por comunidad, hace 2 queries a
la API de Exa con su nombre real. Vuelca el crudo a data/raw/exa-communities.json
ANTES de normalizar, y luego escribe frontend/data/seed/community-evidence.json
(Record<communityId, Evidence[]> según lib/contracts/growxth.ts).

Uso:
    EXA_API_KEY=... python scripts/enrich_exa.py          # fetch + normalize
    python scripts/enrich_exa.py normalize                # solo re-normaliza el crudo

Degradación: si falta EXA_API_KEY o Exa falla, NO se escribe el archivo y todo
el sistema sigue funcionando sin él (load-graph/pipeline lo tratan como opcional).
Una query que falla se saltea; nunca se aborta el batch entero.
"""

import argparse
import hashlib
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import httpx

EXA_BASE = "https://api.exa.ai"
SEARCH_ENDPOINT = "/search"
RESULTS_PER_QUERY = 5
MAX_EVIDENCE_PER_COMMUNITY = 5
MAX_CONCURRENCY = 3
REQUEST_TIMEOUT = 10.0

ROOT = Path(__file__).resolve().parent.parent
COMMUNITIES_PATH = ROOT / "frontend" / "data" / "seed" / "sf-communities.json"
EVENTS_PATH = ROOT / "frontend" / "data" / "seed" / "sf-events.json"
RAW_EXA_PATH = ROOT / "data" / "raw" / "exa-communities.json"
EVIDENCE_OUT_PATH = ROOT / "frontend" / "data" / "seed" / "community-evidence.json"


GENERIC_NAMES = {"personal", "events", "community"}


def query_variants(name):
    return [
        f'"{name}" San Francisco developer community',
        f'"{name}" sponsors OR recap OR review',
    ]


# --------------------------------------------------------------------------- #
# dig / canonicalización
# --------------------------------------------------------------------------- #
def dig(obj, *paths, default=None):
    for path in paths:
        cur = obj
        ok = True
        for seg in path.split("."):
            if isinstance(cur, dict) and seg in cur:
                cur = cur[seg]
            elif isinstance(cur, list) and seg.lstrip("-").isdigit() and -len(cur) <= int(seg) < len(cur):
                cur = cur[int(seg)]
            else:
                ok = False
                break
        if ok and cur is not None:
            return cur
    return default


def canonical_url(url):
    """URL canónica para dedupe: sin query/fragment, host lowercase sin www,
    sin trailing slash. Devuelve None si no parsea."""
    if not isinstance(url, str) or not url:
        return None
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    host = parts.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    path = parts.path.rstrip("/")
    return urlunsplit((parts.scheme.lower(), host, path, "", ""))


# --------------------------------------------------------------------------- #
# FETCH
# --------------------------------------------------------------------------- #
def _search(client, api_key, query):
    """Una búsqueda de Exa. Devuelve el JSON o None si falla (nunca lanza)."""
    try:
        resp = client.post(
            SEARCH_ENDPOINT,
            headers={"x-api-key": api_key, "content-type": "application/json"},
            json={
                "query": query,
                "numResults": RESULTS_PER_QUERY,
                "contents": {"highlights": True},
            },
        )
        resp.raise_for_status()
        return resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        print(f"  query falló, se saltea: {query!r} ({exc})", file=sys.stderr)
        return None


def fetch(api_key, communities):
    tasks = []
    for com in communities:
        name = com.get("name")
        query_name = com.get("_queryName") or name
        if not query_name:
            continue
        for q in query_variants(query_name):
            tasks.append((com["id"], name, query_name, q))

    records = []
    with httpx.Client(base_url=EXA_BASE, timeout=REQUEST_TIMEOUT) as client:
        def run(task):
            com_id, name, query_name, q = task
            data = _search(client, api_key, q)
            return {
                "communityId": com_id,
                "communityName": name,
                "queryName": query_name,
                "query": q,
                "response": data,
            }

        with ThreadPoolExecutor(max_workers=MAX_CONCURRENCY) as pool:
            for rec in pool.map(run, tasks):
                records.append(rec)

    ok = sum(1 for r in records if r["response"] is not None)
    print(f"  {ok}/{len(records)} queries ok")
    return records


# --------------------------------------------------------------------------- #
# NORMALIZE
# --------------------------------------------------------------------------- #
def score_to_confidence(score):
    try:
        v = float(score)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, v))


def result_to_evidence(result, fetched_at, community_id):
    url = dig(result, "url", "id")
    canon = canonical_url(url)
    if not canon:
        return None, None

    published = dig(result, "publishedDate", "published_date")
    has_real_date = isinstance(published, str) and len(published) >= 4
    observed_at = published if has_real_date else fetched_at

    highlights = dig(result, "highlights", default=[]) or []
    excerpt = None
    if isinstance(highlights, list) and highlights and isinstance(highlights[0], str):
        excerpt = highlights[0][:200]

    ev = {
        "id": f"ev-exa-{hashlib.sha1(f'{community_id}:{canon}'.encode('utf-8')).hexdigest()[:12]}",
        "source": "exa",
        "kind": "web_page",
        "url": url,
        "title": dig(result, "title", default=url) or url,
        "observedAt": observed_at,
        "location": "San Francisco, CA",
        "confidence": score_to_confidence(dig(result, "score")),
        "rightsBasis": "public_web",
        # observed SOLO con url + fecha reales; si no, estimated.
        "status": "observed" if (canon and has_real_date) else "estimated",
    }
    if excerpt:
        ev["excerpt"] = excerpt
    return ev, canon


def normalize(records):
    fetched_at = datetime.now(timezone.utc).isoformat()
    by_community = {}
    seen_urls = {}  # dedupe dentro de cada comunidad; una fuente puede servir a dos comunidades.

    for rec in records:
        response = rec.get("response")
        if not response:
            continue
        com_id = rec["communityId"]
        context = rec.get("queryName") or rec.get("communityName") or ""
        context_tokens = {
            token.lower()
            for token in context.replace("&", " ").replace("|", " ").split()
            if len(token) >= 4 and token.lower() not in {"with", "from", "events", "personal"}
        }
        results = dig(response, "results", "data.results", default=[]) or []
        for result in results:
            if len(by_community.get(com_id, [])) >= MAX_EVIDENCE_PER_COMMUNITY:
                break
            searchable = " ".join(
                str(value)
                for value in [
                    dig(result, "title", default=""),
                    dig(result, "url", default=""),
                    " ".join(dig(result, "highlights", default=[]) or []),
                ]
            ).lower()
            if context_tokens and not any(token in searchable for token in context_tokens):
                continue
            ev, canon = result_to_evidence(result, fetched_at, com_id)
            community_seen = seen_urls.setdefault(com_id, set())
            if not ev or canon in community_seen:
                continue
            community_seen.add(canon)
            by_community.setdefault(com_id, []).append(ev)

    return by_community


# --------------------------------------------------------------------------- #
def _load_jsonc(path):
    lines = [
        line for line in path.read_text(encoding="utf-8").splitlines()
        if not line.lstrip().startswith("//")
    ]
    return json.loads("\n".join(lines))


def _load_communities():
    if not COMMUNITIES_PATH.exists():
        print(f"Falta {COMMUNITIES_PATH}.", file=sys.stderr)
        sys.exit(1)
    communities = _load_jsonc(COMMUNITIES_PATH)
    events = _load_jsonc(EVENTS_PATH) if EVENTS_PATH.exists() else []
    event_names = {}
    for event in events:
        for community_id in event.get("communityIds", []):
            event_names.setdefault(community_id, event.get("name"))
    for community in communities:
        name = str(community.get("name", "")).strip()
        if name.lower() in GENERIC_NAMES:
            community["_queryName"] = event_names.get(community.get("id"))
    return communities


def run_fetch_and_normalize():
    api_key = os.environ.get("EXA_API_KEY")
    if not api_key:
        print("EXA_API_KEY no está en el entorno — se saltea el enriquecimiento Exa. "
              "El sistema sigue funcionando sin community-evidence.json.", file=sys.stderr)
        return

    communities = _load_communities()
    print(f"Consultando Exa para {len(communities)} comunidades ({len(communities) * 2} queries)…")
    records = fetch(api_key, communities)

    RAW_EXA_PATH.parent.mkdir(parents=True, exist_ok=True)
    RAW_EXA_PATH.write_text(
        json.dumps({"fetched_at": datetime.now(timezone.utc).isoformat(), "records": records},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Crudo volcado a {RAW_EXA_PATH}")

    _normalize_from_raw()


def _normalize_from_raw():
    if not RAW_EXA_PATH.exists():
        print(f"Falta {RAW_EXA_PATH}. Corré el fetch primero.", file=sys.stderr)
        sys.exit(1)
    raw = json.loads(RAW_EXA_PATH.read_text(encoding="utf-8"))
    records = raw.get("records", []) if isinstance(raw, dict) else raw
    by_community = normalize(records)

    EVIDENCE_OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_OUT_PATH.write_text(json.dumps(by_community, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(len(v) for v in by_community.values())
    print(f"Escrito {EVIDENCE_OUT_PATH}: {len(by_community)} comunidades, {total} evidencias (deduped).")


def main():
    parser = argparse.ArgumentParser(description="Enriquecimiento web de comunidades vía Exa.")
    parser.add_argument("mode", nargs="?", choices=["run", "normalize"], default="run",
                        help="run = fetch + normalize (default); normalize = solo desde el crudo")
    args = parser.parse_args()
    if args.mode == "normalize":
        _normalize_from_raw()
    else:
        run_fetch_and_normalize()


if __name__ == "__main__":
    main()
