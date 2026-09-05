from __future__ import annotations

import pytest

from comicomi_pipeline.amazon_link import (
    build_amazon_url,
    isbn13_to_isbn10,
    normalize_isbn,
    representative_isbn,
)
from comicomi_pipeline.ingest import build_works
from comicomi_pipeline.models import Volume, Work
from tests.conftest import make_item


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("9784088820170", "9784088820170"),
        ("978-4-08-882017-0", "9784088820170"),
        (" 4088820177 ", "4088820177"),
        ("408882017x", "408882017X"),
        ("978408882017", None),
        ("abc", None),
        (None, None),
    ],
)
def test_normalize_isbn(raw: str | None, expected: str | None) -> None:
    assert normalize_isbn(raw) == expected


@pytest.mark.parametrize(
    ("isbn13", "isbn10"),
    [
        ("9784088820170", "4088820177"),
        ("9784047146860", "4047146862"),
        ("9780306406157", "0306406152"),
        ("9784101010014", "4101010013"),
        ("9784088870144", "408887014X"),  # check digit 10 -> "X"
        ("9791234567896", None),  # 979 has no ISBN-10 form
        ("4088820177", None),
    ],
)
def test_isbn13_to_isbn10(isbn13: str, isbn10: str | None) -> None:
    assert isbn13_to_isbn10(isbn13) == isbn10


def test_build_amazon_url() -> None:
    expected = "https://www.amazon.co.jp/dp/4088820177?tag=comicomi-22"
    assert build_amazon_url("9784088820170", "comicomi-22") == expected
    assert build_amazon_url("4088820177", "comicomi-22") == expected
    assert build_amazon_url("9784088820170", "") is None
    assert build_amazon_url("9784088820170", None) is None
    assert build_amazon_url(None, "comicomi-22") is None
    assert build_amazon_url("9791234567896", "comicomi-22") is None


def _volume(no: int | None, isbn: str | None) -> Volume:
    return Volume(
        rakuten_item_code=f"code-{no}",
        work_key="k",
        volume_no=no,
        title_raw="t",
        isbn=isbn,
        sales_date=None,
        affiliate_url="r",
    )


def _work(volumes: list[Volume]) -> Work:
    return Work(
        rakuten_series_key="k",
        slug="w-x",
        title="t",
        title_kana=None,
        authors=[],
        publisher=None,
        synopsis=None,
        cover_url=None,
        first_sales_date=None,
        volume_count=len(volumes),
        affiliate_url_rakuten="r",
        is_adult=False,
        series_confidence=1.0,
        volumes=volumes,
    )


def test_representative_isbn_prefers_lowest_volume_with_isbn() -> None:
    work = _work([_volume(3, "333"), _volume(None, "000"), _volume(1, None), _volume(2, "222")])
    assert representative_isbn(work) == "222"
    assert representative_isbn(_work([_volume(1, None)])) is None


def test_build_works_sets_amazon_link_only_with_tag() -> None:
    item = make_item("鬼滅の刃 1")
    item.isbn = "9784088820170"
    with_tag, _ = build_works([item], amazon_tag="comicomi-22")
    assert with_tag[0].affiliate_url_amazon == "https://www.amazon.co.jp/dp/4088820177?tag=comicomi-22"
    without, _ = build_works([item])
    assert without[0].affiliate_url_amazon is None
