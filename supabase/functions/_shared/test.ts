import {
  assert,
  assertEquals,
  assertFalse,
  assertMatch,
  assertRejects,
} from "jsr:@std/assert@1";
import { buildAmazonUrl, isbn13ToIsbn10, normalizeIsbn } from "./amazon.ts";
import { clientIp, hashIp, ipHash } from "./iphash.ts";
import { containsNgWord, countUrls } from "./ngwords.ts";
import {
  buildSearchUrl,
  fetchRakutenItem,
  looksLikeIsbn,
  RakutenError,
  searchRakutenBooks,
  toCandidate,
} from "./rakuten.ts";
import { checkRateLimit, evaluateWindow, limitsFor } from "./ratelimit.ts";
import { corsHeaders, error, json, preflight, readJsonObject } from "./response.ts";
import {
  extractVolume,
  normalizeTitle,
  seriesKey,
  seriesTitle,
  slugFor,
  splitAuthors,
} from "./series.ts";
import { FakePostLogStore, jsonRequest } from "./testing.ts";
import { verifyTurnstile } from "./turnstile.ts";
import {
  codePointLength,
  isReportReason,
  isUuid,
  normalizeNickname,
  validateReviewInput,
  validateSearchQuery,
} from "./validation.ts";

// ---------------------------------------------------------------- iphash

Deno.test("clientIp prefers cf-connecting-ip, then first x-forwarded-for, then x-real-ip", () => {
  const all = new Request("http://x/", {
    headers: {
      "cf-connecting-ip": "1.1.1.1",
      "x-forwarded-for": "2.2.2.2, 3.3.3.3",
      "x-real-ip": "4.4.4.4",
    },
  });
  assertEquals(clientIp(all), "1.1.1.1");

  const xff = new Request("http://x/", {
    headers: { "x-forwarded-for": " 2.2.2.2 , 3.3.3.3", "x-real-ip": "4.4.4.4" },
  });
  assertEquals(clientIp(xff), "2.2.2.2");

  const real = new Request("http://x/", { headers: { "x-real-ip": "4.4.4.4" } });
  assertEquals(clientIp(real), "4.4.4.4");

  assertEquals(clientIp(new Request("http://x/")), null);
});

Deno.test("hashIp is sha256 hex, deterministic, salt-dependent", async () => {
  const a = await hashIp("1.2.3.4", "salt");
  const b = await hashIp("1.2.3.4", "salt");
  const c = await hashIp("1.2.3.4", "other");
  assertMatch(a, /^[0-9a-f]{64}$/);
  assertEquals(a, b);
  assert(a !== c);
  // 生 IP が含まれない
  assertFalse(a.includes("1.2.3.4"));
});

Deno.test("ipHash(req, salt) hashes the resolved client IP", async () => {
  const req = new Request("http://x/", { headers: { "x-forwarded-for": "9.9.9.9" } });
  assertEquals(await ipHash(req, "s"), await hashIp("9.9.9.9", "s"));
});

// --------------------------------------------------------------- ngwords

Deno.test("containsNgWord matches listed words after NFKC/lowercase/space removal", () => {
  assert(containsNgWord("お前なんか死ね"));
  assert(containsNgWord("死 ね"));
  assert(containsNgWord("Free PORN here"));
  assert(containsNgWord("ＬＩＮＥ交換しませんか"));
  assertFalse(containsNgWord("主人公が敵と戦うシーンが熱い"));
  assertFalse(containsNgWord("殺し屋が主人公のサスペンス"));
});

Deno.test("countUrls counts http(s):// and www. occurrences", () => {
  assertEquals(countUrls("no links here"), 0);
  assertEquals(countUrls("see https://a.example and http://b.example/x?y=1"), 2);
  assertEquals(countUrls("www.c.example and ｈｔｔｐｓ://d.example"), 2);
});

// ------------------------------------------------------------ validation

const VALID_WORK_ID = "11111111-1111-4111-8111-111111111111";

function reviewInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workId: VALID_WORK_ID,
    body: "あ".repeat(20),
    rating: 5,
    hasSpoiler: false,
    ...overrides,
  };
}

Deno.test("validateReviewInput: body boundaries 19 / 20 / 2000 / 2001 (code points)", () => {
  assertFalse(validateReviewInput(reviewInput({ body: "あ".repeat(19) })).ok);
  assert(validateReviewInput(reviewInput({ body: "あ".repeat(20) })).ok);
  assert(validateReviewInput(reviewInput({ body: "あ".repeat(2000) })).ok);
  assertFalse(validateReviewInput(reviewInput({ body: "あ".repeat(2001) })).ok);
  // 絵文字 20 個 = 20 文字（UTF-16 長ではない）
  assertEquals(codePointLength("😀".repeat(20)), 20);
  assert(validateReviewInput(reviewInput({ body: "😀".repeat(20) })).ok);
});

Deno.test("validateReviewInput: nickname optional with default, max 20", () => {
  const empty = validateReviewInput(reviewInput({ nickname: "  " }));
  assert(empty.ok);
  assertEquals(empty.value.nickname, "名無し");

  const missing = validateReviewInput(reviewInput());
  assert(missing.ok);
  assertEquals(missing.value.nickname, "名無し");

  assert(validateReviewInput(reviewInput({ nickname: "あ".repeat(20) })).ok);
  const tooLong = validateReviewInput(reviewInput({ nickname: "あ".repeat(21) }));
  assertFalse(tooLong.ok);
  assert("nickname" in tooLong.errors);

  assertEquals(normalizeNickname(undefined), "名無し");
  assertEquals(normalizeNickname(" ねこ "), "ねこ");
});

Deno.test("validateReviewInput: rating must be integer 1..5, hasSpoiler boolean, workId uuid", () => {
  for (const rating of [0, 6, 2.5, "5", null]) {
    const r = validateReviewInput(reviewInput({ rating }));
    assertFalse(r.ok);
    assert("rating" in r.errors);
  }
  const spoiler = validateReviewInput(reviewInput({ hasSpoiler: "yes" }));
  assertFalse(spoiler.ok);
  assert("hasSpoiler" in spoiler.errors);

  const badId = validateReviewInput(reviewInput({ workId: "not-a-uuid" }));
  assertFalse(badId.ok);
  assert("workId" in badId.errors);

  assert(isUuid(VALID_WORK_ID));
  assertFalse(isUuid("11111111-1111-4111-8111-11111111111"));
  assertFalse(validateReviewInput(null).ok);
});

Deno.test("validateReviewInput trims body and returns normalized value", () => {
  const r = validateReviewInput(reviewInput({ body: "  " + "あ".repeat(20) + "  " }));
  assert(r.ok);
  assertEquals(r.value.body, "あ".repeat(20));
  assertEquals(r.value.rating, 5);
});

Deno.test("isReportReason accepts only listed reasons", () => {
  assert(isReportReason("spam"));
  assert(isReportReason("other"));
  assertFalse(isReportReason("rude"));
  assertFalse(isReportReason(1));
});

Deno.test("validateSearchQuery: trims, 1..100 code points", () => {
  assertFalse(validateSearchQuery(null).ok);
  assertFalse(validateSearchQuery("   ").ok);
  const ok = validateSearchQuery("  ワンピース ");
  assert(ok.ok);
  assertEquals(ok.value, "ワンピース");
  assert(validateSearchQuery("あ".repeat(100)).ok);
  assertFalse(validateSearchQuery("あ".repeat(101)).ok);
});

// ---------------------------------------------------------------- series

/**
 * 期待値は Python 側 `pipeline/tests/test_series_grouper.py` と同じ表 + 追加ケース。
 * 両実装が同じ `series_title` / `extract_volume` を返すことがキー一致の前提。
 */
const TITLE_CASES: [string, number | null, string][] = [
  ["鬼滅の刃 3", 3, "鬼滅の刃"],
  ["鬼滅の刃（3）", 3, "鬼滅の刃"],
  ["鬼滅の刃(3)", 3, "鬼滅の刃"],
  ["鬼滅の刃 第3巻", 3, "鬼滅の刃"],
  ["鬼滅の刃 3巻", 3, "鬼滅の刃"],
  ["【電子版】鬼滅の刃(3)", 3, "鬼滅の刃"],
  ["鬼滅の刃 vol.3", 3, "鬼滅の刃"],
  ["鬼滅の刃 Vol 3", 3, "鬼滅の刃"],
  ["鬼滅の刃　３", 3, "鬼滅の刃"],
  ["鬼滅の刃（２３）", 23, "鬼滅の刃"],
  ["鬼滅の刃 23（完）", 23, "鬼滅の刃"],
  ["名探偵コナン (完)", null, "名探偵コナン"],
  ["鬼滅の刃", null, "鬼滅の刃"],
  ["ドラゴンボール（3）新装版", 3, "ドラゴンボール"],
  ["ドラゴンボール 3 (新装版)", 3, "ドラゴンボール"],
  ["ドラゴンボール 完全版", null, "ドラゴンボール"],
  ["[限定特典付き] ワンピース 100", 100, "ワンピース"],
  ["ＯＮＥ　ＰＩＥＣＥ　１０１", 101, "ONE PIECE"],
  ["Dr.STONE 1", 1, "Dr.STONE"],
  ["Dr.STONE", null, "Dr.STONE"],
  ["ワンピース 8 (完)", 8, "ワンピース"],
  ["  ワンピース   愛蔵版 ", null, "ワンピース"],
];

Deno.test("seriesTitle / extractVolume match the Python series_grouper table", () => {
  for (const [raw, expectedVolume, expectedTitle] of TITLE_CASES) {
    assertEquals(extractVolume(raw), expectedVolume, `extractVolume(${raw})`);
    assertEquals(seriesTitle(raw), expectedTitle, `seriesTitle(${raw})`);
  }
});

Deno.test("normalizeTitle lowercases ASCII, collapses spaces, keeps the volume", () => {
  assertEquals(normalizeTitle("【新刊】ＯＮＥ　 ＰＩＥＣＥ  "), "one piece");
  assertEquals(normalizeTitle("鬼滅の刃"), "鬼滅の刃");
  assertEquals(normalizeTitle("鬼滅の刃 3"), "鬼滅の刃 3");
});

Deno.test("splitAuthors keeps display case and splits on / ／ 、 , ，", () => {
  assertEquals(splitAuthors("尾田栄一郎"), ["尾田栄一郎"]);
  assertEquals(splitAuthors("原作：Ａ／作画：Ｂ"), ["原作:A", "作画:B"]);
  assertEquals(splitAuthors("A/ B /"), ["A", "B"]);
  assertEquals(splitAuthors("尾田栄一郎/ＡＢＣ, D"), ["尾田栄一郎", "ABC", "D"]);
});

Deno.test("seriesKey is stable across volume variants and separates authors", () => {
  assertEquals(seriesKey("ワンピース 3", "尾田 栄一郎"), "ワンピース|尾田 栄一郎");
  assertEquals(seriesKey("ワンピース（４）", "尾田　栄一郎"), "ワンピース|尾田 栄一郎");
  assertEquals(seriesKey("Title 2", "A B/C D"), "title|a b");
  assertEquals(seriesKey("Title 2", ""), "title|");
  const variants = ["鬼滅の刃 1", "鬼滅の刃（２）", "鬼滅の刃 第3巻", "【電子版】鬼滅の刃(4)"];
  assertEquals(new Set(variants.map((t) => seriesKey(t, "吾峠呼世晴"))).size, 1);
  assert(seriesKey("鬼滅の刃 1", "A") !== seriesKey("鬼滅の刃 1", "B"));
});

Deno.test("slugFor is w- + first 10 hex of sha1", async () => {
  // sha1("abc") = a9993e364706816aba3e25717850c26c9cd0d89d
  assertEquals(await slugFor("abc"), "w-a9993e3647");
  assertEquals(await slugFor("abc"), await slugFor("abc"));
  assertMatch(await slugFor("ワンピース|尾田 栄一郎"), /^w-[0-9a-f]{10}$/);
});

// ------------------------------------------------------------- ratelimit

const NOW = new Date("2026-09-03T12:00:00Z");
const secAgo = (s: number): Date => new Date(NOW.getTime() - s * 1000);

Deno.test("evaluateWindow: below max is allowed, at max is exceeded with retry from the max-th newest", () => {
  const limit = { windowSec: 3600, max: 3 };
  assertEquals(evaluateWindow(limit, [], NOW), { exceeded: false, retryAfterSec: 0 });
  assertEquals(
    evaluateWindow(limit, [secAgo(100), secAgo(200)], NOW),
    { exceeded: false, retryAfterSec: 0 },
  );
  const verdict = evaluateWindow(limit, [secAgo(100), secAgo(200), secAgo(3000)], NOW);
  assert(verdict.exceeded);
  assertEquals(verdict.retryAfterSec, 600);
});

Deno.test("evaluateWindow: retryAfterSec is at least 1", () => {
  const verdict = evaluateWindow({ windowSec: 60, max: 1 }, [secAgo(60)], NOW);
  assert(verdict.exceeded);
  assertEquals(verdict.retryAfterSec, 1);
});

Deno.test("checkRateLimit: review allows 3 per hour then 429s, and records passes only", async () => {
  let clock = NOW;
  const store = new FakePostLogStore(() => clock);
  const limits = limitsFor("review");
  const deps = { store, now: () => clock };

  for (let i = 0; i < 3; i++) {
    const r = await checkRateLimit("review", "h", limits, deps);
    assert(r.allowed, `attempt ${i + 1}`);
    clock = new Date(clock.getTime() + 60_000);
  }
  const fourth = await checkRateLimit("review", "h", limits, deps);
  assertFalse(fourth.allowed);
  if (!fourth.allowed) {
    // 最古の投稿は 3 分前 → 3600 - 180 = 3420 秒後に再試行可
    assertEquals(fourth.retryAfterSec, 3420);
  }
  assertEquals(store.entries.length, 3);

  // 別 ip_hash・別種別は独立
  assert((await checkRateLimit("review", "other", limits, deps)).allowed);
  assert((await checkRateLimit("vote", "h", limitsFor("vote"), deps)).allowed);
});

Deno.test("checkRateLimit: daily window blocks the 11th review even when spread over hours", async () => {
  let clock = NOW;
  const store = new FakePostLogStore(() => clock);
  const limits = limitsFor("review");
  const deps = { store, now: () => clock };

  for (let i = 0; i < 10; i++) {
    assert((await checkRateLimit("review", "h", limits, deps)).allowed, `attempt ${i + 1}`);
    clock = new Date(clock.getTime() + 2 * 3600_000);
  }
  const eleventh = await checkRateLimit("review", "h", limits, deps);
  assertFalse(eleventh.allowed);
  if (!eleventh.allowed) assert(eleventh.retryAfterSec > 3600);
});

// --------------------------------------------------------------- rakuten

const RAW_ITEM = {
  itemCode: "9784088820170",
  title: "ワンピース 1",
  titleKana: "ワンピース 1",
  author: "尾田 栄一郎",
  publisherName: "集英社",
  itemCaption: "海賊王を目指す少年の物語",
  largeImageUrl: "https://thumbnail.image.rakuten.co.jp/large.jpg",
  mediumImageUrl: "https://thumbnail.image.rakuten.co.jp/medium.jpg",
  salesDate: "1997年12月24日",
  isbn: "9784088820170",
  affiliateUrl: "https://hb.afl.rakuten.co.jp/x",
  itemUrl: "https://books.rakuten.co.jp/rb/1",
  booksGenreId: "001001001/001004008",
};

function fakeFetch(
  status: number,
  body: unknown,
): { calls: string[]; fetchFn: typeof fetch } {
  const calls: string[] = [];
  const fetchFn: typeof fetch = (input) => {
    calls.push(input instanceof Request ? input.url : String(input));
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
  return { calls, fetchFn };
}

Deno.test("toCandidate maps formatVersion=2 items and drops incomplete ones", () => {
  const c = toCandidate(RAW_ITEM);
  assert(c !== null);
  assertEquals(c.itemCode, "9784088820170");
  assertEquals(c.imageUrl, RAW_ITEM.largeImageUrl);
  assertEquals(c.publisher, "集英社");
  assertEquals(c.genreIds, ["001001001", "001004008"]);
  assertEquals(c.affiliateUrl, RAW_ITEM.affiliateUrl);
  assertEquals(toCandidate({ title: "no code" }), null);
  assertEquals(toCandidate("nope"), null);
});

Deno.test("searchRakutenBooks sends the expected query and maps results", async () => {
  const { calls, fetchFn } = fakeFetch(200, { Items: [RAW_ITEM, { broken: true }] });
  const items = await searchRakutenBooks("ワンピース", {
    appId: "APP",
    affiliateId: "AFF",
    fetchFn,
  });
  assertEquals(items.length, 1);
  const url = new URL(calls[0] ?? "");
  assertEquals(url.searchParams.get("applicationId"), "APP");
  assertEquals(url.searchParams.get("affiliateId"), "AFF");
  assertEquals(url.searchParams.get("title"), "ワンピース");
  assertEquals(url.searchParams.get("booksGenreId"), "001001");
  assertEquals(url.searchParams.get("hits"), "10");
  assertEquals(url.searchParams.get("formatVersion"), "2");
  assert(buildSearchUrl({}, "a", "b").startsWith("https://app.rakuten.co.jp/"));
});

Deno.test("searchRakutenBooks throws RakutenError on non-2xx", async () => {
  const { fetchFn } = fakeFetch(429, { error: "too_many_requests" });
  await assertRejects(
    () => searchRakutenBooks("x", { appId: "a", affiliateId: "b", fetchFn }),
    RakutenError,
  );
});

Deno.test("looksLikeIsbn", () => {
  assert(looksLikeIsbn("9784088820170"));
  assert(looksLikeIsbn("978-4-08-882017-0"));
  assert(looksLikeIsbn("408882017X"));
  assertFalse(looksLikeIsbn("shop:12345"));
});

Deno.test("fetchRakutenItem: ISBN-like code searches by isbn", async () => {
  const { calls, fetchFn } = fakeFetch(200, { Items: [RAW_ITEM] });
  const item = await fetchRakutenItem("9784088820170", undefined, {
    appId: "a",
    affiliateId: "b",
    fetchFn,
  });
  assert(item !== null);
  assertEquals(item.itemCode, "9784088820170");
  assertEquals(new URL(calls[0] ?? "").searchParams.get("isbn"), "9784088820170");
});

Deno.test("fetchRakutenItem: non-ISBN code needs a title hint and matches itemCode exactly", async () => {
  const noHint = await fetchRakutenItem("shop:1", undefined, {
    appId: "a",
    affiliateId: "b",
    fetchFn: fakeFetch(200, { Items: [] }).fetchFn,
  });
  assertEquals(noHint, null);

  const { fetchFn } = fakeFetch(200, {
    Items: [{ ...RAW_ITEM, itemCode: "shop:2" }, { ...RAW_ITEM, itemCode: "shop:1" }],
  });
  const hit = await fetchRakutenItem("shop:1", "ワンピース", {
    appId: "a",
    affiliateId: "b",
    fetchFn,
  });
  assert(hit !== null);
  assertEquals(hit.itemCode, "shop:1");
});

// -------------------------------------------------------------- response

Deno.test("json/error attach CORS and content-type", async () => {
  const res = json(201, { ok: true });
  assertEquals(res.status, 201);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), corsHeaders()["Access-Control-Allow-Origin"]);
  assert((res.headers.get("Content-Type") ?? "").startsWith("application/json"));
  assertEquals(await res.json(), { ok: true });

  const err = error(400, "bad", "Bad.");
  assertEquals(err.status, 400);
  assertEquals(await err.json(), { code: "bad", message: "Bad." });
});

Deno.test("preflight answers OPTIONS with 204 and ignores other methods", () => {
  const res = preflight(new Request("http://x/", { method: "OPTIONS" }));
  assert(res !== null);
  assertEquals(res.status, 204);
  assert(res.headers.has("Access-Control-Allow-Methods"));
  assertEquals(preflight(new Request("http://x/", { method: "POST" })), null);
});

Deno.test("readJsonObject returns null for invalid or non-object JSON", async () => {
  assertEquals(await readJsonObject(jsonRequest("http://x/", "POST", { a: 1 })), { a: 1 });
  assertEquals(await readJsonObject(jsonRequest("http://x/", "POST", [1])), null);
  const broken = new Request("http://x/", { method: "POST", body: "{nope" });
  assertEquals(await readJsonObject(broken), null);
});

// ------------------------------------------------------------- turnstile

Deno.test("verifyTurnstile posts token + remoteip and reads success", async () => {
  let seenBody = "";
  const fetchFn: typeof fetch = async (_input, init) => {
    seenBody = init?.body instanceof URLSearchParams ? init.body.toString() : "";
    await Promise.resolve();
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
  assert(await verifyTurnstile("tok", "1.2.3.4", { secret: "sec", fetchFn }));
  const params = new URLSearchParams(seenBody);
  assertEquals(params.get("secret"), "sec");
  assertEquals(params.get("response"), "tok");
  assertEquals(params.get("remoteip"), "1.2.3.4");
});

Deno.test("verifyTurnstile is false on failure, non-2xx, network error, or empty token", async () => {
  const failing = fakeFetch(200, { success: false, "error-codes": ["invalid-input-response"] });
  assertFalse(await verifyTurnstile("tok", null, { secret: "s", fetchFn: failing.fetchFn }));
  const http500 = fakeFetch(500, {});
  assertFalse(await verifyTurnstile("tok", null, { secret: "s", fetchFn: http500.fetchFn }));
  const throwing: typeof fetch = () => Promise.reject(new Error("offline"));
  assertFalse(await verifyTurnstile("tok", null, { secret: "s", fetchFn: throwing }));
  assertFalse(await verifyTurnstile("", null, { secret: "s", fetchFn: failing.fetchFn }));
});

// ---- amazon.ts ----

Deno.test("amazon: normalizeIsbn accepts ISBN-10/13 with separators and rejects junk", () => {
  assertEquals(normalizeIsbn("978-4-08-882017-0"), "9784088820170");
  assertEquals(normalizeIsbn(" 408882017x "), "408882017X");
  assertEquals(normalizeIsbn("978408882017"), null);
  assertEquals(normalizeIsbn("abc"), null);
  assertEquals(normalizeIsbn(null), null);
});

Deno.test("amazon: isbn13ToIsbn10 matches the Python implementation", () => {
  assertEquals(isbn13ToIsbn10("9784088820170"), "4088820177");
  assertEquals(isbn13ToIsbn10("9780306406157"), "0306406152");
  assertEquals(isbn13ToIsbn10("9784088870144"), "408887014X");
  assertEquals(isbn13ToIsbn10("9791234567896"), null);
  assertEquals(isbn13ToIsbn10("4088820177"), null);
});

Deno.test("amazon: buildAmazonUrl needs both a tag and a convertible ISBN", () => {
  const expected = "https://www.amazon.co.jp/dp/4088820177?tag=comicomi-22";
  assertEquals(buildAmazonUrl("9784088820170", "comicomi-22"), expected);
  assertEquals(buildAmazonUrl("4088820177", "comicomi-22"), expected);
  assertEquals(buildAmazonUrl("9784088820170", ""), null);
  assertEquals(buildAmazonUrl("9784088820170", null), null);
  assertEquals(buildAmazonUrl(null, "comicomi-22"), null);
  assertEquals(buildAmazonUrl("9791234567896", "comicomi-22"), null);
});
