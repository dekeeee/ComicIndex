from __future__ import annotations

import pytest

from comicomi_pipeline.models import RakutenItem


def make_item(
    title: str,
    author: str = "吾峠呼世晴",
    *,
    item_code: str | None = None,
    caption: str | None = None,
    genre_ids: list[str] | None = None,
    sales_date: str | None = None,
    image_url: str | None = "https://example.com/cover.jpg",
) -> RakutenItem:
    return RakutenItem(
        item_code=item_code or f"book:{abs(hash((title, author))) % 10**8}",
        title=title,
        title_kana=None,
        author=author,
        publisher="集英社",
        caption=caption,
        image_url=image_url,
        sales_date=sales_date,
        isbn=None,
        affiliate_url="https://hb.afl.rakuten.co.jp/example",
        genre_ids=genre_ids if genre_ids is not None else ["001001001"],
    )


@pytest.fixture
def item_factory():
    return make_item
