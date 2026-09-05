"""Adult-content detection by Rakuten genre id prefix and NG words."""

from __future__ import annotations

import unicodedata

from .models import RakutenItem
from .tagger import TagRules, load_tag_rules


def _fold(text: str) -> str:
    return unicodedata.normalize("NFKC", text).casefold()


def is_adult(item: RakutenItem, rules: TagRules | None = None) -> bool:
    """True when a genre id starts with an adult genre prefix or an NG word appears
    in the title/caption. Both lists come from ``tag_rules.yaml`` and may be empty.
    """
    rules = rules or load_tag_rules()
    for prefix in rules.adult_genre_ids:
        if any(genre_id.startswith(prefix) for genre_id in item.genre_ids):
            return True
    if not rules.adult_ng_words:
        return False
    haystack = _fold(f"{item.title} {item.caption or ''}")
    return any(_fold(word) in haystack for word in rules.adult_ng_words if word)
