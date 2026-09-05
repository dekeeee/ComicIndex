import { config } from "@/lib/config";
import { fixtures } from "@/lib/fixtures";
import type { ApiResult, PendingWork, RakutenCandidate, Rating, Review, ReviewInput, WorkSummary } from "@/lib/types";
import { validateReviewInput } from "@/lib/validation";

export const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const DEMO_STORAGE_KEY = "comicomi-demo-v1";
export const DEMO_EVENT = "comicomi-demo-change";

export const demoCatalog: RakutenCandidate[] = [
  { itemCode: "demo-moon", title: "月あかりの図書館", author: "森 ひかり", imageUrl: "", salesDate: "デモ作品" },
  { itemCode: "demo-ocean", title: "海辺の冒険者", author: "青山 海", imageUrl: "", salesDate: "デモ作品" },
];

interface DemoState {
  version: 1;
  works: (PendingWork & WorkSummary)[];
  reviews: Review[];
  votes: string[];
  reports: string[];
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Isolated browser repository. Inject storage for tests; no external API calls. */
export function createDemoStore(storage: StorageLike, changed: () => void = () => {}) {
  function read(): DemoState {
    const raw = storage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return { version: 1, works: [], reviews: [], votes: [], reports: [] };
    const state = JSON.parse(raw) as DemoState;
    if (state.version !== 1 || !Array.isArray(state.works) || !Array.isArray(state.reviews) ||
        !Array.isArray(state.votes) || !Array.isArray(state.reports)) {
      throw new Error("デモ保存データを読めません。上部のリセットで初期化できます。");
    }
    return state;
  }
  function write(state: DemoState) {
    storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    changed();
  }
  function allWorks(state: DemoState) {
    return [...fixtures.allWorks(), ...state.works].map((w) => ({
      ...w, reviewCount: w.reviewCount + state.reviews.filter((r) => r.workId === w.id).length,
    }));
  }
  function fail(status: number, message: string): ApiResult<never> {
    return { ok: false, status, code: "demo", message };
  }
  function pair(a: string, b: string) { return [a, b].sort().join("|"); }
  return {
    reset() { storage.removeItem(DEMO_STORAGE_KEY); changed(); },
    pending(id: string) { return read().works.find((w) => w.id === id) ?? null; },
    reviews(id: string) { return read().reviews.filter((r) => r.workId === id); },
    hasVote(a: string, b: string) { return read().votes.includes(pair(a, b)); },
    call(name: string, body: unknown, query?: Record<string, string>): ApiResult<unknown> {
      try {
        const state = read();
        const input = (body ?? {}) as Record<string, unknown>;
        const works = allWorks(state);
        if (name === "search-works") {
          const q = (query?.q ?? "").normalize("NFKC").trim().toLocaleLowerCase();
          const match = (title: string, author: string) => `${title} ${author}`.normalize("NFKC").toLocaleLowerCase().includes(q);
          return { ok: true, data: {
            db: works.filter((w) => match(w.title, w.authors.join(" "))),
            rakuten: demoCatalog.filter((c) => !state.works.some((w) => w.slug === c.itemCode) && match(c.title, c.author)),
          } };
        }
        if (name === "register-work") {
          const candidate = demoCatalog.find((c) => c.itemCode === input.rakutenItemCode);
          if (!candidate) return fail(404, "デモ一覧にない作品です");
          const existing = state.works.find((w) => w.slug === candidate.itemCode);
          if (existing) return { ok: true, data: { work: existing } };
          const work: PendingWork & WorkSummary = {
            id: crypto.randomUUID(), slug: candidate.itemCode, title: candidate.title,
            authors: [candidate.author], coverUrl: null, publisher: "デモ出版",
            synopsis: "作品追加からレビュー投稿までの操作を試せる架空の漫画です。",
            affiliateUrlRakuten: "", reviewCount: 0, status: "pending",
          };
          state.works.push(work);
          write(state);
          return { ok: true, data: { work } };
        }
        if (name === "post-review") {
          const reviewInput = input as unknown as ReviewInput;
          const valid = validateReviewInput(reviewInput);
          if (!valid.ok) return fail(400, Object.values(valid.errors).join(" / "));
          if (!works.some((w) => w.id === reviewInput.workId)) return fail(404, "作品が見つかりません");
          const review: Review = {
            ...reviewInput, id: crypto.randomUUID(), nickname: reviewInput.nickname?.trim() || config.defaultNickname,
            body: reviewInput.body.trim(), rating: reviewInput.rating as Rating,
            createdAt: new Date().toISOString(), status: "visible",
          };
          state.reviews.push(review);
          write(state);
          return { ok: true, data: { review } };
        }
        if (name === "vote-similar") {
          const a = String(input.fromWorkId), b = String(input.toWorkId);
          if (a === b) return fail(400, "同じ作品には投票できません");
          if (![a, b].every((id) => works.some((w) => w.id === id))) return fail(404, "作品が見つかりません");
          const key = pair(a, b);
          if (state.votes.includes(key)) return fail(409, "投票済みです");
          state.votes.push(key);
          write(state);
          return { ok: true, data: undefined };
        }
        if (name === "report-review") {
          const id = String(input.reviewId);
          if (!state.reviews.some((r) => r.id === id) && !fixtures.allWorks().some((w) => fixtures.reviewsForWork(w.id).some((r) => r.id === id))) return fail(404, "レビューが見つかりません");
          if (state.reports.includes(id)) return fail(409, "通報済みです");
          state.reports.push(id);
          write(state);
          return { ok: true, data: { hidden: false } };
        }
        return fail(404, "デモで未対応の操作です");
      } catch {
        return fail(0, "ブラウザへの保存に失敗しました。保存設定を確認するか、デモをリセットしてください。");
      }
    },
  };
}

export function demoStore() {
  return createDemoStore(window.localStorage, () => window.dispatchEvent(new Event(DEMO_EVENT)));
}
