import { config } from "@/lib/config";
import { WORK_SUMMARY_COLUMNS, type TagRow, type WorkSummaryRow } from "@/lib/db-rows";
import { fixtures, useFixtures } from "@/lib/fixtures";
import { toTag, toWorkSummary } from "@/lib/mappers";
import { paginate } from "@/lib/pagination";
import { createAnonClient, fetchAllRows } from "@/lib/supabase";
import type { Paginated, Tag, TagWithCount, WorkSummary } from "@/lib/types";

interface WorkTagLink {
  work_id: string;
  tag_id: number;
  weight: number;
}

export async function fetchAllTags(): Promise<Tag[]> {
  if (useFixtures) return fixtures.allTags();
  if (!config.hasSupabase) return [];
  const client = createAnonClient();
  const rows = await fetchAllRows<TagRow>((from, to) =>
    client.from("tags").select("id, slug, name, category").order("id").range(from, to),
  );
  return rows.map(toTag);
}

/** Tags with the number of visible works attached (tags with zero works are dropped). */
export async function fetchTagsWithCounts(): Promise<TagWithCount[]> {
  if (useFixtures) return fixtures.tagsWithCounts();
  if (!config.hasSupabase) return [];
  const client = createAnonClient();
  const [tags, links] = await Promise.all([
    fetchAllTags(),
    fetchAllRows<WorkTagLink>((from, to) => client.from("work_tags").select("work_id, tag_id, weight").range(from, to)),
  ]);
  const counts = new Map<number, number>();
  for (const link of links) counts.set(link.tag_id, (counts.get(link.tag_id) ?? 0) + 1);
  return tags
    .map((t) => ({ ...t, workCount: counts.get(t.id) ?? 0 }))
    .filter((t) => t.workCount > 0)
    .sort((a, b) => b.workCount - a.workCount || a.name.localeCompare(b.name, "ja"));
}

export async function fetchTagBySlug(slug: string): Promise<Tag | null> {
  if (useFixtures) return fixtures.tagBySlug(slug);
  if (!config.hasSupabase) return null;
  const client = createAnonClient();
  const { data, error } = await client.from("tags").select("id, slug, name, category").eq("slug", slug).maybeSingle<TagRow>();
  if (error) throw new Error(error.message);
  return data ? toTag(data) : null;
}

/** Works for a tag ordered by weight desc then review count desc, paginated. */
export async function fetchWorksByTag(slug: string, page: number): Promise<Paginated<WorkSummary> | null> {
  if (useFixtures) return fixtures.worksByTag(slug, page, config.tagPageSize);
  const tag = await fetchTagBySlug(slug);
  if (!tag) return null;
  const client = createAnonClient();
  const links = await fetchAllRows<WorkTagLink>((from, to) =>
    client.from("work_tags").select("work_id, tag_id, weight").eq("tag_id", tag.id).range(from, to),
  );
  if (links.length === 0) return paginate<WorkSummary>([], page, config.tagPageSize);

  const weightById = new Map(links.map((l) => [l.work_id, l.weight]));
  const ids = links.map((l) => l.work_id);
  const works: WorkSummary[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await client
      .from("works")
      .select(WORK_SUMMARY_COLUMNS)
      .in("id", ids.slice(i, i + 500))
      .returns<WorkSummaryRow[]>();
    if (error) throw new Error(error.message);
    works.push(...(data ?? []).map(toWorkSummary));
  }
  works.sort((a, b) => {
    const dw = (weightById.get(b.id) ?? 0) - (weightById.get(a.id) ?? 0);
    if (dw !== 0) return dw;
    if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
    return a.title.localeCompare(b.title, "ja");
  });
  return paginate(works, page, config.tagPageSize);
}
