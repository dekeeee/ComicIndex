from __future__ import annotations

from datetime import date
from typing import Any

import httpx
import pytest

from comicomi_pipeline import config
from comicomi_pipeline.rakuten_client import RakutenApiError, RakutenClient, map_item, parse_sales_date


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2024年03月15日", date(2024, 3, 15)),
        ("2024年3月5日", date(2024, 3, 5)),
        ("2024年03月", date(2024, 3, 1)),
        ("2024年03月下旬", date(2024, 3, 1)),
        ("2024年03月15日頃", date(2024, 3, 15)),
        ("２０２４年０３月１５日", date(2024, 3, 15)),
        ("2024/03/15", date(2024, 3, 15)),
        ("2024-03", date(2024, 3, 1)),
        ("2024年", None),
        ("2024年02月30日", None),
        ("近日発売", None),
        ("", None),
        (None, None),
    ],
)
def test_parse_sales_date(raw: str | None, expected: date | None) -> None:
    assert parse_sales_date(raw) == expected


RAW_ITEM: dict[str, Any] = {
    "itemCode": "book:20123456",
    "title": "鬼滅の刃（1）",
    "titleKana": "キメツノヤイバ 1",
    "author": "吾峠呼世晴",
    "publisherName": "集英社",
    "itemCaption": "時は大正。",
    "largeImageUrl": "https://thumbnail.image.rakuten.co.jp/large.jpg",
    "salesDate": "2016年06月03日",
    "isbn": "9784088807232",
    "affiliateUrl": "https://hb.afl.rakuten.co.jp/x",
    "itemUrl": "https://books.rakuten.co.jp/rb/1",
    "booksGenreId": "001001001005/001001001008",
}


def test_map_item_maps_fields() -> None:
    item = map_item(RAW_ITEM)
    assert item.item_code == "book:20123456"
    assert item.title == "鬼滅の刃（1）"
    assert item.title_kana == "キメツノヤイバ 1"
    assert item.author == "吾峠呼世晴"
    assert item.publisher == "集英社"
    assert item.caption == "時は大正。"
    assert item.image_url == "https://thumbnail.image.rakuten.co.jp/large.jpg"
    assert item.sales_date == "2016年06月03日"
    assert item.isbn == "9784088807232"
    assert item.affiliate_url == "https://hb.afl.rakuten.co.jp/x"
    assert item.genre_ids == ["001001001005", "001001001008"]


def test_map_item_handles_missing_and_wrapped_values() -> None:
    wrapped = {"Item": {**RAW_ITEM, "titleKana": "", "itemCaption": None, "affiliateUrl": "", "booksGenreId": ""}}
    item = map_item(wrapped)
    assert item.title_kana is None
    assert item.caption is None
    assert item.affiliate_url == "https://books.rakuten.co.jp/rb/1"
    assert item.genre_ids == []


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds

    def advance(self, seconds: float) -> None:
        self.now += seconds


def make_client(handler: Any, clock: FakeClock) -> RakutenClient:
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return RakutenClient("app", "aff", http=http, clock=clock)


def test_search_sends_expected_params_and_maps_items() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"Items": [RAW_ITEM], "count": 1, "page": 2, "pageCount": 3})

    client = make_client(handler, FakeClock())
    items = client.search("001001", page=2)
    assert len(items) == 1 and items[0].item_code == "book:20123456"
    params = seen[0].url.params
    assert seen[0].url.host == "app.rakuten.co.jp"
    assert params["applicationId"] == "app"
    assert params["affiliateId"] == "aff"
    assert params["booksGenreId"] == "001001"
    assert params["page"] == "2"
    assert params["hits"] == str(config.RAKUTEN_HITS_PER_PAGE)
    assert params["sort"] == config.RAKUTEN_SORT
    assert params["formatVersion"] == str(config.RAKUTEN_FORMAT_VERSION)


def test_requests_are_spaced_by_interval() -> None:
    clock = FakeClock()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"Items": []})

    client = make_client(handler, clock)
    client.search("001001", 1)
    assert clock.sleeps == []  # first request goes out immediately
    client.search("001001", 2)
    assert clock.sleeps == [pytest.approx(config.RAKUTEN_INTERVAL_SEC)]
    clock.advance(0.4)
    client.search("001001", 3)
    assert clock.sleeps[-1] == pytest.approx(config.RAKUTEN_INTERVAL_SEC - 0.4)
    clock.advance(5.0)
    client.search("001001", 4)
    assert len(clock.sleeps) == 2  # enough time passed, no extra sleep


def test_retries_on_429_and_5xx_then_succeeds() -> None:
    clock = FakeClock()
    statuses = iter([429, 503, 200])

    def handler(request: httpx.Request) -> httpx.Response:
        status = next(statuses)
        body = {"Items": [RAW_ITEM]} if status == 200 else {"error": "too_many_requests"}
        return httpx.Response(status, json=body)

    client = make_client(handler, clock)
    items = client.search("001001", 1)
    assert len(items) == 1
    backoffs = [s for s in clock.sleeps if s >= config.RAKUTEN_RETRY_BACKOFF_SEC]
    assert backoffs == [config.RAKUTEN_RETRY_BACKOFF_SEC, config.RAKUTEN_RETRY_BACKOFF_SEC * 2]


def test_gives_up_after_max_retries() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500, text="boom")

    client = make_client(handler, FakeClock())
    with pytest.raises(RakutenApiError):
        client.search("001001", 1)
    assert calls == config.RAKUTEN_MAX_RETRIES + 1


def test_non_retryable_error_raises_immediately() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(400, json={"error": "wrong_parameter", "error_description": "bad"})

    client = make_client(handler, FakeClock())
    with pytest.raises(RakutenApiError) as excinfo:
        client.search("001001", 1)
    assert excinfo.value.status_code == 400
    assert calls == 1


def test_item_requires_isbn_and_uses_isbn_param() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"Items": [RAW_ITEM]})

    client = make_client(handler, FakeClock())
    item = client.item("book:9784088807232")
    assert item.isbn == "9784088807232"
    assert seen[0].url.params["isbn"] == "9784088807232"
    with pytest.raises(RakutenApiError):
        client.item("book:20123456")
