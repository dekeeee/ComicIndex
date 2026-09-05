from __future__ import annotations

from comicomi_pipeline import config
from comicomi_pipeline.models import Tag, Work
from comicomi_pipeline.tagger import KeywordRule, TagRules, load_tag_rules, tags_for_work


def make_work(title: str, synopsis: str | None, genre_ids: list[str]) -> Work:
    return Work(
        rakuten_series_key=f"{title}|author",
        slug="w-0000000000",
        title=title,
        title_kana=None,
        authors=["author"],
        publisher=None,
        synopsis=synopsis,
        cover_url=None,
        first_sales_date=None,
        volume_count=1,
        affiliate_url_rakuten="https://example.com",
        is_adult=False,
        series_confidence=1.0,
        volumes=[],
        genre_ids=genre_ids,
    )


RULES = TagRules(
    genre_map={
        "001001001": Tag("shonen", "少年", "genre"),
        "001001002": Tag("shojo", "少女", "genre"),
    },
    adult_genre_ids=(),
    adult_ng_words=(),
    keyword_rules=(
        KeywordRule(match=("異世界", "転生"), tag=Tag("isekai", "異世界", "theme")),
        KeywordRule(match=("学園", "高校"), tag=Tag("school", "学園", "setting")),
        KeywordRule(match=("少年",), tag=Tag("shonen", "少年", "genre")),
    ),
)


def test_genre_map_matches_by_prefix_with_full_weight() -> None:
    work = make_work("タイトル", None, ["001001001005", "001001002"])
    tags = tags_for_work(work, RULES)
    assert {(tag.tag_slug, tag.category) for tag in tags} == {("shonen", "genre"), ("shojo", "genre")}
    assert all(tag.weight == config.GENRE_TAG_WEIGHT for tag in tags)
    assert all(tag.work_key == work.rakuten_series_key for tag in tags)
    assert {tag.tag_name for tag in tags} == {"少年", "少女"}


def test_keyword_rules_multi_match_is_deduplicated() -> None:
    work = make_work("異世界転生した高校生", "転生して異世界の学園へ", [])
    tags = tags_for_work(work, RULES)
    slugs = [tag.tag_slug for tag in tags]
    assert sorted(slugs) == ["isekai", "school"]
    assert all(tag.weight == config.KEYWORD_TAG_WEIGHT for tag in tags)


def test_genre_weight_wins_over_keyword_for_same_tag() -> None:
    work = make_work("少年の物語", None, ["001001001"])
    tags = tags_for_work(work, RULES)
    assert len(tags) == 1
    assert tags[0].tag_slug == "shonen"
    assert tags[0].weight == config.GENRE_TAG_WEIGHT


def test_no_match_gives_no_tags() -> None:
    assert tags_for_work(make_work("無題", "特に何も", ["999"]), RULES) == []


def test_bundled_rules_file_loads_and_matches() -> None:
    rules = load_tag_rules()
    assert rules.genre_map
    assert len(rules.keyword_rules) >= 30
    categories = {rule.tag.category for rule in rules.keyword_rules}
    assert categories <= {"genre", "theme", "mood", "setting"}
    work = make_work("異世界食堂", "転生した料理人が異世界で食堂を開く。泣ける話。", [])
    slugs = {tag.tag_slug for tag in tags_for_work(work, rules)}
    assert {"isekai", "reincarnation", "gourmet", "tearjerker"} <= slugs
