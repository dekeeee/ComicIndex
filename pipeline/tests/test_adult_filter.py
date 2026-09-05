from __future__ import annotations

from comicomi_pipeline.adult_filter import is_adult
from comicomi_pipeline.tagger import TagRules, load_tag_rules
from tests.conftest import make_item

RULES = TagRules(
    genre_map={},
    adult_genre_ids=("001001099",),
    adult_ng_words=("成年コミック", "r18"),
    keyword_rules=(),
)
EMPTY_RULES = TagRules(genre_map={}, adult_genre_ids=(), adult_ng_words=(), keyword_rules=())


def test_genre_prefix_match() -> None:
    assert is_adult(make_item("作品", genre_ids=["001001099001"]), RULES)
    assert not is_adult(make_item("作品", genre_ids=["001001001"]), RULES)
    assert not is_adult(make_item("作品", genre_ids=[]), RULES)


def test_ng_word_in_title_or_caption_is_case_and_width_insensitive() -> None:
    assert is_adult(make_item("作品【成年コミック】"), RULES)
    assert is_adult(make_item("作品", caption="Ｒ１８指定"), RULES)
    assert is_adult(make_item("作品", caption="R18 only"), RULES)
    assert not is_adult(make_item("作品", caption="全年齢向け"), RULES)


def test_empty_rules_never_flag() -> None:
    assert not is_adult(make_item("成年コミック", genre_ids=["001001099"]), EMPTY_RULES)


def test_bundled_rules_flag_obvious_ng_words() -> None:
    rules = load_tag_rules()
    assert is_adult(make_item("作品", caption="成人向けコミック"), rules)
    assert not is_adult(make_item("鬼滅の刃（1）", caption="時は大正。"), rules)
