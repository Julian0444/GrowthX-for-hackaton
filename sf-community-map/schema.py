"""Canonical schema for the GrowXth SF community layer.

Implements §1 (Community entity) and the §2.5 review-queue Candidate of
SF_COMMUNITY_MAP_CLAUDE_CODE_BRIEF.md, plus the hard guardrails from
GROWTH_ATLAS_DATA_PIPELINE_RESEARCH.md §12 (no-go list / controls):

  * Entities are ORGANIZATIONS / EVENT SERIES / hacker houses / organizers.
    NEVER individual people  -> is_person() guardrail.
  * rights_basis is mandatory on 100% of records (fixed vocabulary).
  * No record without canonical_url + at least one evidence URL.
  * typical_size / sponsor_open / cadence stay None unless directly observed
    (no unlabeled estimates).

Pure stdlib. No network, no secrets, no I/O beyond (de)serialization helpers.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any, Optional
from urllib.parse import urlsplit, urlunsplit

# --------------------------------------------------------------------------- #
# Controlled vocabularies (brief §1 + research §12)
# --------------------------------------------------------------------------- #

# Community.type  (brief §1)
COMMUNITY_TYPES: frozenset[str] = frozenset(
    {"club", "event_series", "hacker_house", "dao", "meetup", "accelerator", "coworking"}
)

# rights_basis  (brief §1 vocab -- note: no licensed_aggregator in this layer)
RIGHTS_BASES: frozenset[str] = frozenset(
    {"official_api", "organizer_authorized", "public_feed_with_permission", "research_only"}
)

# Community.source  (brief §1)
SOURCES: frozenset[str] = frozenset(
    {"curation", "places_api", "custom_search", "organizer_submitted", "ics_feed"}
)

# Candidate.source_vector  (brief §2.5 discovery vectors)
SOURCE_VECTORS: frozenset[str] = frozenset(
    {"co_host_graph", "custom_search", "meetup_graphql", "curated_list"}
)

# Community.cadence  (brief §1)
CADENCES: frozenset[str] = frozenset(
    {"weekly", "monthly", "quarterly", "ad-hoc", "unknown"}
)

# Platform keys allowed inside Community.platforms{}  (brief §1)
PLATFORM_KEYS: frozenset[str] = frozenset(
    {"luma", "meetup", "eventbrite", "site", "ics_feed"}
)

# The one city this layer covers for v1 (brief §1: city_id "us-san-francisco").
SF_CITY_ID = "us-san-francisco"


class SchemaError(ValueError):
    """Raised when a record violates a mandatory guardrail."""


# --------------------------------------------------------------------------- #
# Time + URL + name normalization helpers
# --------------------------------------------------------------------------- #

def utc_now_iso() -> str:
    """Current UTC time as an ISO-8601 string (seconds precision, Z suffix)."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


_TRACKING_PREFIXES = ("utm_", "fbclid", "gclid", "mc_", "ref", "ref_src", "s", "igshid")


def normalize_url(url: str) -> str:
    """Canonicalize a URL for dedup.

    Lowercases scheme+host, drops ``www.``, strips tracking query params and
    fragments, and removes a trailing slash on the path. Raises SchemaError on
    an empty / obviously non-http URL so callers never persist a blank
    canonical_url (brief §4: 0 records without canonical_url).
    """
    if not url or not url.strip():
        raise SchemaError("empty url")
    parts = urlsplit(url.strip())
    scheme = (parts.scheme or "https").lower()
    if scheme not in ("http", "https"):
        raise SchemaError(f"non-http url: {url!r}")
    host = parts.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    if not host:
        raise SchemaError(f"url without host: {url!r}")
    kept = [
        (k, v)
        for k, v in _parse_qsl(parts.query)
        if not any(k.lower() == p or k.lower().startswith("utm_") for p in _TRACKING_PREFIXES)
    ]
    query = "&".join(f"{k}={v}" for k, v in kept)
    path = parts.path.rstrip("/") or ""
    return urlunsplit((scheme, host, path, query, ""))


def _parse_qsl(query: str) -> list[tuple[str, str]]:
    if not query:
        return []
    out: list[tuple[str, str]] = []
    for pair in query.split("&"):
        if not pair:
            continue
        k, _, v = pair.partition("=")
        out.append((k, v))
    return out


def slugify(name: str, prefix: str = "sf") -> str:
    """Stable, human-readable slug for community_id, e.g. 'sf-cerebral-valley'."""
    base = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    base = re.sub(r"-{2,}", "-", base)
    return f"{prefix}-{base}" if base else f"{prefix}-{_short_hash(name)}"


def _short_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def normalize_name(name: str) -> str:
    """Lowercase, collapse whitespace, strip common org suffixes for fuzzy match."""
    n = re.sub(r"\s+", " ", name.strip().lower())
    n = re.sub(r"[.,]", "", n)
    n = re.sub(r"\b(inc|llc|ltd|the|sf|san francisco)\b", "", n).strip()
    return re.sub(r"\s+", " ", n)


def name_similarity(a: str, b: str) -> float:
    """Fuzzy similarity in [0,1] between two names (stdlib difflib)."""
    return SequenceMatcher(None, normalize_name(a), normalize_name(b)).ratio()


# --------------------------------------------------------------------------- #
# is_person() guardrail  (brief hard rule / research §12 no-go)
# --------------------------------------------------------------------------- #

# Tokens that strongly signal an organization / event series (never a person).
# Includes place/geography tail words ("valley", "park", ...) because many org
# names are "<Word> Valley/Park/Street" and would otherwise read as First Last.
_ORG_SIGNALS = (
    "club", "meetup", "community", "collective", "society", "group", "network",
    "hub", "house", "dao", "foundation", "accelerator", "labs", "lab", "ventures",
    "vc", "hackathon", "hack", "summit", "conference", "conf", "forum", "guild",
    "council", "association", "coworking", "space", "campus", "school", "academy",
    "institute", "coalition", "alliance", "chapter", "inc", "llc", "co", "corp",
    "studio", "works", "office hours", "demo day", "builders", "builder", "founders",
    "ai", "ml", "devs", "developers", "engineers", "startup", "startups", "week",
    "day", "nights", "night", "series", "sessions", "&",
    # place / geography tails
    "valley", "park", "street", "bay", "hill", "hills", "square", "garden",
    "gardens", "heights", "mission", "wharf", "gate", "harbor", "beach", "city",
)

_HONORIFICS = ("mr", "mrs", "ms", "dr", "prof", "sir", "señor", "sr", "sra")

# Common given names (EN/ES/PT — the taxonomy's languages). Used ONLY to raise
# confidence that a 2-3 word capitalized string is a personal name. Deliberately
# small and precision-oriented: an unrecognized name is left for human review,
# never auto-discarded, so a valid org is never silently dropped (brief §2.5/§4).
_GIVEN_NAMES = frozenset({
    "james", "john", "robert", "michael", "william", "david", "richard", "joseph",
    "thomas", "charles", "daniel", "matthew", "andrew", "mark", "paul", "steven",
    "kevin", "brian", "george", "edward", "ronald", "anthony", "kenneth", "josh",
    "joshua", "ryan", "jacob", "gary", "nicholas", "eric", "jonathan", "stephen",
    "larry", "justin", "scott", "brandon", "benjamin", "samuel", "raymond", "patrick",
    "jack", "dennis", "jerry", "tyler", "aaron", "jose", "adam", "nathan", "henry",
    "elon", "sam", "peter", "alex", "chris", "tim", "tom", "mike", "dan", "ben",
    "mary", "patricia", "jennifer", "linda", "elizabeth", "barbara", "susan",
    "jessica", "sarah", "karen", "nancy", "lisa", "betty", "margaret", "sandra",
    "ashley", "kimberly", "emily", "donna", "michelle", "carol", "amanda", "melissa",
    "deborah", "stephanie", "rebecca", "laura", "sharon", "cynthia", "kathleen",
    "amy", "shirley", "angela", "helen", "anna", "brenda", "pamela", "nicole",
    "emma", "samantha", "katherine", "christine", "jane", "julia", "grace",
    # ES / PT common given names
    "juan", "carlos", "luis", "miguel", "javier", "pedro", "pablo", "diego",
    "sofia", "sofía", "maria", "maría", "ana", "lucia", "lucía", "camila",
    "mateo", "santiago", "sebastian", "sebastián", "joão", "joao", "rafael",
    "gabriel", "bruno", "felipe", "gustavo", "rodrigo", "matheus", "lucas",
    "beatriz", "isabela", "larissa", "fernanda", "camille", "miranda",
})

# Personal social profile URL patterns (a person, not an org page).
_PERSONAL_URL_RE = re.compile(
    r"(linkedin\.com/in/|twitter\.com/(?!.*(club|labs|hq|official))|x\.com/(?!.*(club|labs|hq|official)))",
    re.IGNORECASE,
)


def is_person(name: str, url: Optional[str] = None) -> bool:
    """Best-effort guardrail: True if ``name``/``url`` looks like an individual.

    Conservative on the org side: any org signal token => not a person. Flags
    bare 'Firstname Lastname' (optionally with honorific / middle initial),
    possessives of a single personal name, and personal social-profile URLs.
    Callers must DISCARD anything this flags; it never enters the store.
    """
    if not name or not name.strip():
        return False  # nothing to judge; let required-field validation reject it
    raw = name.strip()
    lowered = raw.lower()

    if url and _PERSONAL_URL_RE.search(url):
        # A personal profile URL only overrides if no org signal is present.
        if not any(sig in lowered for sig in _ORG_SIGNALS):
            return True

    if any(re.search(rf"\b{re.escape(sig)}\b", lowered) for sig in _ORG_SIGNALS):
        return False

    # Email address as a "name" -> a person.
    if "@" in raw and " " not in raw:
        return True

    tokens = raw.split()

    if tokens and tokens[0].lower().rstrip(".") in _HONORIFICS:
        return True

    # Possessive of a recognized given name: "Jane's ..." / "Sarah's List".
    poss = re.match(r"([A-Z][a-z]+)'s\b", raw)
    if poss and poss.group(1).lower() in _GIVEN_NAMES:
        return True

    # 2-3 capitalized alphabetic tokens, no digits, first token a known given
    # name -> personal name. Unknown first tokens are LEFT for human review
    # (precision over recall) so real orgs like "Cerebral Valley" survive.
    if 2 <= len(tokens) <= 3 and not any(ch.isdigit() for ch in raw):
        def looks_name(tok: str) -> bool:
            t = tok.rstrip(".")
            return bool(re.fullmatch(r"[A-Z][a-z]+|[A-Z]", t))  # word or middle initial
        if all(looks_name(t) for t in tokens) and tokens[0].lower() in _GIVEN_NAMES:
            return True

    return False


# --------------------------------------------------------------------------- #
# Candidate  (review queue -- brief §2.5)
# --------------------------------------------------------------------------- #

@dataclass
class Candidate:
    """An automatically discovered candidate awaiting human review.

    Lives in store/candidates.jsonl (append-only). NEVER auto-promoted to a
    Community; a human confirms `type`, dedup and `rights_basis` first
    (brief §2.5 / §4).
    """

    name: str
    canonical_url: str                 # normalized; required (brief §4)
    evidence_url: str                  # the discovery source link; required (brief §4)
    source_vector: str                 # SOURCE_VECTORS, e.g. "custom_search"
    discovered_via: str                # the query, or the community id that surfaced it
    rights_basis: str = "research_only"  # default for discovery; reviewer upgrades
    needs_review: bool = True
    source: str = "custom_search"      # Community.source enum this maps to
    candidate_id: str = ""             # stable hash of canonical_url (auto)
    raw_title: Optional[str] = None
    raw_snippet: Optional[str] = None
    observed_at: str = field(default_factory=utc_now_iso)
    fetched_at: str = field(default_factory=utc_now_iso)

    # Optional geo enrichment (filled idempotently by places_enrich).
    place_id: Optional[str] = None
    formatted_address: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    geo_confidence: Optional[float] = None
    city_id: Optional[str] = None

    promoted: bool = False             # set True only when a human promotes it

    def __post_init__(self) -> None:
        self.canonical_url = normalize_url(self.canonical_url)
        if not self.candidate_id:
            self.candidate_id = _short_hash(self.canonical_url)
        validate_candidate(self)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Candidate":
        allowed = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in data.items() if k in allowed})


# --------------------------------------------------------------------------- #
# Community  (canonical entity -- brief §1)
# --------------------------------------------------------------------------- #

@dataclass
class Community:
    """Canonical community record (brief §1).

    Enters store/communities.jsonl ONLY through manual review -- no connector
    writes here directly (brief §4).
    """

    name: str
    type: str                          # COMMUNITY_TYPES
    canonical_url: str                 # normalized; required
    rights_basis: str                  # RIGHTS_BASES; required
    source: str                        # SOURCES
    evidence_ids: list[str]            # -> raw_evidence urls; >= 1 required
    community_id: str = ""             # stable slug (auto from name if empty)
    city_id: str = SF_CITY_ID

    lat: Optional[float] = None
    lon: Optional[float] = None
    geo_confidence: Optional[float] = None
    place_id: Optional[str] = None     # cached Places id (idempotency)

    tech_tags: list[str] = field(default_factory=list)
    audience_tags: list[str] = field(default_factory=list)

    # Observed-only fields: None unless directly observed (brief §1 rule).
    cadence: Optional[str] = None      # CADENCES
    typical_size: Optional[str] = None
    sponsor_open: Optional[bool] = None

    platforms: dict[str, str] = field(default_factory=dict)  # PLATFORM_KEYS -> URL

    observed_at: str = field(default_factory=utc_now_iso)
    last_verified_at: str = field(default_factory=utc_now_iso)

    # Provenance carried from the Candidate that seeded this record.
    discovered_via: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None

    def __post_init__(self) -> None:
        self.canonical_url = normalize_url(self.canonical_url)
        if not self.community_id:
            self.community_id = slugify(self.name)
        validate_community(self)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Community":
        allowed = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in data.items() if k in allowed})

    @classmethod
    def from_candidate(cls, cand: "Candidate", *, type: str, reviewed_by: str,
                       rights_basis: Optional[str] = None, **overrides: Any) -> "Community":
        """Promote a reviewed Candidate into a canonical Community.

        Intended to be called by the manual-review tool, never a connector.
        """
        data: dict[str, Any] = {
            "name": cand.name,
            "type": type,
            "canonical_url": cand.canonical_url,
            "rights_basis": rights_basis or cand.rights_basis,
            "source": cand.source,
            "evidence_ids": [cand.evidence_url],
            "place_id": cand.place_id,
            "lat": cand.lat,
            "lon": cand.lon,
            "geo_confidence": cand.geo_confidence,
            "city_id": cand.city_id or SF_CITY_ID,
            "discovered_via": cand.discovered_via,
            "reviewed_by": reviewed_by,
            "reviewed_at": utc_now_iso(),
        }
        data.update(overrides)
        return cls(**data)


# --------------------------------------------------------------------------- #
# Validation  (enforces the brief §4 acceptance criteria)
# --------------------------------------------------------------------------- #

def _require_url(value: str, field_name: str) -> None:
    if not value or not str(value).strip():
        raise SchemaError(f"{field_name} is required and non-empty (brief §4)")


def validate_candidate(c: Candidate) -> None:
    _require_url(c.canonical_url, "canonical_url")
    _require_url(c.evidence_url, "evidence_url")
    if c.rights_basis not in RIGHTS_BASES:
        raise SchemaError(f"rights_basis {c.rights_basis!r} not in {sorted(RIGHTS_BASES)}")
    if c.source_vector not in SOURCE_VECTORS:
        raise SchemaError(f"source_vector {c.source_vector!r} not in {sorted(SOURCE_VECTORS)}")
    if c.source not in SOURCES:
        raise SchemaError(f"source {c.source!r} not in {sorted(SOURCES)}")
    if is_person(c.name, c.canonical_url):
        raise SchemaError(f"candidate looks like a person, discarded: {c.name!r}")
    if not c.needs_review and not c.promoted:
        raise SchemaError("needs_review may only be cleared by promotion (brief §4)")


def validate_community(c: Community) -> None:
    _require_url(c.canonical_url, "canonical_url")
    if not c.evidence_ids or not any(str(e).strip() for e in c.evidence_ids):
        raise SchemaError("community needs >=1 evidence url (brief §4)")
    if c.type not in COMMUNITY_TYPES:
        raise SchemaError(f"type {c.type!r} not in {sorted(COMMUNITY_TYPES)}")
    if c.rights_basis not in RIGHTS_BASES:
        raise SchemaError(f"rights_basis {c.rights_basis!r} not in {sorted(RIGHTS_BASES)}")
    if c.source not in SOURCES:
        raise SchemaError(f"source {c.source!r} not in {sorted(SOURCES)}")
    if c.cadence is not None and c.cadence not in CADENCES:
        raise SchemaError(f"cadence {c.cadence!r} not in {sorted(CADENCES)}")
    if c.platforms:
        bad = set(c.platforms) - PLATFORM_KEYS
        if bad:
            raise SchemaError(f"unknown platform keys: {sorted(bad)}")
    if is_person(c.name, c.canonical_url):
        raise SchemaError(f"community looks like a person, rejected: {c.name!r}")
