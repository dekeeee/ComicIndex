import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  ALLOWED,
  EXCEEDED,
  fakeIpHash,
  fakeRateLimit,
  jsonRequest,
  UUID_A,
  UUID_B,
} from "../_shared/testing.ts";
import {
  handle,
  parseReportInput,
  type ReportRepo,
  type ReportReviewDeps,
  shouldHide,
} from "./handler.ts";

/**
 * 必須 3 ケースのうち「Turnstile 失敗」は F-10 の設計（Turnstile 不要）により対象外。
 * 代わりにしきい値・重複・404 を検証する。
 */

const URL_ = "http://localhost/functions/v1/report-review";

interface Harness {
  deps: ReportReviewDeps;
  reports: string[];
  updates: { reviewId: string; count: number; hide: boolean }[];
}

function makeHarness(overrides: Partial<ReportReviewDeps> = {}): Harness {
  const reports: string[] = [];
  const updates: Harness["updates"] = [];
  const repo: ReportRepo = {
    reviewExists: (id) => Promise.resolve(id === UUID_A),
    insertReport: (reviewId, _reason, hash) => {
      const key = `${reviewId}|${hash}`;
      if (reports.includes(key)) return Promise.resolve("duplicate");
      reports.push(key);
      return Promise.resolve("inserted");
    },
    countReports: (reviewId) =>
      Promise.resolve(reports.filter((k) => k.startsWith(`${reviewId}|`)).length),
    recordReportCount: (reviewId, count, hide) => {
      updates.push({ reviewId, count, hide });
      return Promise.resolve();
    },
  };
  const deps: ReportReviewDeps = {
    ipHash: fakeIpHash("hash-1"),
    checkRateLimit: fakeRateLimit(ALLOWED).check,
    repo,
    hideThreshold: 3,
    ...overrides,
  };
  return { deps, reports, updates };
}

Deno.test("report-review: normal case records the report and returns 201 { hidden: false }", async () => {
  const h = makeHarness();
  const res = await handle(
    jsonRequest(URL_, "POST", { reviewId: UUID_A, reason: "spam" }),
    h.deps,
  );
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { hidden: false });
  assertEquals(h.updates, [{ reviewId: UUID_A, count: 1, hide: false }]);
});

Deno.test("report-review: rate limit exceeded returns 429", async () => {
  const h = makeHarness({ checkRateLimit: fakeRateLimit(EXCEEDED).check });
  const res = await handle(
    jsonRequest(URL_, "POST", { reviewId: UUID_A, reason: "spam" }),
    h.deps,
  );
  assertEquals(res.status, 429);
  assertEquals(h.reports.length, 0);
});

Deno.test("report-review: third distinct reporter hides the review", async () => {
  const h = makeHarness();
  for (const hash of ["h1", "h2"]) {
    const res = await handle(
      jsonRequest(URL_, "POST", { reviewId: UUID_A, reason: "abuse" }),
      { ...h.deps, ipHash: fakeIpHash(hash) },
    );
    assertEquals((await res.json()).hidden, false);
  }
  const third = await handle(
    jsonRequest(URL_, "POST", { reviewId: UUID_A, reason: "abuse" }),
    { ...h.deps, ipHash: fakeIpHash("h3") },
  );
  assertEquals(third.status, 201);
  assertEquals(await third.json(), { hidden: true });
  assertEquals(h.updates.at(-1), { reviewId: UUID_A, count: 3, hide: true });
});

Deno.test("report-review: same ip_hash reporting twice is 409 and not counted", async () => {
  const h = makeHarness();
  const req = () => jsonRequest(URL_, "POST", { reviewId: UUID_A, reason: "other" });
  assertEquals((await handle(req(), h.deps)).status, 201);
  assertEquals((await handle(req(), h.deps)).status, 409);
  assertEquals(h.reports.length, 1);
});

Deno.test("report-review: invalid reason or id is 400, unknown review is 404", async () => {
  const h = makeHarness();
  const badReason = await handle(
    jsonRequest(URL_, "POST", { reviewId: UUID_A, reason: "rude" }),
    h.deps,
  );
  assertEquals(badReason.status, 400);
  const badId = await handle(
    jsonRequest(URL_, "POST", { reviewId: "nope", reason: "spam" }),
    h.deps,
  );
  assertEquals(badId.status, 400);
  const missing = await handle(
    jsonRequest(URL_, "POST", { reviewId: UUID_B, reason: "spam" }),
    h.deps,
  );
  assertEquals(missing.status, 404);

  assert(parseReportInput({ reviewId: UUID_A, reason: "copyright" }).ok);
  assertFalse(parseReportInput({ reviewId: UUID_A, reason: "" }).ok);
  assert(shouldHide(3, 3));
  assertFalse(shouldHide(2, 3));
});
