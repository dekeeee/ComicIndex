"""Volume -> series grouping driven by ``shared/series-rules.json``.

The regex rules are shared with the TypeScript side (``_shared/series.ts``) and
must not be duplicated in code.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable

from . import config
from .models import RakutenItem, Volume, Work
from .rakuten_client import parse_sales_date

_SPACES = re.compile(r"\s+")
_AUTHOR_SEPARATOR = re.compile(config.AUTHOR_SEPARATOR_PATTERN)


@dataclass(frozen=True)
class SeriesRules:
    volume_patterns: tuple[re.Pattern[str], ...]
    strip_patterns: tuple[re.Pattern[str], ...]
    fullwidth_to_halfwidth: bool
    collapse_spaces: bool
    trim: bool
    lowercase_ascii: bool


@lru_cache(maxsize=None)
def _load_rules_cached(path: str) -> SeriesRules:
    with open(path, encoding="utf-8") as handle:
        raw = json.load(handle)
    normalize = raw.get("normalize", {})
    return SeriesRules(
        volume_patterns=tuple(re.compile(pattern) for pattern in raw.get("volume_patterns", [])),
        strip_patterns=tuple(re.compile(pattern) for pattern in raw.get("strip_patterns", [])),
        fullwidth_to_halfwidth=bool(normalize.get("fullwidth_to_halfwidth", True)),
        collapse_spaces=bool(normalize.get("collapse_spaces", True)),
        trim=bool(normalize.get("trim", True)),
        lowercase_ascii=bool(normalize.get("lowercase_ascii", True)),
    )


def load_series_rules(path: Path | None = None) -> SeriesRules:
    return _load_rules_cached(str(path or config.series_rules_path()))


def strip_decorations(title: str, rules: SeriesRules | None = None) -> str:
    """Remove bracketed labels such as ``【電子版】`` / ``（完）`` / edition suffixes."""
    rules = rules or load_series_rules()
    text = title
    for pattern in rules.strip_patterns:
        text = pattern.sub("", text)
    return text


def extract_volume(title: str, rules: SeriesRules | None = None) -> int | None:
    """Volume number found at the end of the (decoration-stripped) title."""
    rules = rules or load_series_rules()
    base = strip_decorations(title, rules)
    for pattern in rules.volume_patterns:
        match = pattern.search(base)
        if match:
            return int(unicodedata.normalize("NFKC", match.group(1)))
    return None


def strip_volume(title: str, rules: SeriesRules | None = None) -> str:
    """Decoration-stripped title with the volume suffix removed (not normalized)."""
    rules = rules or load_series_rules()
    base = strip_decorations(title, rules)
    for pattern in rules.volume_patterns:
        match = pattern.search(base)
        if match:
            return base[: match.start()]
    return base


def _finish(text: str, rules: SeriesRules, lowercase: bool) -> str:
    if rules.fullwidth_to_halfwidth:
        text = unicodedata.normalize("NFKC", text)
    if rules.collapse_spaces:
        text = _SPACES.sub(" ", text)
    if rules.trim:
        text = text.strip()
    if lowercase and rules.lowercase_ascii:
        text = "".join(ch.lower() if ch.isascii() else ch for ch in text)
    return text


def normalize_title(title: str, rules: SeriesRules | None = None) -> str:
    """Comparison form: decorations stripped, NFKC, spaces collapsed, ASCII lowered."""
    rules = rules or load_series_rules()
    return _finish(strip_decorations(title, rules), rules, lowercase=True)


def series_title(title: str, rules: SeriesRules | None = None) -> str:
    """Display form of the series name (volume removed, case preserved)."""
    rules = rules or load_series_rules()
    return _finish(strip_volume(title, rules), rules, lowercase=False)


def split_authors(author: str, rules: SeriesRules | None = None) -> list[str]:
    """Split Rakuten's ``author`` field (``A/B``) into display names."""
    rules = rules or load_series_rules()
    names = [_finish(part, rules, lowercase=False) for part in _AUTHOR_SEPARATOR.split(author)]
    return [name for name in names if name]


def normalize_author(name: str, rules: SeriesRules | None = None) -> str:
    rules = rules or load_series_rules()
    return _finish(name, rules, lowercase=True)


def series_key(item: RakutenItem, rules: SeriesRules | None = None) -> str:
    """Stable key: normalized volume-less title + primary author."""
    rules = rules or load_series_rules()
    title_part = _finish(strip_volume(item.title, rules), rules, lowercase=True)
    authors = split_authors(item.author, rules)
    author_part = normalize_author(authors[0], rules) if authors else ""
    return f"{title_part}{config.SERIES_KEY_SEPARATOR}{author_part}"


def make_slug(key: str) -> str:
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return f"{config.SLUG_PREFIX}{digest[: config.SLUG_HASH_LENGTH]}"


def group_volumes(items: Iterable[RakutenItem], rules: SeriesRules | None = None) -> list[Work]:
    """Group volumes by ``series_key`` into ``Work`` objects (order preserved)."""
    rules = rules or load_series_rules()
    groups: dict[str, list[tuple[RakutenItem, int | None]]] = {}
    seen_codes: set[str] = set()
    for item in items:
        if item.item_code in seen_codes:
            continue
        seen_codes.add(item.item_code)
        key = series_key(item, rules)
        groups.setdefault(key, []).append((item, extract_volume(item.title, rules)))

    works: list[Work] = []
    for key, members in groups.items():
        works.append(_build_work(key, members, rules))
    return works


def _build_work(key: str, members: list[tuple[RakutenItem, int | None]], rules: SeriesRules) -> Work:
    representative, _ = min(
        members,
        key=lambda pair: (pair[1] is None, pair[1] if pair[1] is not None else 0),
    )
    all_numbered = all(volume is not None for _, volume in members)
    confidence = (
        config.SERIES_CONFIDENCE_HIGH
        if all_numbered or len(members) == 1
        else config.SERIES_CONFIDENCE_LOW
    )
    volumes = [
        Volume(
            rakuten_item_code=item.item_code,
            work_key=key,
            volume_no=volume,
            title_raw=item.title,
            isbn=item.isbn,
            sales_date=parse_sales_date(item.sales_date),
            affiliate_url=item.affiliate_url,
        )
        for item, volume in members
    ]
    sales_dates = [volume.sales_date for volume in volumes if volume.sales_date is not None]
    genre_ids: list[str] = []
    for item, _ in members:
        for genre_id in item.genre_ids:
            if genre_id not in genre_ids:
                genre_ids.append(genre_id)
    return Work(
        rakuten_series_key=key,
        slug=make_slug(key),
        title=series_title(representative.title, rules),
        title_kana=representative.title_kana,
        authors=split_authors(representative.author, rules),
        publisher=representative.publisher,
        synopsis=representative.caption,
        cover_url=representative.image_url,
        first_sales_date=min(sales_dates) if sales_dates else None,
        volume_count=len(members),
        affiliate_url_rakuten=representative.affiliate_url,
        is_adult=False,
        series_confidence=confidence,
        volumes=volumes,
        genre_ids=genre_ids,
    )
