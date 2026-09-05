import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { RakutenError } from "../_shared/rakuten.ts";
import { seriesKey, slugFor } from "../_shared/series.ts";
import {
  ALLOWED,
  EXCEEDED,
  fakeIpHash,
  fakeRateLimit,
  jsonRequest,
  UUID_A,
} from "../_shared/testing.ts";
import type { RakutenCandidate, WorkRow } from "../_shared/types.ts";
import {
  buildVolumeRow,
  buildWorkRow,
  handle,
  type NewVolumeRow,
  type NewWorkRow,
  parseRegisterInput,
  parseSalesDate,
  type RegisterRepo,
  type RegisterWorkDeps,
} from "./handler.ts";

/**
 * 必須 3 ケースのうち「Turnstile 失敗」は F-07 の設計（登録は Turnstile 不要）により対象外。
 * 代わりに「同じ楽天アイテムを 2 回登録しても 1 レコード」「trigger-build 失敗でも 201」を検証する。
 */

const URL_ = "http://localhost/functions/v1/register-work";

const ITEM: RakutenCandidate = {
  itemCode: "9784088820170",
  title: "ワンピース 1",
  titleKana: "ワンピース 1",
  author: "尾田 栄一郎",
  imageUrl: "https://img.example/1.jpg",
  salesDate: "1997年12月24日",
  isbn: "9784088820170",
  publisher: "集英社",
  caption: "海賊王を目指す少年の物語",
  affiliateUrl: "https://hb.afl.rakuten.co.jp/x",
  genreIds: ["001001001"],
};

interface Harness {
  deps: RegisterWorkDeps;
  works: WorkRow[];
  workRows: NewWorkRow[];
  volumes: NewVolumeRow[];
  builds: number;
  fetches: string[];
}

function makeHarness(overrides: Partial<RegisterWorkDeps> = {}): Harness {
  const works: WorkRow[] = [];
  const workRows: NewWorkRow[] = [];
  const volumes: NewVolumeRow[] = [];
  const fetches: string[] = [];
  const state = { builds: 0 };

  const repo: RegisterRepo = {
    findWorkByItemCode: (code) => {
      const vol = volumes.find((v) => v.rakuten_item_code === code);
      return Promise.resolve(vol ? works.find((w) => w.id === vol.work_id) ?? null : null);
    },
    findWorkBySeriesKey: (key) => {
      const idx = workRows.findIndex((r) => r.rakuten_series_key === key);
      return Promise.resolve(idx === -1 ? null : works[idx] ?? null);
    },
    insertWork: (row) => {
      if (workRows.some((r) => r.rakuten_series_key === row.rakuten_series_key)) {
        return Promise.resolve("duplicate");
      }
      workRows.push(row);
      const stored: WorkRow = {
        id: UUID_A,
        slug: row.slug,
        title: row.title,
        authors: row.authors,
        cover_url: row.cover_url,
        review_count: 0,
        status: row.status,
      };
      works.push(stored);
      return Promise.resolve(stored);
    },
    upsertVolume: (row) => {
      if (!volumes.some((v) => v.rakuten_item_code === row.rakuten_item_code)) {
        volumes.push(row);
      }
      return Promise.resolve();
    },
  };

  const deps: RegisterWorkDeps = {
    ipHash: fakeIpHash(),
    checkRateLimit: fakeRateLimit(ALLOWED).check,
    fetchItem: (code) => {
      fetches.push(code);
      return Promise.resolve(code === ITEM.itemCode ? ITEM : null);
    },
    slugFor,
    amazonTag: null,
    repo,
    triggerBuild: () => {
      state.builds += 1;
      return Promise.resolve();
    },
    ...overrides,
  };

  const harness: Harness = { deps, works, workRows, volumes, builds: 0, fetches };
  Object.defineProperty(harness, "builds", { get: () => state.builds });
  return harness;
}

const post = (body: unknown) => jsonRequest(URL_, "POST", body);

Deno.test("register-work: normal case inserts a pending work + volume, triggers build, 201", async () => {
  const h = makeHarness();
  const res = await handle(post({ rakutenItemCode: ITEM.itemCode }), h.deps);
  assertEquals(res.status, 201);
  const data = await res.json();
  assertEquals(data.work.status, "pending");
  assertEquals(data.work.title, "ワンピース");
  assertEquals(data.work.slug, await slugFor(seriesKey(ITEM.title, ITEM.author)));
  assertEquals(h.workRows.length, 1);
  assertEquals(h.workRows[0]?.status, "pending");
  assertEquals(h.workRows[0]?.affiliate_url_rakuten, ITEM.affiliateUrl);
  assertEquals(h.workRows[0]?.affiliate_url_amazon, null);
  assertEquals(h.volumes.length, 1);
  assertEquals(h.volumes[0]?.volume_no, 1);
  assertEquals(h.builds, 1);
});

Deno.test("register-work: Amazon link is derived from the ISBN when a tag is configured", async () => {
  const h = makeHarness({ amazonTag: "comicomi-22" });
  const res = await handle(post({ rakutenItemCode: ITEM.itemCode }), h.deps);
  assertEquals(res.status, 201);
  assertEquals(
    h.workRows[0]?.affiliate_url_amazon,
    "https://www.amazon.co.jp/dp/4088820177?tag=comicomi-22",
  );

  const noIsbn = makeHarness({
    amazonTag: "comicomi-22",
    fetchItem: () => Promise.resolve({ ...ITEM, isbn: null }),
  });
  await handle(post({ rakutenItemCode: ITEM.itemCode }), noIsbn.deps);
  assertEquals(noIsbn.workRows[0]?.affiliate_url_amazon, null);
});

Deno.test("register-work: rate limit exceeded returns 429 before calling Rakuten", async () => {
  const h = makeHarness({ checkRateLimit: fakeRateLimit(EXCEEDED).check });
  const res = await handle(post({ rakutenItemCode: ITEM.itemCode }), h.deps);
  assertEquals(res.status, 429);
  assertEquals(h.fetches, []);
  assertEquals(h.workRows.length, 0);
});

Deno.test("register-work: registering the same item twice yields one record (200, no Rakuten call)", async () => {
  const h = makeHarness();
  assertEquals((await handle(post({ rakutenItemCode: ITEM.itemCode }), h.deps)).status, 201);
  const second = await handle(post({ rakutenItemCode: ITEM.itemCode }), h.deps);
  assertEquals(second.status, 200);
  assertEquals((await second.json()).work.id, UUID_A);
  assertEquals(h.workRows.length, 1);
  assertEquals(h.fetches.length, 1);
  assertEquals(h.builds, 1);
});

Deno.test("register-work: another volume of an existing series attaches to it (200, no build)", async () => {
  const vol2: RakutenCandidate = {
    ...ITEM,
    itemCode: "9784088820187",
    isbn: "9784088820187",
    title: "ワンピース 2",
  };
  const h = makeHarness({
    fetchItem: (code) =>
      Promise.resolve(code === ITEM.itemCode ? ITEM : code === vol2.itemCode ? vol2 : null),
  });
  assertEquals((await handle(post({ rakutenItemCode: ITEM.itemCode }), h.deps)).status, 201);
  const res = await handle(post({ rakutenItemCode: vol2.itemCode }), h.deps);
  assertEquals(res.status, 200);
  assertEquals(h.workRows.length, 1);
  assertEquals(h.volumes.length, 2);
  assertEquals(h.volumes[1]?.volume_no, 2);
  assertEquals(h.builds, 1);
});

Deno.test("register-work: missing code is 400, unknown item is 404, Rakuten outage is 502", async () => {
  const h = makeHarness();
  assertEquals((await handle(post({}), h.deps)).status, 400);
  assertEquals((await handle(post({ rakutenItemCode: "unknown" }), h.deps)).status, 404);

  const down = makeHarness({
    fetchItem: () => Promise.reject(new RakutenError(503, "down")),
  });
  assertEquals((await handle(post({ rakutenItemCode: ITEM.itemCode }), down.deps)).status, 502);
});

Deno.test("register-work: trigger-build failure does not fail the registration", async () => {
  const h = makeHarness({ triggerBuild: () => Promise.reject(new Error("gh down")) });
  const res = await handle(post({ rakutenItemCode: ITEM.itemCode }), h.deps);
  assertEquals(res.status, 201);
  assertEquals(h.workRows.length, 1);
});

Deno.test("register-work: pure helpers", async () => {
  assert(parseRegisterInput({ rakutenItemCode: " x " }).ok);
  assertFalse(parseRegisterInput({ rakutenItemCode: "" }).ok);
  const withHint = parseRegisterInput({ rakutenItemCode: "x", title: " ワンピース " });
  assert(withHint.ok);
  assertEquals(withHint.titleHint, "ワンピース");

  assertEquals(parseSalesDate("1997年12月24日"), "1997-12-24");
  assertEquals(parseSalesDate("2024年05月"), "2024-05-01");
  assertEquals(parseSalesDate("2024年5月3日頃"), "2024-05-03");
  assertEquals(parseSalesDate("2024年03月下旬"), "2024-03-01");
  assertEquals(parseSalesDate("2024/03/15"), "2024-03-15");
  assertEquals(parseSalesDate("２０２４年０３月１５日"), "2024-03-15");
  assertEquals(parseSalesDate("2024年13月01日"), null);
  assertEquals(parseSalesDate("近日発売"), null);

  const key = seriesKey(ITEM.title, ITEM.author);
  const row = buildWorkRow(ITEM, key, await slugFor(key), null);
  assertEquals(row.title, "ワンピース");
  assertEquals(row.authors, ["尾田 栄一郎"]);
  assertEquals(row.first_sales_date, "1997-12-24");
  assertEquals(row.series_confidence, 1.0);
  assertEquals(row.is_adult, false);
  assertEquals(row.status, "pending");
  // 表示タイトルは大文字小文字を保持、キーは小文字化
  const dr = buildWorkRow({ ...ITEM, title: "Dr.STONE 1" }, "dr.stone|x", "w-x", null);
  assertEquals(dr.title, "Dr.STONE");

  const vol = buildVolumeRow(ITEM, UUID_A);
  assertEquals(vol.rakuten_item_code, ITEM.itemCode);
  assertEquals(vol.title_raw, "ワンピース 1");
  assertEquals(vol.volume_no, 1);
});
