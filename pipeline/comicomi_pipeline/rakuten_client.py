"""Rakuten Books API client: request spacing, retries and response mapping."""

from __future__ import annotations

import logging
import re
import time
import unicodedata
from datetime import date
from typing import Any, Mapping, Protocol

import httpx

from . import config
from .models import RakutenItem

logger = logging.getLogger(__name__)

_DATE_JP = re.compile(r"(\d{4})年\s*(\d{1,2})月(?:\s*(\d{1,2})日)?")
_DATE_NUMERIC = re.compile(r"(\d{4})[/.\-](\d{1,2})(?:[/.\-](\d{1,2}))?")
_ISBN_DIGITS = re.compile(r"^(?:97[89])?\d{9}[\dXx]$")


class Clock(Protocol):
    """Monotonic clock abstraction so request spacing can be unit tested."""

    def monotonic(self) -> float: ...

    def sleep(self, seconds: float) -> None: ...


class SystemClock:
    def monotonic(self) -> float:
        return time.monotonic()

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)


class RakutenApiError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def is_retryable_status(status_code: int) -> bool:
    return (
        status_code == config.HTTP_STATUS_TOO_MANY_REQUESTS
        or config.HTTP_STATUS_SERVER_ERROR_MIN <= status_code <= config.HTTP_STATUS_SERVER_ERROR_MAX
    )


def parse_sales_date(value: str | None) -> date | None:
    """Parse Rakuten ``salesDate`` strings leniently.

    Accepts ``2024年03月15日``, ``2024年03月``, ``2024年03月下旬`` (day defaults to
    the 1st), ``2024/03/15`` and full-width digits. Returns ``None`` when no
    calendar date can be recovered.
    """
    if not value:
        return None
    text = unicodedata.normalize("NFKC", value)
    match = _DATE_JP.search(text) or _DATE_NUMERIC.search(text)
    if match is None:
        return None
    year, month = int(match.group(1)), int(match.group(2))
    day = int(match.group(3)) if match.group(3) else config.SALES_DATE_DEFAULT_DAY
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def map_item(raw: Mapping[str, Any]) -> RakutenItem:
    """Convert one API item dict (formatVersion 1 or 2) into ``RakutenItem``."""
    inner = raw.get("Item")
    item: Mapping[str, Any] = inner if isinstance(inner, Mapping) else raw
    genre_raw = _optional_str(item.get("booksGenreId")) or ""
    affiliate_url = _optional_str(item.get("affiliateUrl")) or _optional_str(item.get("itemUrl")) or ""
    return RakutenItem(
        item_code=str(item.get("itemCode", "")).strip(),
        title=str(item.get("title", "")).strip(),
        title_kana=_optional_str(item.get("titleKana")),
        author=str(item.get("author", "")).strip(),
        publisher=_optional_str(item.get("publisherName")),
        caption=_optional_str(item.get("itemCaption")),
        image_url=_optional_str(item.get("largeImageUrl")),
        sales_date=_optional_str(item.get("salesDate")),
        isbn=_optional_str(item.get("isbn")),
        affiliate_url=affiliate_url,
        genre_ids=[part for part in genre_raw.split("/") if part],
    )


class RakutenClient:
    """Thin client for the Rakuten Books ``BooksBook/Search`` endpoint.

    Guarantees at least ``interval_sec`` between requests and retries
    ``429``/``5xx``/transport errors with exponential backoff.
    """

    def __init__(
        self,
        app_id: str,
        affiliate_id: str,
        *,
        http: httpx.Client | None = None,
        clock: Clock | None = None,
        interval_sec: float = config.RAKUTEN_INTERVAL_SEC,
        max_retries: int = config.RAKUTEN_MAX_RETRIES,
        backoff_sec: float = config.RAKUTEN_RETRY_BACKOFF_SEC,
        endpoint: str = config.RAKUTEN_ENDPOINT,
    ) -> None:
        self._app_id = app_id
        self._affiliate_id = affiliate_id
        self._http = http or httpx.Client(timeout=config.RAKUTEN_TIMEOUT_SEC)
        self._clock: Clock = clock or SystemClock()
        self._interval_sec = interval_sec
        self._max_retries = max_retries
        self._backoff_sec = backoff_sec
        self._endpoint = endpoint
        self._last_request_at: float | None = None

    def close(self) -> None:
        self._http.close()

    def search(self, genre_id: str, page: int = 1) -> list[RakutenItem]:
        """Fetch one page of a genre, newest releases first."""
        payload = self._get(
            {
                "booksGenreId": genre_id,
                "page": page,
                "hits": config.RAKUTEN_HITS_PER_PAGE,
                "sort": config.RAKUTEN_SORT,
            }
        )
        return [map_item(entry) for entry in _items_of(payload)]

    def item(self, item_code: str) -> RakutenItem:
        """Fetch a single item.

        ``BooksBook/Search`` has no ``itemCode`` filter, so the code must be an
        ISBN (optionally prefixed with ``book:``). [TBD] switch to an item
        endpoint once one is confirmed for Rakuten Books.
        """
        isbn = item_code.split(":", 1)[-1].replace("-", "").strip()
        if not _ISBN_DIGITS.match(isbn):
            raise RakutenApiError(f"item lookup requires an ISBN, got {item_code!r}")
        payload = self._get({"isbn": isbn, "hits": 1})
        entries = _items_of(payload)
        if not entries:
            raise RakutenApiError(f"no item found for {item_code!r}")
        return map_item(entries[0])

    def _base_params(self) -> dict[str, Any]:
        return {
            "applicationId": self._app_id,
            "affiliateId": self._affiliate_id,
            "formatVersion": config.RAKUTEN_FORMAT_VERSION,
        }

    def _throttle(self) -> None:
        if self._last_request_at is None:
            return
        elapsed = self._clock.monotonic() - self._last_request_at
        remaining = self._interval_sec - elapsed
        if remaining > 0:
            self._clock.sleep(remaining)

    def _get(self, params: Mapping[str, Any]) -> dict[str, Any]:
        query = {**self._base_params(), **params}
        last_error: str = "no attempts made"
        for attempt in range(self._max_retries + 1):
            if attempt > 0:
                delay = self._backoff_sec * (2 ** (attempt - 1))
                logger.warning("rakuten retry %d/%d after %.1fs (%s)", attempt, self._max_retries, delay, last_error)
                self._clock.sleep(delay)
            self._throttle()
            try:
                response = self._http.get(self._endpoint, params=query)
            except httpx.TransportError as exc:
                last_error = f"transport error: {exc}"
                self._last_request_at = self._clock.monotonic()
                continue
            self._last_request_at = self._clock.monotonic()
            if is_retryable_status(response.status_code):
                last_error = f"HTTP {response.status_code}"
                continue
            if response.status_code != httpx.codes.OK:
                raise RakutenApiError(
                    f"rakuten request failed with HTTP {response.status_code}: {response.text[:200]}",
                    status_code=response.status_code,
                )
            payload = response.json()
            if not isinstance(payload, dict):
                raise RakutenApiError("unexpected rakuten payload shape", status_code=response.status_code)
            if "error" in payload:
                raise RakutenApiError(
                    f"rakuten error {payload.get('error')}: {payload.get('error_description', '')}",
                    status_code=response.status_code,
                )
            return payload
        raise RakutenApiError(f"rakuten request gave up after {self._max_retries} retries ({last_error})")


def _items_of(payload: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    items = payload.get("Items", [])
    if not isinstance(items, list):
        return []
    return [entry for entry in items if isinstance(entry, Mapping)]
