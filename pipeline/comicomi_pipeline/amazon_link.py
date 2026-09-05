"""Amazon affiliate product links derived from ISBNs (F-01 / F-07).

Amazon has no free lookup API for a new site, but paper books use the ISBN-10 as
their ASIN, so ``https://www.amazon.co.jp/dp/<ISBN-10>?tag=<associate tag>`` is a
valid affiliate link without any API call. Kindle editions have separate ASINs and
are not covered. The Edge Function ``_shared/amazon.ts`` implements the same rules.
"""

from __future__ import annotations

from . import config
from .models import Work

_ISBN10_WEIGHTS = tuple(range(10, 1, -1))


def normalize_isbn(raw: str | None) -> str | None:
    """Strip separators; return an upper-cased ISBN-10 / ISBN-13 or None if malformed."""
    if raw is None:
        return None
    text = raw.replace("-", "").replace(" ", "").strip().upper()
    if len(text) == config.ISBN13_LENGTH and text.isdigit():
        return text
    if len(text) == config.ISBN10_LENGTH and text[:-1].isdigit() and (text[-1].isdigit() or text[-1] == "X"):
        return text
    return None


def isbn13_to_isbn10(isbn13: str) -> str | None:
    """Convert a 978-prefixed ISBN-13 to ISBN-10 (979 has no ISBN-10 form -> None)."""
    if len(isbn13) != config.ISBN13_LENGTH or not isbn13.startswith(config.ISBN13_CONVERTIBLE_PREFIX):
        return None
    core = isbn13[len(config.ISBN13_CONVERTIBLE_PREFIX) : -1]
    total = sum(weight * int(digit) for weight, digit in zip(_ISBN10_WEIGHTS, core))
    check = (11 - total % 11) % 11
    return core + ("X" if check == 10 else str(check))


def build_amazon_url(isbn: str | None, tag: str | None) -> str | None:
    """Affiliate product URL for the ISBN, or None when no tag / no usable ISBN."""
    if not tag:
        return None
    normalized = normalize_isbn(isbn)
    if normalized is None:
        return None
    asin = normalized if len(normalized) == config.ISBN10_LENGTH else isbn13_to_isbn10(normalized)
    if asin is None:
        return None
    return config.AMAZON_DP_URL_TEMPLATE.format(asin=asin, tag=tag)


def representative_isbn(work: Work) -> str | None:
    """ISBN of the lowest-numbered volume that has one (unnumbered volumes last)."""
    ordered = sorted(
        work.volumes,
        key=lambda volume: (volume.volume_no is None, volume.volume_no if volume.volume_no is not None else 0),
    )
    for volume in ordered:
        if volume.isbn:
            return volume.isbn
    return None
