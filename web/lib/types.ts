export type WorkStatus = "pending" | "published" | "rejected";
export type ReviewStatus = "visible" | "pending" | "hidden";
export type TagCategory = "genre" | "theme" | "mood" | "setting";
export type ReportReason = "spam" | "spoiler" | "abuse" | "copyright" | "other";
export type AdPlacement = "work_bottom" | "sidebar" | "tag_bottom";
export type Rating = 1 | 2 | 3 | 4 | 5;

export interface Tag {
  id: number;
  slug: string;
  name: string;
  category: TagCategory;
}

export interface TagWithWeight extends Tag {
  weight: number;
}

export interface TagWithCount extends Tag {
  workCount: number;
}

export interface WorkSummary {
  id: string;
  slug: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  reviewCount: number;
  status: WorkStatus;
}

export interface BuyLink {
  store: "rakuten" | "amazon" | "ebook";
  label: string;
  url: string;
  imageUrl?: string;
}

export interface SimilarWork extends WorkSummary {
  rank: number;
  score: number;
  voteCount: number;
}

export interface WorkDetail extends WorkSummary {
  titleKana: string | null;
  publisher: string | null;
  synopsis: string | null;
  firstSalesDate: string | null;
  volumeCount: number;
  tags: TagWithWeight[];
  buyLinks: BuyLink[];
  similar: SimilarWork[];
}

export interface Review {
  id: string;
  workId: string;
  nickname: string;
  body: string;
  rating: Rating;
  hasSpoiler: boolean;
  createdAt: string;
  /** Present only on freshly posted reviews (server echoes the moderation result). */
  status?: ReviewStatus;
}

export interface ReviewWithWork extends Review {
  work: WorkSummary;
}

export interface ReviewInput {
  workId: string;
  nickname?: string;
  body: string;
  rating: number;
  hasSpoiler: boolean;
}

export interface WorkStats {
  recentReviewCount: number;
  recentVoteCount: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
}

export interface RakutenCandidate {
  itemCode: string;
  title: string;
  author: string;
  imageUrl: string;
  salesDate: string;
}

export interface SearchResult {
  db: WorkSummary[];
  rakuten: RakutenCandidate[];
}

export interface PendingWork {
  id: string;
  slug: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  publisher: string | null;
  synopsis: string | null;
  affiliateUrlRakuten: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

export type ValidationResult = { ok: true } | { ok: false; errors: Record<string, string> };

export interface AffiliateBannerDef {
  id: string;
  store: string;
  url: string;
  imageUrl: string;
  alt: string;
  placements: AdPlacement[];
  enabled: boolean;
}
