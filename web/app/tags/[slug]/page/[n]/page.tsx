import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TagWorksList } from "@/components/TagWorksList";
import { config } from "@/lib/config";
import { fetchTagBySlug, fetchTagsWithCounts, fetchWorksByTag } from "@/lib/data/tags";
import { pageCount } from "@/lib/pagination";

export const dynamicParams = false;

/**
 * Static export refuses an empty param list, so when no tag spills past page 1
 * we emit one placeholder route that renders the 404 page.
 */
const PLACEHOLDER = { slug: "_", n: "2" };

/** Pages 2..N for every tag; page 1 lives at /tags/[slug]/. */
export async function generateStaticParams(): Promise<{ slug: string; n: string }[]> {
  const tags = await fetchTagsWithCounts();
  const params = tags.flatMap((t) => {
    const total = pageCount(t.workCount, config.tagPageSize);
    return Array.from({ length: Math.max(0, total - 1) }, (_, i) => ({ slug: t.slug, n: String(i + 2) }));
  });
  return params.length > 0 ? params : [PLACEHOLDER];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; n: string }> }): Promise<Metadata> {
  const { slug, n } = await params;
  const tag = await fetchTagBySlug(slug);
  if (!tag) return {};
  return { title: `${tag.name}の漫画一覧 ${n}ページ目` };
}

export default async function TagPageN({ params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params;
  const page = Number(n);
  if (!Number.isInteger(page) || page < 2) notFound();
  const [tag, result] = await Promise.all([fetchTagBySlug(slug), fetchWorksByTag(slug, page)]);
  if (!tag || !result || page > result.pageCount) notFound();
  return <TagWorksList tag={tag} result={result} />;
}
