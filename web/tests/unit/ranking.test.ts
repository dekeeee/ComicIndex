import { describe, expect, it } from "vitest";
import { countRecent, featuredScore, sortFeatured } from "@/lib/ranking";
import type { WorkStats, WorkSummary } from "@/lib/types";

const work = (id: string, stats: Partial<WorkStats> = {}, reviewCount = 0): WorkSummary & WorkStats => ({
  id,
  slug: id,
  title: id,
  authors: [],
  coverUrl: null,
  reviewCount,
  status: "published",
  recentReviewCount: stats.recentReviewCount ?? 0,
  recentVoteCount: stats.recentVoteCount ?? 0,
});

describe("featuredScore", () => {
  it("weights reviews above votes", () => {
    expect(featuredScore({ recentReviewCount: 2, recentVoteCount: 2 })).toBe(3);
  });
});

describe("sortFeatured", () => {
  it("orders by score, then review count, then id for stability", () => {
    const sorted = sortFeatured([work("c"), work("b", {}, 5), work("a", { recentReviewCount: 1 })]);
    expect(sorted.map((w) => w.id)).toEqual(["a", "b", "c"]);
  });
  it("is deterministic for identical stats", () => {
    const sorted = sortFeatured([work("z"), work("y"), work("x")]);
    expect(sorted.map((w) => w.id)).toEqual(["x", "y", "z"]);
  });
  it("does not mutate the input", () => {
    const input = [work("b"), work("a")];
    sortFeatured(input);
    expect(input.map((w) => w.id)).toEqual(["b", "a"]);
  });
});

describe("countRecent", () => {
  it("counts only timestamps inside the window", () => {
    const now = new Date("2026-09-03T00:00:00Z");
    const stamps = ["2026-09-02T00:00:00Z", "2026-08-01T00:00:00Z", "2026-08-04T00:00:01Z"];
    expect(countRecent(stamps, now, 30)).toBe(2);
  });
});
