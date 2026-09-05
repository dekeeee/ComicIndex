import type { WorkStats, WorkSummary } from "@/lib/types";

const VOTE_WEIGHT = 0.5;

/** "Featured" score: recent reviews count fully, recent votes at half weight. */
export function featuredScore(stats: WorkStats): number {
  return stats.recentReviewCount + VOTE_WEIGHT * stats.recentVoteCount;
}

/** Sorts by featured score desc, then total review count desc, then id asc for a stable order. */
export function sortFeatured<T extends WorkSummary & WorkStats>(works: T[]): T[] {
  return [...works].sort((a, b) => {
    const diff = featuredScore(b) - featuredScore(a);
    if (diff !== 0) return diff;
    if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Counts items whose ISO timestamp falls within the last `days` days of `now`. */
export function countRecent(timestamps: string[], now: Date, days: number): number {
  const threshold = now.getTime() - days * 24 * 60 * 60 * 1000;
  return timestamps.filter((iso) => Date.parse(iso) >= threshold).length;
}
