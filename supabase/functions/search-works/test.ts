import { assertEquals } from "jsr:@std/assert@1";
import { RakutenError } from "../_shared/rakuten.ts";
import {
  ALLOWED,
  EXCEEDED,
  fakeIpHash,
  fakeRateLimit,
} from "../_shared/testing.ts";
import type { RakutenCandidate, WorkSummary } from "../_shared/types.ts";
import {
  buildOrFilter,
  handle,
  needsRakuten,
  sanitizeQueryForFilter,
  type SearchWorksDeps,
} from "./handler.ts";

/**
 * 必須 3 ケースのうち「Turnstile 失敗」は F-07 の設計（検索は Turnstile 不要）により対象外。
 * 代わりに「DB ヒット時に楽天を呼ばない」「楽天障害は 502」を検証する。
 */

const BASE = "http://localhost/functions/v1/search-works";

function work(n: number): WorkSummary {
  return {
    id: `0000000${n}-0000-4000-8000-000000000000`,
    slug: `w-${n}`,
    title: `作品${n}`,
    authors: ["作者"],
    coverUrl: null,
    reviewCount: 0,
    status: "published",
  };
}

const CANDIDATE: RakutenCandidate = {
  itemCode: "9784088820170",
  title: "ワンピース 1",
  titleKana: null,
  author: "尾田 栄一郎",
  imageUrl: "https://img.example/1.jpg",
  salesDate: "1997年12月24日",
  isbn: "9784088820170",
  publisher: "集英社",
  caption: null,
  affiliateUrl: "https://hb.afl.rakuten.co.jp/x",
  genreIds: ["001001001"],
};

interface Harness {
  deps: SearchWorksDeps;
  rakutenCalls: string[];
  rateLimitCalls: string[];
}

function makeHarness(
  dbHits: WorkSummary[],
  overrides: Partial<SearchWorksDeps> = {},
): Harness {
  const rakutenCalls: string[] = [];
  const rl = fakeRateLimit(ALLOWED);
  const deps: SearchWorksDeps = {
    ipHash: fakeIpHash(),
    checkRateLimit: rl.check,
    repo: { searchPublished: () => Promise.resolve(dbHits) },
    searchRakuten: (q) => {
      rakutenCalls.push(q);
      return Promise.resolve([CANDIDATE]);
    },
    ...overrides,
  };
  return { deps, rakutenCalls, rateLimitCalls: rl.calls };
}

const get = (q: string) => new Request(`${BASE}?q=${encodeURIComponent(q)}`);

Deno.test("search-works: 3+ DB hits skip Rakuten and the rate limit", async () => {
  const h = makeHarness([work(1), work(2), work(3)]);
  const res = await handle(get("作品"), h.deps);
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.db.length, 3);
  assertEquals(data.rakuten, []);
  assertEquals(h.rakutenCalls, []);
  assertEquals(h.rateLimitCalls, []);
});

Deno.test("search-works: fewer than 3 DB hits fall back to Rakuten (normal case)", async () => {
  const h = makeHarness([work(1)]);
  const res = await handle(get("ワンピース"), h.deps);
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.db.length, 1);
  assertEquals(data.rakuten.length, 1);
  assertEquals(data.rakuten[0].itemCode, CANDIDATE.itemCode);
  assertEquals(h.rakutenCalls, ["ワンピース"]);
  assertEquals(h.rateLimitCalls, ["search"]);
});

Deno.test("search-works: Rakuten fallback is rate limited (429)", async () => {
  const h = makeHarness([], { checkRateLimit: fakeRateLimit(EXCEEDED).check });
  const res = await handle(get("ワンピース"), h.deps);
  assertEquals(res.status, 429);
  assertEquals(h.rakutenCalls, []);
});

Deno.test("search-works: Rakuten outage is 502, missing or empty q is 400, POST is 405", async () => {
  const down = makeHarness([], {
    searchRakuten: () => Promise.reject(new RakutenError(429, "quota")),
  });
  assertEquals((await handle(get("x"), down.deps)).status, 502);

  const h = makeHarness([]);
  assertEquals((await handle(new Request(BASE), h.deps)).status, 400);
  assertEquals((await handle(get("   "), h.deps)).status, 400);
  assertEquals((await handle(new Request(BASE, { method: "POST" }), h.deps)).status, 405);
});

Deno.test("search-works: filter helpers", () => {
  assertEquals(needsRakuten(2, 3), true);
  assertEquals(needsRakuten(3, 3), false);
  assertEquals(sanitizeQueryForFilter("Dr.スランプ"), "Dr*スランプ");
  assertEquals(sanitizeQueryForFilter('a,b(c)"d\\e{f}%g'), "a*b*c*d*e*f*g");
  assertEquals(sanitizeQueryForFilter("***"), "");
  assertEquals(buildOrFilter("%"), null);
  assertEquals(
    buildOrFilter("ワンピース"),
    "title.ilike.*ワンピース*,title_kana.ilike.*ワンピース*,authors.cs.{ワンピース}",
  );
});
