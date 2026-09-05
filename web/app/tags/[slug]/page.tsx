import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TagWorksList } from "@/components/TagWorksList";
import { fetchTagBySlug, fetchTagsWithCounts, fetchWorksByTag } from "@/lib/data/tags";

export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const tags = await fetchTagsWithCounts();
  return tags.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tag = await fetchTagBySlug(slug);
  if (!tag) return {};
  return {
    title: `${tag.name}の漫画一覧`,
    description: `「${tag.name}」タグが付いた漫画のレビューと似ている作品。`,
  };
}

export default async function TagPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tag, result] = await Promise.all([fetchTagBySlug(slug), fetchWorksByTag(slug, 1)]);
  if (!tag || !result) notFound();
  return <TagWorksList tag={tag} result={result} />;
}
