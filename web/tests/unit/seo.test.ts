import { describe, expect, it } from "vitest";
import { workDescription, workJsonLd, workPath } from "@/lib/seo";
import type { Review, WorkDetail } from "@/lib/types";

const work: WorkDetail = {
  id: "w1",
  slug: "w-abc",
  title: "テスト作品",
  authors: ["作者A"],
  coverUrl: "https://example.com/c.jpg",
  reviewCount: 1,
  status: "published",
  titleKana: null,
  publisher: "出版社",
  synopsis: "あらすじ  改行\nあり".repeat(20),
  firstSalesDate: "2020-01-01",
  volumeCount: 3,
  tags: [{ id: 1, slug: "shonen", name: "少年", category: "genre", weight: 1 }],
  buyLinks: [],
  similar: [],
};

const review: Review = {
  id: "r1",
  workId: "w1",
  nickname: "名無し",
  body: "x".repeat(20),
  rating: 4,
  hasSpoiler: false,
  createdAt: "2026-09-01T00:00:00Z",
};

describe("workPath", () => {
  it("has a trailing slash for static export", () => expect(workPath("w-abc")).toBe("/works/w-abc/"));
});

describe("workDescription", () => {
  it("collapses whitespace and caps at 160 chars", () => {
    const d = workDescription(work);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).not.toContain("\n");
    expect(d.startsWith("テスト作品（作者A）")).toBe(true);
  });
});

describe("workJsonLd", () => {
  it("emits a Book with aggregate rating when reviews exist", () => {
    const ld = workJsonLd(work, [review, { ...review, id: "r2", rating: 2 }]);
    expect(ld["@type"]).toBe("Book");
    expect(ld.genre).toEqual(["少年"]);
    expect((ld.aggregateRating as { ratingValue: number }).ratingValue).toBe(3);
    expect((ld.review as unknown[]).length).toBe(2);
  });
  it("omits aggregate rating with no reviews", () => {
    expect(workJsonLd(work, []).aggregateRating).toBeUndefined();
  });
});
