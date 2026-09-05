import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/AdSlot";
import { AffiliateBanner, bannersFor } from "@/components/AffiliateBanner";
import { BuyLinks } from "@/components/BuyLinks";
import { JsonLd } from "@/components/JsonLd";
import { ReviewList } from "@/components/ReviewList";
import { SimilarWorks } from "@/components/SimilarWorks";
import { WorkHeader } from "@/components/WorkHeader";
import { config } from "@/lib/config";
import { fetchReviewsForWork } from "@/lib/data/reviews";
import { fetchAllWorkSlugs, fetchWorkBySlug } from "@/lib/data/works";
import { breadcrumbJsonLd, workJsonLd, workMetadata, workPath } from "@/lib/seo";

export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await fetchAllWorkSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const work = await fetchWorkBySlug(slug);
  return work ? workMetadata(work) : {};
}

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const work = await fetchWorkBySlug(slug);
  if (!work) notFound();

  const reviews = await fetchReviewsForWork(work.id);
  const builtAt = new Date().toISOString();
  const hasSidebar = config.adsEnabled || bannersFor("sidebar").length > 0;

  return (
    <div className={hasSidebar ? "md:grid md:grid-cols-[1fr_280px] md:gap-8" : ""}>
      <JsonLd data={workJsonLd(work, reviews)} />
      <JsonLd data={breadcrumbJsonLd([{ name: "トップ", path: "/" }, { name: work.title, path: workPath(work.slug) }])} />

      <div className="space-y-10 min-w-0">
        <WorkHeader
          title={work.title}
          authors={work.authors}
          publisher={work.publisher}
          coverUrl={work.coverUrl}
          synopsis={work.synopsis}
          volumeCount={work.volumeCount}
          firstSalesDate={work.firstSalesDate}
          tags={work.tags}
        />
        <BuyLinks links={work.buyLinks} />
        <SimilarWorks items={work.similar} fromWorkId={work.id} />
        <AffiliateBanner placement="work_bottom" />
        <ReviewList workId={work.id} initialReviews={reviews} builtAt={builtAt} />
        <AdSlot placement="work_bottom" />
      </div>

      {hasSidebar ? (
        <aside className="hidden md:block space-y-6">
          <AffiliateBanner placement="sidebar" />
          <AdSlot placement="sidebar" />
        </aside>
      ) : null}
    </div>
  );
}
