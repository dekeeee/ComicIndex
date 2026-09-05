"""Automatic tagging: Rakuten genre map + keyword rules from ``tag_rules.yaml``."""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping, Sequence

import yaml

from . import config
from .models import Tag, Work, WorkTag


@dataclass(frozen=True)
class KeywordRule:
    match: tuple[str, ...]
    tag: Tag


@dataclass(frozen=True)
class TagRules:
    genre_map: Mapping[str, Tag]
    adult_genre_ids: tuple[str, ...]
    adult_ng_words: tuple[str, ...]
    keyword_rules: tuple[KeywordRule, ...]


def _parse_tag(raw: Mapping[str, Any], context: str) -> Tag:
    try:
        return Tag(slug=str(raw["slug"]), name=str(raw["name"]), category=str(raw["category"]))
    except KeyError as exc:
        raise ValueError(f"tag_rules.yaml: {context} is missing {exc}") from exc


def _parse_rules(raw: Mapping[str, Any]) -> TagRules:
    genre_map = {
        str(genre_id): _parse_tag(tag, f"genre_map[{genre_id}]")
        for genre_id, tag in (raw.get("genre_map") or {}).items()
    }
    keyword_rules = tuple(
        KeywordRule(
            match=tuple(str(word) for word in rule.get("match", []) if str(word)),
            tag=_parse_tag(rule, f"keyword_rules[{index}]"),
        )
        for index, rule in enumerate(raw.get("keyword_rules") or [])
    )
    return TagRules(
        genre_map=genre_map,
        adult_genre_ids=tuple(str(value) for value in raw.get("adult_genre_ids") or []),
        adult_ng_words=tuple(str(value) for value in raw.get("adult_ng_words") or []),
        keyword_rules=keyword_rules,
    )


@lru_cache(maxsize=None)
def _load_rules_cached(path: str) -> TagRules:
    with open(path, encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}
    if not isinstance(raw, Mapping):
        raise ValueError(f"tag_rules.yaml: expected a mapping at top level ({path})")
    return _parse_rules(raw)


def load_tag_rules(path: Path | None = None) -> TagRules:
    return _load_rules_cached(str(path or config.TAG_RULES_PATH))


def _fold(text: str) -> str:
    return unicodedata.normalize("NFKC", text).casefold()


def tags_for_text(
    work_key: str,
    title: str,
    synopsis: str | None,
    genre_ids: Sequence[str],
    rules: TagRules | None = None,
) -> list[WorkTag]:
    """Genre tags (weight 1.0) + keyword tags (weight 0.6), deduplicated by
    ``(slug, category)`` keeping the highest weight. Pass an empty ``genre_ids``
    to run keyword rules only (e.g. user-registered works without genre data).
    """
    rules = rules or load_tag_rules()
    best: dict[tuple[str, str], WorkTag] = {}

    def offer(tag: Tag, weight: float) -> None:
        key = (tag.slug, tag.category)
        current = best.get(key)
        if current is None or weight > current.weight:
            best[key] = WorkTag(
                work_key=work_key,
                tag_slug=tag.slug,
                category=tag.category,
                weight=weight,
                tag_name=tag.name,
            )

    for genre_id in genre_ids:
        for prefix, tag in rules.genre_map.items():
            if genre_id.startswith(prefix):
                offer(tag, config.GENRE_TAG_WEIGHT)

    haystack = _fold(f"{title} {synopsis or ''}")
    for rule in rules.keyword_rules:
        if any(_fold(word) in haystack for word in rule.match):
            offer(rule.tag, config.KEYWORD_TAG_WEIGHT)

    return sorted(best.values(), key=lambda tag: (-tag.weight, tag.category, tag.tag_slug))


def tags_for_work(work: Work, rules: TagRules | None = None) -> list[WorkTag]:
    """Tags for an ingested ``Work`` (genre map + keyword rules)."""
    return tags_for_text(work.rakuten_series_key, work.title, work.synopsis, work.genre_ids, rules)
