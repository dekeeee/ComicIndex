import { demoEnabled, demoStore } from "@/lib/demo";
import { config } from "@/lib/config";
import { WORK_SUMMARY_COLUMNS, type ReviewPublicRow, type WorkSummaryRow } from "@/lib/db-rows";
import { fixtures, useFixtures } from "@/lib/fixtures";
import { toReview, toWorkSummary } from "@/lib/mappers";
import { createAnonClient, fetchAllRows } from "@/lib/supabase";
import type { Review, ReviewWithWork } from "@/lib/types";

const REVIEW_COLUMNS = "id, work_id, nickname, body, rating, has_spoiler, created_at";

/** All visible reviews for a work, newest first (build time). */
export async function fetchReviewsForWork(workId: string): Promise<Review[]> {
  if (useFixtures) return fixtures.reviewsForWork(workId);
  if (!config.hasSupabase) return [];
  const client = createAnonClient();
  const rows = await fetchAllRows<ReviewPublicRow>((from, to) =>
    client
      .from("reviews_public")
      .select(REVIEW_COLUMNS)
      .eq("work_id", workId)
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  return rows.map(toReview);
}

/** Reviews created after `sinceIso` (client side, to top up the static page). */
export async function fetchReviewsSince(workId: string, sinceIso: string): Promise<Review[]> {
  if (demoEnabled) return demoStore().reviews(workId);
  if (useFixtures || !config.hasSupabase) return [];
  const client = createAnonClient();
  const { data, error } = await client
    .from("reviews_public")
    .select(REVIEW_COLUMNS)
    .eq("work_id", workId)
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .returns<ReviewPublicRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(toReview);
}

/** Latest visible reviews across the site, with their work (top page). */
export async function fetchLatestReviews(limit: number): Promise<ReviewWithWork[]> {
  if (useFixtures) return fixtures.latestReviews(limit);
  if (!config.hasSupabase) return [];
  const client = createAnonClient();
  const { data, error } = await client
    .from("reviews_public")
    .select(REVIEW_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ReviewPublicRow[]>();
  if (error) throw new Error(error.message);
  const reviews = (data ?? []).map(toReview);
  if (reviews.length === 0) return [];

  const ids = Array.from(new Set(reviews.map((r) => r.workId)));
  const { data: works, error: worksError } = await client
    .from("works")
    .select(WORK_SUMMARY_COLUMNS)
    .in("id", ids)
    .returns<WorkSummaryRow[]>();
  if (worksError) throw new Error(worksError.message);
  const byId = new Map((works ?? []).map((w) => [w.id, toWorkSummary(w)]));

  return reviews.flatMap((r) => {
    const work = byId.get(r.workId);
    return work ? [{ ...r, work }] : [];
  });
}

/** Merges two review lists by id, newest first. Used when topping up static pages. */
export function mergeReviews(base: Review[], incoming: Review[]): Review[] {
  const seen = new Set(base.map((r) => r.id));
  const merged = [...base];
  for (const r of incoming) {
    if (!seen.has(r.id)) {
      merged.push(r);
      seen.add(r.id);
    }
  }
  return merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
