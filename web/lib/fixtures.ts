import { buildBuyLinks } from "@/lib/buy-links";
import { paginate } from "@/lib/pagination";
import type { Paginated, PendingWork, Review, ReviewWithWork, SimilarWork, Tag, TagWithCount, TagWithWeight, WorkDetail, WorkSummary } from "@/lib/types";

/**
 * In-memory sample data used when NEXT_PUBLIC_USE_FIXTURES=true (local preview, CI smoke build).
 * Never enabled in production; the deploy workflow sets real Supabase credentials instead.
 */
export const useFixtures = (process.env.NEXT_PUBLIC_USE_FIXTURES ?? "").toLowerCase() === "true";

const tags: Tag[] = [
  { id: 1, slug: "shonen", name: "少年", category: "genre" },
  { id: 2, slug: "seinen", name: "青年", category: "genre" },
  { id: 3, slug: "isekai", name: "異世界", category: "theme" },
  { id: 4, slug: "school", name: "学園", category: "setting" },
  { id: 5, slug: "tearjerker", name: "泣ける", category: "mood" },
  { id: 6, slug: "battle", name: "バトル", category: "theme" },
];

interface FixtureWork extends WorkDetail {
  tagIds: number[];
}

const COVER = "https://placehold.co/400x600/e6e1d8/6b665e?text=";

function mkWork(n: number, title: string, authors: string[], tagIds: number[], synopsis: string): FixtureWork {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    slug: `w-sample${n}`,
    title,
    authors,
    coverUrl: process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? null : `${COVER}${encodeURIComponent(title)}`,
    reviewCount: 0,
    status: "published",
    titleKana: null,
    publisher: "サンプル出版",
    synopsis,
    firstSalesDate: `20${10 + n}-04-01`,
    volumeCount: n + 2,
    tags: [],
    buyLinks: buildBuyLinks(
      {
        affiliateUrlRakuten: "https://books.rakuten.co.jp/",
        affiliateUrlAmazon: n === 1 ? "https://www.amazon.co.jp/dp/4088820177?tag=example-22" : null,
      },
      [],
      false,
    ),
    similar: [],
    tagIds,
  };
}

const works: FixtureWork[] = [
  mkWork(1, "剣と魔法の放課後", ["朝日 奈々"], [1, 3, 4, 6], "普通の高校生が放課後だけ異世界に召喚される。帰るためには魔王を倒すしかない。"),
  mkWork(2, "夕焼けの向こう側", ["山田 太郎"], [2, 5], "田舎町で暮らす姉弟の10年を描く、静かな家族の物語。"),
  mkWork(3, "鋼の転生録", ["佐藤 花"], [1, 3, 6], "トラックにひかれた青年が鍛冶師として異世界に転生。武器で世界を変える。"),
  mkWork(4, "放送部の朝", ["鈴木 一"], [1, 4], "廃部寸前の放送部を立て直す、笑って泣ける部活青春もの。"),
  mkWork(5, "灰色の都市", ["高橋 実"], [2, 6], "犯罪都市で生き抜く元刑事の復讐劇。ハードボイルド。"),
  mkWork(6, "星を数える夜", ["朝日 奈々"], [2, 5], "余命を告げられた天文学者と、その娘の最後の一年。"),
];

const reviews: Review[] = [
  { id: "r1", workId: works[0].id, nickname: "名無し", body: "設定は王道だけどテンポが良くて一気読みしました。主人公の成長が丁寧。", rating: 4, hasSpoiler: false, createdAt: "2026-08-30T10:00:00Z" },
  { id: "r2", workId: works[0].id, nickname: "漫画好き", body: "最終巻の展開でまさか魔王が味方になるとは思わなかった。伏線回収が見事でした。", rating: 5, hasSpoiler: true, createdAt: "2026-08-28T10:00:00Z" },
  { id: "r3", workId: works[1].id, nickname: "名無し", body: "派手さはないけれど、読み終わったあとに静かに残る作品。夕焼けの描写が本当にきれい。", rating: 5, hasSpoiler: false, createdAt: "2026-09-01T10:00:00Z" },
];

for (const w of works) w.reviewCount = reviews.filter((r) => r.workId === w.id).length;

function toSummary(w: FixtureWork): WorkSummary {
  return { id: w.id, slug: w.slug, title: w.title, authors: w.authors, coverUrl: w.coverUrl, reviewCount: w.reviewCount, status: w.status };
}

function tagsFor(w: FixtureWork): TagWithWeight[] {
  return tags.filter((t) => w.tagIds.includes(t.id)).map((t) => ({ ...t, weight: 1 }));
}

function similarFor(w: FixtureWork): SimilarWork[] {
  return works
    .filter((o) => o.id !== w.id)
    .map((o) => ({ o, shared: o.tagIds.filter((t) => w.tagIds.includes(t)).length }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .map(({ o, shared }, i) => ({ ...toSummary(o), rank: i + 1, score: shared / 4, voteCount: (i * 3) % 5 }));
}

export const fixtures = {
  allWorks: (): WorkSummary[] => works.map(toSummary),
  workBySlug: (slug: string): WorkDetail | null => {
    const w = works.find((x) => x.slug === slug);
    if (!w) return null;
    const { tagIds: _tagIds, ...rest } = w;
    void _tagIds;
    return { ...rest, tags: tagsFor(w), similar: similarFor(w) };
  },
  featured: (limit: number): WorkSummary[] => [...works].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, limit).map(toSummary),
  reviewsForWork: (workId: string): Review[] => reviews.filter((r) => r.workId === workId),
  latestReviews: (limit: number): ReviewWithWork[] =>
    [...reviews]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit)
      .map((r) => ({ ...r, work: toSummary(works.find((w) => w.id === r.workId)!) })),
  allTags: (): Tag[] => tags,
  tagsWithCounts: (): TagWithCount[] =>
    tags.map((t) => ({ ...t, workCount: works.filter((w) => w.tagIds.includes(t.id)).length })).filter((t) => t.workCount > 0),
  tagBySlug: (slug: string): Tag | null => tags.find((t) => t.slug === slug) ?? null,
  worksByTag: (slug: string, page: number, size: number): Paginated<WorkSummary> | null => {
    const tag = tags.find((t) => t.slug === slug);
    if (!tag) return null;
    return paginate(works.filter((w) => w.tagIds.includes(tag.id)).map(toSummary), page, size);
  },
  pendingWork: (): PendingWork | null => null,
};
