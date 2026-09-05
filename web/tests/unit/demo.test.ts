import { describe, expect, it } from "vitest";
import { createDemoStore, DEMO_STORAGE_KEY, demoCatalog } from "@/lib/demo";
import { fixtures } from "@/lib/fixtures";
import type { ApiResult, SearchResult, WorkSummary } from "@/lib/types";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}
function data<T>(result: ApiResult<unknown>): T {
  if (!result.ok) throw new Error(result.message);
  return result.data as T;
}

describe("local demo", () => {
  it("searches title/author and shows empty-query candidates", () => {
    const demo = createDemoStore(memoryStorage());
    expect(data<SearchResult>(demo.call("search-works", null, { q: "朝日" })).db).toHaveLength(2);
    expect(data<SearchResult>(demo.call("search-works", null, { q: "月あかり" })).rakuten).toHaveLength(1);
    expect(data<SearchResult>(demo.call("search-works", null, { q: "" })).db).toHaveLength(6);
    expect(data<SearchResult>(demo.call("search-works", null, { q: "見つからない" })).db).toHaveLength(0);
  });
  it("persists registration and a review across repository recreation, then resets only demo data", () => {
    const storage = memoryStorage();
    storage.setItem("unrelated", "keep");
    const demo = createDemoStore(storage);
    const args = { rakutenItemCode: demoCatalog[0].itemCode, title: "untrusted title" };
    const { work } = data<{ work: WorkSummary }>(demo.call("register-work", args));
    expect(work.title).toBe(demoCatalog[0].title);
    expect(data<{ work: WorkSummary }>(demo.call("register-work", args)).work.id).toBe(work.id);
    expect(demo.call("register-work", { rakutenItemCode: "unknown" }).ok).toBe(false);
    const review = { workId: work.id, body: "続きが気になる展開で、登場人物も魅力的な漫画でした。", rating: 5, hasSpoiler: true };
    expect(demo.call("post-review", { ...review, body: "短い" }).ok).toBe(false);
    expect(demo.call("post-review", { ...review, rating: 9 }).ok).toBe(false);
    expect(demo.call("post-review", review).ok).toBe(true);
    const restored = createDemoStore(storage);
    expect(restored.pending(work.id)?.title).toBe(work.title);
    expect(restored.reviews(work.id)[0]).toMatchObject({ body: review.body, hasSpoiler: true, nickname: "名無し" });
    const found = data<SearchResult>(restored.call("search-works", null, { q: work.title }));
    expect(found.rakuten).toHaveLength(0);
    expect(found.db[0]).toMatchObject({ id: work.id, reviewCount: 1, status: "pending" });
    restored.reset();
    expect(restored.pending(work.id)).toBeNull();
    expect(restored.reviews(work.id)).toHaveLength(0);
    expect(storage.getItem("unrelated")).toBe("keep");
  });
  it("persists undirected votes and rejects duplicate, self and missing targets", () => {
    const storage = memoryStorage();
    const demo = createDemoStore(storage);
    const [a, b] = fixtures.allWorks();
    expect(demo.call("vote-similar", { fromWorkId: a.id, toWorkId: a.id }).ok).toBe(false);
    expect(demo.call("vote-similar", { fromWorkId: a.id, toWorkId: "missing" }).ok).toBe(false);
    expect(demo.call("vote-similar", { fromWorkId: a.id, toWorkId: b.id }).ok).toBe(true);
    expect(createDemoStore(storage).hasVote(b.id, a.id)).toBe(true);
    expect(demo.call("vote-similar", { fromWorkId: b.id, toWorkId: a.id })).toMatchObject({ ok: false, status: 409 });
    demo.reset();
    expect(demo.hasVote(a.id, b.id)).toBe(false);
  });
  it("stores reports and returns errors instead of success when storage fails", () => {
    const storage = memoryStorage();
    const demo = createDemoStore(storage);
    expect(demo.call("report-review", { reviewId: "r1" }).ok).toBe(true);
    expect(createDemoStore(storage).call("report-review", { reviewId: "r1" })).toMatchObject({ ok: false, status: 409 });
    expect(demo.call("report-review", { reviewId: "missing" }).ok).toBe(false);
    expect(demo.call("unsupported", {}).ok).toBe(false);
    const failing = createDemoStore({ ...storage, setItem: () => { throw new Error("quota"); } });
    expect(failing.call("register-work", { rakutenItemCode: demoCatalog[0].itemCode }).ok).toBe(false);
    storage.setItem(DEMO_STORAGE_KEY, "broken");
    expect(demo.call("search-works", null, { q: "" }).ok).toBe(false);
    demo.reset();
    expect(demo.call("search-works", null, { q: "" }).ok).toBe(true);
  });
});
