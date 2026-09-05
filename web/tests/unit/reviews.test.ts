import { describe, expect, it } from "vitest";
import { mergeReviews } from "@/lib/data/reviews";
import type { Review } from "@/lib/types";

const review = (id: string, createdAt: string): Review => ({
  id,
  workId: "w",
  nickname: "名無し",
  body: "x".repeat(20),
  rating: 3,
  hasSpoiler: false,
  createdAt,
});

describe("mergeReviews", () => {
  it("drops duplicates by id and sorts newest first", () => {
    const base = [review("a", "2026-09-01T00:00:00Z"), review("b", "2026-08-01T00:00:00Z")];
    const incoming = [review("b", "2026-08-01T00:00:00Z"), review("c", "2026-09-02T00:00:00Z")];
    expect(mergeReviews(base, incoming).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
  it("keeps the base list when nothing is new", () => {
    const base = [review("a", "2026-09-01T00:00:00Z")];
    expect(mergeReviews(base, [])).toHaveLength(1);
  });
});
