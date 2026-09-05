import banners from "@/content/affiliate-banners.json";
import { buildBuyLinks } from "@/lib/buy-links";
import { config } from "@/lib/config";
import {
  WORK_DETAIL_COLUMNS,
  WORK_SUMMARY_COLUMNS,
  type SimilarityRow,
  type VoteCountRow,
  type WorkRow,
  type WorkSummaryRow,
  type WorkTagRow,
} from "@/lib/db-rows";
import { fixtures, useFixtures } from "@/lib/fixtures";
import { toWorkSummary } from "@/lib/mappers";
import { countRecent, sortFeatured } from "@/lib/ranking";
import { createAnonClient, fetchAllRows } from "@/lib/supabase";
import type { AffiliateBannerDef, SimilarWork, TagWithWeight, WorkDetail, WorkStats, WorkSummary } from "@/lib/types";

const bannerDefs = banners as AffiliateBannerDef[];

/** Every published, non-adult work. RLS already enforces the filter; it is repeated for clarity. */
export async function fetchAllWorks(): Promise<WorkSummary[]> {
  if (useFixtures) return fixtures.allWorks();
  if (!config.hasSupabase) return [];
  const client = createAnonClient();
  const rows = await fetchAllRows<WorkSummaryRow>((from, to) =>
    client.from("works").select(WORK_SUMMARY_COLUMNS).eq("status", "published").order("id").range(from, to),
  );
  return rows.map(toWorkSummary);
}

export async function fetchAllWorkSlugs(): Promise<string[]> {
  const works = await fetchAllWorks();
  return works.map((w) => w.slug);
}

export async function fetchWorkBySlug(slug: string): Promise<WorkDetail | null> {
  if (useFixtures) return fixtures.workBySlug(slug);
  if (!config.hasSupabase) return null;
  const client = createAnonClient();

  const { data: work, error } = await client
    .from("works")
    .select(WORK_DETAIL_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<WorkRow>();
  if (error) throw new Error(error.message);
  if (!work) return null;

  const [tags, similar] = await Promise.all([fetchTagsForWork(work.id), fetchSimilarForWork(work.id)]);

  return {
    ...toWorkSummary(work),
    titleKana: work.title_kana,
    publisher: work.publisher,
    synopsis: work.synopsis,
    firstSalesDate: work.first_sales_date,
    volumeCount: work.volume_count,
    tags,
    buyLinks: buildBuyLinks(
      { affiliateUrlRakuten: work.affiliate_url_rakuten, affiliateUrlAmazon: work.affiliate_url_amazon },
      bannerDefs,
      config.affiliateBannersEnabled,
    ),
    similar,
  };
}

async function fetchTagsForWork(workId: string): Promise<TagWithWeight[]> {
  const client = createAnonClient();
  const { data, error } = await client
    .from("work_tags")
    .select("work_id, weight, tags ( id, slug, name, category )")
    .eq("work_id", workId)
    .order("weight", { ascending: false })
    .returns<WorkTagRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => row.tags !== null)
    .map((row) => ({ ...row.tags!, weight: row.weight }));
}

async function fetchSimilarForWork(workId: string): Promise<SimilarWork[]> {
  const client = createAnonClient();
  const { data: sims, error } = await client
    .from("work_similarity")
    .select("from_work_id, to_work_id, rank, score")
    .eq("from_work_id", workId)
    .order("rank")
    .limit(config.similarDisplayCount)
    .returns<SimilarityRow[]>();
  if (error) throw new Error(error.message);
  if (!sims || sims.length === 0) return [];

  const ids = sims.map((s) => s.to_work_id);
  const [{ data: works, error: worksError }, { data: votes, error: votesError }] = await Promise.all([
    client.from("works").select(WORK_SUMMARY_COLUMNS).in("id", ids).returns<WorkSummaryRow[]>(),
    client
      .from("similar_vote_counts_directed")
      .select("from_work_id, to_work_id, votes")
      .eq("from_work_id", workId)
      .in("to_work_id", ids)
      .returns<VoteCountRow[]>(),
  ]);
  if (worksError) throw new Error(worksError.message);
  if (votesError) throw new Error(votesError.message);

  const byId = new Map((works ?? []).map((w) => [w.id, toWorkSummary(w)]));
  const voteById = new Map((votes ?? []).map((v) => [v.to_work_id, v.votes]));

  return sims.flatMap((s) => {
    const summary = byId.get(s.to_work_id);
    if (!summary) return []; // adult / unpublished works are invisible under RLS
    return [{ ...summary, rank: s.rank, score: s.score, voteCount: voteById.get(s.to_work_id) ?? 0 }];
  });
}

/** Works ranked by recent activity for the top page. */
export async function fetchFeaturedWorks(limit: number, now = new Date()): Promise<WorkSummary[]> {
  if (useFixtures) return fixtures.featured(limit);
  if (!config.hasSupabase) return [];
  const client = createAnonClient();
  const since = new Date(now.getTime() - config.featuredWindowDays * 24 * 60 * 60 * 1000).toISOString();

  const [recentReviews, voteRows, works] = await Promise.all([
    fetchAllRows<{ work_id: string; created_at: string }>((from, to) =>
      client.from("reviews_public").select("work_id, created_at").gte("created_at", since).range(from, to),
    ),
    fetchAllRows<VoteCountRow>((from, to) =>
      client.from("similar_vote_counts_directed").select("from_work_id, to_work_id, votes").range(from, to),
    ),
    fetchAllWorks(),
  ]);

  const reviewTimes = new Map<string, string[]>();
  for (const r of recentReviews) reviewTimes.set(r.work_id, [...(reviewTimes.get(r.work_id) ?? []), r.created_at]);
  const voteTotals = new Map<string, number>();
  for (const v of voteRows) voteTotals.set(v.from_work_id, (voteTotals.get(v.from_work_id) ?? 0) + v.votes);

  const withStats: (WorkSummary & WorkStats)[] = works.map((w) => ({
    ...w,
    recentReviewCount: countRecent(reviewTimes.get(w.id) ?? [], now, config.featuredWindowDays),
    recentVoteCount: voteTotals.get(w.id) ?? 0,
  }));

  return sortFeatured(withStats).slice(0, limit);
}
