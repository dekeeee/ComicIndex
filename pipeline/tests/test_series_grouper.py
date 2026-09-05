from __future__ import annotations

from datetime import date

import pytest

from comicomi_pipeline import config
from comicomi_pipeline.series_grouper import (
    extract_volume,
    group_volumes,
    make_slug,
    normalize_title,
    series_key,
    series_title,
    split_authors,
)
from tests.conftest import make_item


@pytest.mark.parametrize(
    ("title", "volume", "series"),
    [
        ("鬼滅の刃 3", 3, "鬼滅の刃"),
        ("鬼滅の刃（3）", 3, "鬼滅の刃"),
        ("鬼滅の刃(3)", 3, "鬼滅の刃"),
        ("鬼滅の刃 第3巻", 3, "鬼滅の刃"),
        ("鬼滅の刃 3巻", 3, "鬼滅の刃"),
        ("【電子版】鬼滅の刃(3)", 3, "鬼滅の刃"),
        ("鬼滅の刃 vol.3", 3, "鬼滅の刃"),
        ("鬼滅の刃 Vol 3", 3, "鬼滅の刃"),
        ("鬼滅の刃　３", 3, "鬼滅の刃"),
        ("鬼滅の刃（２３）", 23, "鬼滅の刃"),
        ("鬼滅の刃 23（完）", 23, "鬼滅の刃"),
        ("名探偵コナン (完)", None, "名探偵コナン"),
        ("鬼滅の刃", None, "鬼滅の刃"),
        ("ドラゴンボール（3）新装版", 3, "ドラゴンボール"),
        ("ドラゴンボール 3 (新装版)", 3, "ドラゴンボール"),
        ("ドラゴンボール 完全版", None, "ドラゴンボール"),
        ("[限定特典付き] ワンピース 100", 100, "ワンピース"),
        ("ＯＮＥ　ＰＩＥＣＥ　１０１", 101, "ONE PIECE"),
        ("Dr.STONE 1", 1, "Dr.STONE"),
        ("Dr.STONE", None, "Dr.STONE"),
    ],
)
def test_extract_volume_and_series_title(title: str, volume: int | None, series: str) -> None:
    assert extract_volume(title) == volume
    assert series_title(title) == series


def test_normalize_title_lowercases_ascii_and_collapses_spaces() -> None:
    assert normalize_title("【新刊】ＯＮＥ　 ＰＩＥＣＥ  ") == "one piece"
    assert normalize_title("鬼滅の刃") == "鬼滅の刃"


def test_split_authors_uses_slash_separator() -> None:
    assert split_authors("尾田栄一郎") == ["尾田栄一郎"]
    assert split_authors("原作：Ａ／作画：Ｂ") == ["原作:A", "作画:B"]
    assert split_authors("A/ B /") == ["A", "B"]


def test_series_key_is_stable_across_volume_variants() -> None:
    variants = ["鬼滅の刃（3）", "鬼滅の刃 第4巻", "【電子版】鬼滅の刃 5", "鬼滅の刃　６", "鬼滅の刃 vol.7"]
    keys = {series_key(make_item(title)) for title in variants}
    assert keys == {"鬼滅の刃|吾峠呼世晴"}


def test_series_key_separates_different_authors() -> None:
    assert series_key(make_item("鬼滅の刃 1", "A")) != series_key(make_item("鬼滅の刃 1", "B"))


def test_series_key_is_idempotent() -> None:
    item = make_item("鬼滅の刃（3）")
    assert series_key(item) == series_key(item)
    assert make_slug(series_key(item)) == make_slug(series_key(item))


def test_make_slug_format() -> None:
    slug = make_slug("鬼滅の刃|吾峠呼世晴")
    assert slug.startswith(config.SLUG_PREFIX)
    assert len(slug) == len(config.SLUG_PREFIX) + config.SLUG_HASH_LENGTH
    assert all(ch in "0123456789abcdef" for ch in slug[len(config.SLUG_PREFIX) :])


def test_group_volumes_merges_series_and_picks_lowest_volume() -> None:
    items = [
        make_item("鬼滅の刃（3）", item_code="c3", caption="三巻あらすじ", sales_date="2016年10月04日"),
        make_item("鬼滅の刃（1）", item_code="c1", caption="一巻あらすじ", sales_date="2016年06月03日", image_url="https://example.com/1.jpg"),
        make_item("鬼滅の刃（2）", item_code="c2", caption="二巻あらすじ", sales_date="2016年08月04日"),
        make_item("名探偵コナン (完)", "青山剛昌", item_code="conan", sales_date="2024年"),
    ]
    works = group_volumes(items)
    assert len(works) == 2
    kimetsu, conan = works
    assert kimetsu.title == "鬼滅の刃"
    assert kimetsu.volume_count == 3
    assert kimetsu.synopsis == "一巻あらすじ"
    assert kimetsu.cover_url == "https://example.com/1.jpg"
    assert kimetsu.first_sales_date == date(2016, 6, 3)
    assert kimetsu.series_confidence == config.SERIES_CONFIDENCE_HIGH
    assert [volume.volume_no for volume in kimetsu.volumes] == [3, 1, 2]
    assert all(volume.work_key == kimetsu.rakuten_series_key for volume in kimetsu.volumes)
    assert kimetsu.slug == make_slug(kimetsu.rakuten_series_key)
    assert kimetsu.genre_ids == ["001001001"]
    assert conan.title == "名探偵コナン"
    assert conan.volume_count == 1
    assert conan.series_confidence == config.SERIES_CONFIDENCE_HIGH
    assert conan.first_sales_date is None


def test_group_volumes_lowers_confidence_when_a_volume_number_is_missing() -> None:
    items = [make_item("鬼滅の刃（1）", item_code="a"), make_item("鬼滅の刃 外伝", item_code="b")]
    works = group_volumes(items)
    assert len(works) == 2  # different series keys
    mixed = group_volumes([make_item("鬼滅の刃", item_code="x"), make_item("鬼滅の刃（2）", item_code="y")])
    assert len(mixed) == 1
    assert mixed[0].series_confidence == config.SERIES_CONFIDENCE_LOW
    assert mixed[0].volume_count == 2
    assert mixed[0].synopsis is None or mixed[0].volumes[1].volume_no == 2


def test_group_volumes_is_idempotent_and_dedupes_item_codes() -> None:
    items = [make_item("鬼滅の刃（1）", item_code="a"), make_item("鬼滅の刃（1）", item_code="a")]
    first = group_volumes(items)
    second = group_volumes(items)
    assert len(first) == 1
    assert first[0].volume_count == 1
    assert first[0].rakuten_series_key == second[0].rakuten_series_key
    assert first[0].slug == second[0].slug
