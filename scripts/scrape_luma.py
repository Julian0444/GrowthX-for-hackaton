#!/usr/bin/env python3
"""Scraper de eventos de Luma, multi-ciudad.

Un solo archivo, sin imports relativos (no es un paquete). Tres fases, todas
requieren --city (ver CITY_CONFIG para las ciudades soportadas):

  phase1  extracción cruda: pagina el discover de la ciudad activa y vuelca el
          JSON crudo a data/raw/luma-{prefix}.json ANTES de normalizar.
          Imprime keys/tipos de la primera entry. Retries con backoff en
          429/5xx. Rate limit 1 req/s.

  phase1b enriquecimiento por evento: lee frontend/data/seed/{prefix}-events.json
          (salida de phase2) y pega un GET /event/get por cada evento, volcando
          el crudo a data/raw/luma-{prefix}-details.json.

  phase2  normalización: lee data/raw/luma-{prefix}.json (y los detalles de
          phase1b si existen) SIN tocar la red, y escribe
          frontend/data/seed/{prefix}-events.json, {prefix}-communities.json,
          {prefix}-organizers.json y {prefix}-source-meta.json mapeados a
          lib/contracts/growxth.ts.

Uso:
    python scripts/scrape_luma.py phase1  --city sf
    python scripts/scrape_luma.py phase1b --city sf
    python scripts/scrape_luma.py phase2  --city sf
    python scripts/scrape_luma.py phase1  --city nyc
    python scripts/scrape_luma.py phase1b --city nyc
    python scripts/scrape_luma.py phase2  --city nyc

Cada ciudad vive en CITY_CONFIG con su propio place_api_id, bbox y lista de
barrios; los outputs de una ciudad nunca se mezclan con los de otra (todos los
paths llevan el prefijo {prefix} de esa ciudad).

Contexto SF verificado contra api.luma.com el 2026-07-23 (scraper previo del
proyecto; ese snapshot queda congelado — no se vuelve a pisar con phase1 ni
phase1b salvo pedido explícito). Contexto NYC verificado el 2026-08-14
(place_api_id extraído de la página https://lu.ma/nyc). Los paths del JSON NO
están documentados y cambian entre endpoints: por eso todo campo se lee con
dig(obj, *candidate_paths).
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
API_BASE = "https://api.luma.com"
ENDPOINT = "/discover/get-paginated-events"
PAGINATION_LIMIT = 50
MAX_EVENTS = 200
RATE_LIMIT_SECONDS = 1.0
MAX_RETRIES = 5
USER_AGENT = "GrowXth-Scraper/1.0 (+https://github.com/growxth; contact: mcavalie@kriptos.io)"

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
SEED_DIR = ROOT / "frontend" / "data" / "seed"

# Keywords para derivar stack cuando el evento no trae categories. Se buscan
# como palabra/substring sobre name + description (case-insensitive).
STACK_KEYWORDS = [
    "python", "ai", "agent", "llm", "rust", "infra", "devtools",
    "hackathon", "engineer", "data", "backend", "crypto", "security",
]

# Config por ciudad:
#   place_api_id   discover_place_api_id de Luma para esa ciudad.
#   bbox           (lat_min, lat_max, lng_min, lng_max) amplia, para confirmar
#                  "es de esta ciudad" cuando falta el campo city.
#   city_match     substring (lowercase) que se busca en el campo city.
#   neighborhoods  bboxes de barrios para venueArea; si un evento no cae en
#                  ninguno, venueArea queda null (no se inventa).
#   output_prefix  prefijo usado en todos los nombres de archivo de salida.
CITY_CONFIG = {
    "sf": {
        "display_name": "San Francisco",
        "place_api_id": "discplace-BDj7GNbGlsF7Cka",  # existing, verified 2026-07-23
        "bbox": (37.70, 37.83, -122.53, -122.35),  # lat_min, lat_max, lng_min, lng_max
        "city_match": "san francisco",
        "neighborhoods": [
            ("SoMa", 37.770, 37.789, -122.410, -122.393),
            ("Mission", 37.748, 37.770, -122.424, -122.406),
            ("FiDi", 37.789, 37.799, -122.404, -122.393),
            ("Hayes Valley", 37.772, 37.780, -122.430, -122.419),
        ],
        "output_prefix": "sf",
    },
    "nyc": {
        "display_name": "New York",
        # Observed source, do NOT change: extracted from https://lu.ma/nyc page HTML on
        # 2026-08-14 (only discplace id present, 21 occurrences) and verified against
        # api.luma.com/discover/get-paginated-events returning New York entries.
        "place_api_id": "discplace-Izx1rQVSh8njYpP",
        "bbox": (40.55, 40.95, -74.10, -73.70),
        "city_match": "new york",
        "neighborhoods": [
            ("Flatiron", 40.737, 40.746, -73.998, -73.980),
            ("SoHo", 40.718, 40.729, -74.008, -73.995),
            ("East Village", 40.720, 40.734, -73.995, -73.972),
            ("Chelsea", 40.737, 40.755, -74.012, -73.998),
            ("Midtown", 40.746, 40.772, -74.000, -73.958),
            ("Lower Manhattan", 40.700, 40.718, -74.020, -73.995),
            ("Williamsburg", 40.700, 40.725, -73.970, -73.935),
            ("Downtown Brooklyn", 40.688, 40.706, -74.000, -73.975),
            ("Long Island City", 40.735, 40.760, -73.965, -73.930),
        ],
        "output_prefix": "nyc",
    },
}


def paths_for(cfg):
    """Todos los paths de I/O para la ciudad activa (prefijo cfg['output_prefix'])."""
    prefix = cfg["output_prefix"]
    return {
        "raw": RAW_DIR / f"luma-{prefix}.json",
        "details": RAW_DIR / f"luma-{prefix}-details.json",
        "events": SEED_DIR / f"{prefix}-events.json",
        "communities": SEED_DIR / f"{prefix}-communities.json",
        "organizers": SEED_DIR / f"{prefix}-organizers.json",
        "source_meta": SEED_DIR / f"{prefix}-source-meta.json",
    }


# --------------------------------------------------------------------------- #
# dig: prueba varios paths y devuelve el primero que exista
# --------------------------------------------------------------------------- #
def dig(obj, *candidate_paths, default=None):
    """Prueba varios paths (dot-notation) y devuelve el primer valor no-None.

    Cada path es un string tipo "event.geo_address_info.city". Los segmentos
    enteros indexan listas ("hosts.0.name"). Si ningún path existe, `default`.
    """
    for path in candidate_paths:
        cur = obj
        ok = True
        for segment in path.split("."):
            if isinstance(cur, dict) and segment in cur:
                cur = cur[segment]
            elif isinstance(cur, list) and segment.lstrip("-").isdigit():
                idx = int(segment)
                if -len(cur) <= idx < len(cur):
                    cur = cur[idx]
                else:
                    ok = False
                    break
            else:
                ok = False
                break
        if ok and cur is not None:
            return cur
    return default


# --------------------------------------------------------------------------- #
# FASE 1 — extracción cruda
# --------------------------------------------------------------------------- #
def _get_with_retries(client, path, params):
    """GET con retries + backoff en 429/5xx. Devuelve el JSON de la respuesta."""
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = client.get(path, params=params)
        except httpx.HTTPError as exc:
            last_error = exc
            backoff = 2 ** attempt
            print(f"  network error ({exc}); retry en {backoff}s", file=sys.stderr)
            time.sleep(backoff)
            continue

        if resp.status_code == 429 or resp.status_code >= 500:
            retry_after = resp.headers.get("retry-after")
            backoff = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt
            print(f"  {resp.status_code}; retry en {backoff}s", file=sys.stderr)
            last_error = httpx.HTTPStatusError(f"status {resp.status_code}", request=resp.request, response=resp)
            time.sleep(backoff)
            continue

        resp.raise_for_status()
        return resp.json()

    raise RuntimeError(f"request a {path} falló tras {MAX_RETRIES} intentos: {last_error}")


def _request_page(client, cursor, place_api_id):
    """Una página del discover paginado."""
    params = {
        "discover_place_api_id": place_api_id,
        "pagination_limit": PAGINATION_LIMIT,
    }
    if cursor:
        params["pagination_cursor"] = cursor
    return _get_with_retries(client, ENDPOINT, params)


def phase1(cfg):
    entries = []
    cursor = None
    pages = 0
    place_api_id = cfg["place_api_id"]

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    with httpx.Client(base_url=API_BASE, headers=headers, timeout=30.0) as client:
        while len(entries) < MAX_EVENTS:
            data = _request_page(client, cursor, place_api_id)
            page_entries = dig(data, "entries", default=[]) or []
            entries.extend(page_entries)
            pages += 1
            has_more = bool(dig(data, "has_more", default=False))
            cursor = dig(data, "next_cursor", "pagination_cursor")
            print(f"  página {pages}: +{len(page_entries)} (total {len(entries)}), has_more={has_more}")
            if not has_more or not cursor:
                break
            time.sleep(RATE_LIMIT_SECONDS)

    entries = entries[:MAX_EVENTS]

    raw_path = paths_for(cfg)["raw"]
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": API_BASE + ENDPOINT,
        "discover_place_api_id": place_api_id,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "count": len(entries),
        "entries": entries,
    }
    raw_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nCrudo volcado a {raw_path} ({len(entries)} entries, {pages} páginas)")

    if entries:
        first = entries[0]
        print("\nSHAPE de la primera entry (key: tipo):")
        if isinstance(first, dict):
            for key, value in first.items():
                print(f"  {key}: {type(value).__name__}")
        else:
            print(f"  (entry no es dict, es {type(first).__name__})")
    else:
        print("\n(No llegaron entries — nada que mostrar.)")


# --------------------------------------------------------------------------- #
# FASE 1b — enriquecer por evento (GET /event/get)
# --------------------------------------------------------------------------- #
def phase1b(cfg):
    paths = paths_for(cfg)
    events_file = paths["events"]
    if not events_file.exists():
        print(f"Falta {events_file}. Corré phase1 + phase2 primero.", file=sys.stderr)
        sys.exit(1)

    events = json.loads(events_file.read_text(encoding="utf-8"))
    # El id es "evt-{api_id}"; recuperamos el api_id sacando el primer "evt-".
    api_ids = [e["id"][len("evt-"):] for e in events if isinstance(e.get("id"), str)]
    print(f"Enriqueciendo {len(api_ids)} eventos vía /event/get …")

    details = {}
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    with httpx.Client(base_url=API_BASE, headers=headers, timeout=30.0) as client:
        for i, api_id in enumerate(api_ids, 1):
            data = _get_with_retries(client, "/event/get", {"event_api_id": api_id})
            details[api_id] = data
            if i % 10 == 0 or i == len(api_ids):
                print(f"  {i}/{len(api_ids)}")
            if i < len(api_ids):
                time.sleep(RATE_LIMIT_SECONDS)

    details_path = paths["details"]
    details_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": API_BASE + "/event/get",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "count": len(details),
        "details": details,
    }
    details_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nCrudo volcado a {details_path} ({len(details)} detalles)")

    if details:
        first = next(iter(details.values()))
        print("\nKEYS de la primera respuesta /event/get:")
        if isinstance(first, dict):
            for key, value in first.items():
                print(f"  {key}: {type(value).__name__}")
        else:
            print(f"  (respuesta no es dict, es {type(first).__name__})")


# --------------------------------------------------------------------------- #
# FASE 2 — normalización al contrato
# --------------------------------------------------------------------------- #
def keyword_stack(*texts):
    """Deriva stack por keywords sobre los textos dados. [] si no matchea nada."""
    blob = " ".join(t for t in texts if isinstance(t, str)).lower()
    return [kw for kw in STACK_KEYWORDS if kw in blob]


def flatten_prosemirror(node, out=None):
    """Aplana el texto de un doc ProseMirror (description_mirror) a un string."""
    if out is None:
        out = []
    if isinstance(node, dict):
        if node.get("type") == "text" and isinstance(node.get("text"), str):
            out.append(node["text"])
        for child in node.get("content", []) or []:
            flatten_prosemirror(child, out)
    elif isinstance(node, list):
        for child in node:
            flatten_prosemirror(child, out)
    return " ".join(out)


def load_details(details_path):
    """Mapa api_id → respuesta de /event/get. {} si no existe el archivo."""
    if not details_path.exists():
        return {}
    raw = json.loads(details_path.read_text(encoding="utf-8"))
    return raw.get("details", {}) if isinstance(raw, dict) else {}


def extract_detail_fields(detail):
    """Campos de enriquecimiento de /event/get, con dig (paths no documentados).

    Nota verificada contra la respuesta real: capacity, subscriber_count y
    event_count NO los expone /event/get (0/64) → quedan null. categories viene
    top-level; la descripción vive en description_mirror (ProseMirror).
    """
    return {
        "capacity": dig(detail, "event.capacity", "capacity", "data.event.capacity"),
        "categories": normalize_categories(
            dig(detail, "categories", "event.categories", "event.tags", "data.event.categories", default=[])
        ),
        "description": flatten_prosemirror(
            dig(detail, "description_mirror", "event.description_mirror", "event.description")
        ),
        "subscriber_count": dig(detail, "calendar.subscriber_count", "event.calendar.subscriber_count",
                                "calendar.membership_count", "data.calendar.subscriber_count"),
        "event_count": dig(detail, "calendar.event_count", "event.calendar.event_count",
                           "data.calendar.event_count"),
    }
def slugify(text):
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").strip().lower()).strip("-")
    return slug or "unknown"


def neighborhood_of(lat, lng, neighborhoods):
    if lat is None or lng is None:
        return None
    for name, lat_min, lat_max, lng_min, lng_max in neighborhoods:
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            return name
    return None


def in_bbox(lat, lng, bbox):
    if lat is None or lng is None:
        return False
    lat_min, lat_max, lng_min, lng_max = bbox
    return lat_min <= lat <= lat_max and lng_min <= lng <= lng_max


def as_float(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def normalize_categories(raw):
    """categories puede ser lista de strings o de dicts {name}. → list[str]."""
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if isinstance(item, str):
            out.append(item)
        elif isinstance(item, dict):
            name = dig(item, "name", "label", "title")
            if isinstance(name, str):
                out.append(name)
    return out


def is_future(start_at):
    if not start_at:
        return False
    try:
        dt = datetime.fromisoformat(str(start_at).replace("Z", "+00:00"))
    except ValueError:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt > datetime.now(timezone.utc)


def extract_event_fields(entry):
    """Lee los campos que expone Luma con dig (paths no documentados)."""
    return {
        "api_id": dig(entry, "event.api_id", "api_id", "event.event_api_id"),
        "name": dig(entry, "event.name", "name"),
        "slug": dig(entry, "event.slug", "slug", "event.url"),
        "url": dig(entry, "event.url", "url"),
        "start_at": dig(entry, "event.start_at", "start_at"),
        "capacity": dig(entry, "event.capacity", "capacity"),
        "guest_count": dig(entry, "event.guest_count", "guest_count"),
        "is_online": dig(entry, "event.is_online", "is_online"),
        # Luma no expone is_online en discover; el online se marca en location_type.
        "location_type": dig(entry, "event.location_type", "location_type"),
        "city": dig(entry, "event.geo_address_info.city", "event.city", "city",
                    "event.geo_address_info.city_state"),
        "latitude": as_float(dig(entry, "event.coordinate.latitude", "event.geo_address_info.latitude",
                                 "event.latitude", "latitude", "geo_latitude")),
        "longitude": as_float(dig(entry, "event.coordinate.longitude", "event.geo_address_info.longitude",
                                  "event.longitude", "longitude", "geo_longitude")),
        "categories": normalize_categories(
            dig(entry, "event.categories", "categories", "event.tags", default=[])
        ),
        # calendar
        "calendar_api_id": dig(entry, "calendar.api_id", "hosting_calendar.api_id",
                               "event.calendar_api_id", "calendar_api_id"),
        "calendar_name": dig(entry, "calendar.name", "hosting_calendar.name", "calendar_name"),
        "calendar_slug": dig(entry, "calendar.slug", "hosting_calendar.slug", "calendar_slug"),
        "subscriber_count": dig(entry, "calendar.subscriber_count", "hosting_calendar.subscriber_count",
                                "calendar.membership_count"),
        "event_count": dig(entry, "calendar.event_count", "hosting_calendar.event_count"),
        # hosts
        "hosts": dig(entry, "hosts", "event.hosts", "calendar.hosts", default=[]) or [],
    }


def build_url(fields):
    if isinstance(fields["url"], str) and fields["url"].startswith("http"):
        return fields["url"]
    slug = fields["slug"]
    if isinstance(slug, str) and slug:
        return f"https://lu.ma/{slug}"
    return ""


def phase2(cfg):
    paths = paths_for(cfg)
    raw_path = paths["raw"]
    details_path = paths["details"]

    if not raw_path.exists():
        print(f"Falta {raw_path}. Corré phase1 primero.", file=sys.stderr)
        sys.exit(1)

    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    entries = raw.get("entries", []) if isinstance(raw, dict) else raw
    details_raw = json.loads(details_path.read_text(encoding="utf-8")) if details_path.exists() else {}
    details = details_raw.get("details", {}) if isinstance(details_raw, dict) else {}

    bbox = cfg["bbox"]
    neighborhoods = cfg["neighborhoods"]
    city_match = cfg["city_match"]

    events = []
    communities = {}
    organizers = {}
    seen_api_ids = set()
    dropped = {
        "no_api_id": 0, "duplicate": 0, "online": 0, "past": 0,
        "not_in_city": 0, "no_coords": 0, "outside_bbox": 0,
    }

    for entry in entries:
        f = extract_event_fields(entry)

        api_id = f["api_id"]
        if not api_id:
            dropped["no_api_id"] += 1
            continue
        if api_id in seen_api_ids:
            dropped["duplicate"] += 1
            continue

        loc_type = f["location_type"]
        is_online = f["is_online"] is True or (
            isinstance(loc_type, str) and loc_type.lower() in ("virtual", "online")
        )
        if is_online:
            dropped["online"] += 1
            continue
        if not is_future(f["start_at"]):
            dropped["past"] += 1
            continue

        city = f["city"]
        city_is_target = isinstance(city, str) and city_match in city.lower()
        if not city_is_target and not in_bbox(f["latitude"], f["longitude"], bbox):
            dropped["not_in_city"] += 1
            continue

        # SFEvent (lib/contracts/growxth.ts) exige lat/lng numéricos: sin coords
        # no se puede ubicar. No se inventan (0,0) — se descarta.
        if f["latitude"] is None or f["longitude"] is None:
            dropped["no_coords"] += 1
            continue

        # Rechazo estricto de coordenadas: aunque el texto de city haya
        # matcheado, si el punto cae fuera de la bbox de la ciudad activa se
        # descarta igual. Garantiza que todo evento sobreviviente tiene
        # lat/lng dentro de la bbox de esta ciudad.
        if not in_bbox(f["latitude"], f["longitude"], bbox):
            dropped["outside_bbox"] += 1
            continue

        seen_api_ids.add(api_id)
        event_id = f"evt-{api_id}"

        # Enriquecimiento de phase1b (si existe el detalle para este api_id).
        d = extract_detail_fields(details.get(api_id, {}))

        # stack ← categories si vienen; si no, derivado por keywords sobre
        # name + description. Sin match → [] (se va al fondo del ranking).
        cats = d["categories"] or f["categories"]
        event_stack = cats if cats else keyword_stack(f["name"], d["description"])

        # ---- Organizers (hosts) ----
        host_org_ids = []
        for host in f["hosts"]:
            host_name = dig(host, "name")
            if not host_name:
                continue
            org_id = f"org-{slugify(host_name)}"
            host_org_ids.append(org_id)
            if org_id not in organizers:
                organizers[org_id] = {
                    "id": org_id,
                    "displayName": host_name,
                    "publicRole": f"Host, {f['calendar_name']}" if f["calendar_name"] else "Host",
                    "publicContactUrl": dig(host, "website"),  # NADA de redes ni avatares
                    "organizesEventIds": [],
                    "communityIds": [],
                    "evidenceIds": [],
                }
            if event_id not in organizers[org_id]["organizesEventIds"]:
                organizers[org_id]["organizesEventIds"].append(event_id)

        # ---- Community (calendar) ----
        community_ids = []
        cal_id = f["calendar_api_id"]
        if cal_id:
            com_id = f"com-{cal_id}"
            community_ids.append(com_id)
            if com_id not in communities:
                cal_slug = f["calendar_slug"]
                communities[com_id] = {
                    "id": com_id,
                    "name": f["calendar_name"],
                    "url": f"https://lu.ma/{cal_slug}" if isinstance(cal_slug, str) and cal_slug else "",
                    "kind": "meetup-series",
                    "cadence": None,
                    "eventsRun12mo": d["event_count"] if d["event_count"] is not None else f["event_count"],
                    "foundedYear": None,
                    "sizeEstimate": d["subscriber_count"] if d["subscriber_count"] is not None else f["subscriber_count"],
                    "sizeBasis": "observed",
                    "stack": [],
                    "organizerIds": [],
                    "pastSponsors": [],
                    "evidenceIds": [],
                }
            else:
                # Comunidad ya creada por otro evento: completar counts si estaban null.
                com = communities[com_id]
                if com["sizeEstimate"] is None and d["subscriber_count"] is not None:
                    com["sizeEstimate"] = d["subscriber_count"]
                if com["eventsRun12mo"] is None and d["event_count"] is not None:
                    com["eventsRun12mo"] = d["event_count"]
            for org_id in host_org_ids:
                if org_id not in communities[com_id]["organizerIds"]:
                    communities[com_id]["organizerIds"].append(org_id)
                if com_id not in organizers[org_id]["communityIds"]:
                    organizers[org_id]["communityIds"].append(com_id)

        # expectedAttendance ← capacity si viene (de phase1b); si no, guest_count.
        capacity = d["capacity"] if d["capacity"] is not None else f["capacity"]
        expected_attendance = capacity if capacity is not None else f["guest_count"]

        events.append({
            "id": event_id,
            "name": f["name"],
            "url": build_url(f),
            "startsAt": f["start_at"],
            "venueArea": neighborhood_of(f["latitude"], f["longitude"], neighborhoods),
            "lat": f["latitude"],
            "lng": f["longitude"],
            "expectedAttendance": expected_attendance,
            # observed solo si Luma dio un número real; si no, estimated.
            "attendanceBasis": "observed" if expected_attendance is not None else "estimated",
            "stack": event_stack,
            "communityIds": community_ids,
            "organizerIds": host_org_ids,
            "sponsorTiers": [],
            "knownSponsors": [],
            "pastThemes": [],
            "evidenceIds": [],
        })

    SEED_DIR.mkdir(parents=True, exist_ok=True)
    _write_json(paths["events"], events)
    _write_json(paths["communities"], list(communities.values()))
    _write_json(paths["organizers"], list(organizers.values()))
    _write_json(paths["source_meta"], {
        "source": raw.get("source", API_BASE + ENDPOINT) if isinstance(raw, dict) else API_BASE + ENDPOINT,
        "fetchedAt": (
            details_raw.get("fetched_at")
            or (raw.get("fetched_at") if isinstance(raw, dict) else None)
            or datetime.now(timezone.utc).isoformat()
        ),
    })

    print(f"Escritos en {SEED_DIR}:")
    print(f"  {paths['events'].name}       {len(events)}")
    print(f"  {paths['communities'].name}  {len(communities)}")
    print(f"  {paths['organizers'].name}   {len(organizers)}")
    print(f"Descartados: {dropped}")


def _write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- #
def main():
    parser = argparse.ArgumentParser(description="Scraper de eventos de Luma (multi-ciudad).")
    parser.add_argument("phase", choices=["phase1", "phase1b", "phase2"], help="fase a correr")
    parser.add_argument(
        "--city", required=True, choices=sorted(CITY_CONFIG.keys()), help="ciudad a scrapear"
    )
    args = parser.parse_args()
    cfg = CITY_CONFIG[args.city]
    print(f"Ciudad activa: {cfg['display_name']} ({args.city})")

    if args.phase == "phase1":
        phase1(cfg)
    elif args.phase == "phase1b":
        phase1b(cfg)
    else:
        phase2(cfg)


if __name__ == "__main__":
    main()
