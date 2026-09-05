import { describe, expect, it } from "vitest";
import { pageCount, paginate } from "@/lib/pagination";

const items = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("pageCount", () => {
  it("returns 1 for zero items", () => expect(pageCount(0, 48)).toBe(1));
  it("returns 1 for exactly one page", () => expect(pageCount(48, 48)).toBe(1));
  it("returns 2 when one item spills over", () => expect(pageCount(49, 48)).toBe(2));
  it("rejects non-positive sizes", () => expect(() => pageCount(10, 0)).toThrow());
});

describe("paginate", () => {
  it("handles an empty list", () => {
    expect(paginate([], 1, 48)).toEqual({ items: [], page: 1, pageCount: 1, total: 0 });
  });
  it("returns the first page", () => {
    const r = paginate(items(49), 1, 48);
    expect(r.items).toHaveLength(48);
    expect(r.items[0]).toBe(1);
    expect(r.pageCount).toBe(2);
  });
  it("returns the spill-over on page 2", () => {
    expect(paginate(items(49), 2, 48).items).toEqual([49]);
  });
  it("returns an empty page beyond the end", () => {
    expect(paginate(items(10), 5, 48).items).toEqual([]);
  });
  it("clamps page 0 to page 1", () => {
    expect(paginate(items(3), 0, 2).page).toBe(1);
  });
});
