import type { Metadata } from "next";
import { config } from "@/lib/config";
import type { Review, WorkDetail } from "@/lib/types";

export function workPath(slug: string): string {
  return `/works/${slug}/`;
}

export function workUrl(slug: string): string {
  return `${config.siteUrl}${workPath(slug)}`;
}

export function workDescription(work: WorkDetail): string {
  const base = work.synopsis?.replace(/\s+/g, " ").trim() ?? "";
  const lead = `${work.title}（${work.authors.join("、")}）のレビュー・口コミと似ている漫画。`;
  return (lead + base).slice(0, 160);
}

export function workMetadata(work: WorkDetail): Metadata {
  // The root layout appends "| siteName" through its title template.
  const title = `${work.title} のレビュー・似ている漫画`;
  const description = workDescription(work);
  const url = workUrl(work.slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "book",
      siteName: config.siteName,
      images: work.coverUrl ? [{ url: work.coverUrl }] : undefined,
    },
    twitter: { card: "summary", title, description },
  };
}

export function workJsonLd(work: WorkDetail, reviews: Review[]): Record<string, unknown> {
  const ratings = reviews.map((r) => r.rating);
  const aggregate =
    ratings.length > 0
      ? {
          "@type": "AggregateRating",
          ratingValue: Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)),
          reviewCount: ratings.length,
          bestRating: config.ratingMax,
          worstRating: config.ratingMin,
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Book",
    name: work.title,
    author: work.authors.map((name) => ({ "@type": "Person", name })),
    publisher: work.publisher ? { "@type": "Organization", name: work.publisher } : undefined,
    image: work.coverUrl ?? undefined,
    description: work.synopsis ?? undefined,
    url: workUrl(work.slug),
    genre: work.tags.filter((t) => t.category === "genre").map((t) => t.name),
    aggregateRating: aggregate,
    review: reviews.slice(0, 10).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.nickname },
      datePublished: r.createdAt,
      reviewBody: r.body,
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: config.ratingMax, worstRating: config.ratingMin },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${config.siteUrl}${item.path}`,
    })),
  };
}
