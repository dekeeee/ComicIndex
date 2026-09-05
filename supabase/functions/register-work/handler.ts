import { buildAmazonUrl } from "../_shared/amazon.ts";
import { SERIES_CONFIDENCE_SINGLE } from "../_shared/config.ts";
import { workRowToSummary } from "../_shared/mappers.ts";
import { RakutenError } from "../_shared/rakuten.ts";
import {
  error,
  guarded,
  json,
  preflight,
  rateLimited,
  readJsonObject,
  requireMethod,
} from "../_shared/response.ts";
import { extractVolume, seriesKey, seriesTitle, splitAuthors } from "../_shared/series.ts";
import type {
  PostKind,
  RakutenCandidate,
  RateLimitResult,
  WorkRow,
} from "../_shared/types.ts";

/** `works` に insert する行（`status = 'pending'`）。 */
export interface NewWorkRow {
  slug: string;
  rakuten_series_key: string;
  title: string;
  title_kana: string | null;
  authors: string[];
  publisher: string | null;
  synopsis: string | null;
  cover_url: string | null;
  first_sales_date: string | null;
  volume_count: number;
  affiliate_url_rakuten: string;
  affiliate_url_amazon: string | null;
  is_adult: boolean;
  status: "pending";
  series_confidence: number;
}

/** `work_volumes` に insert する行。 */
export interface NewVolumeRow {
  rakuten_item_code: string;
  work_id: string;
  volume_no: number | null;
  title_raw: string;
  isbn: string | null;
  sales_date: string | null;
  affiliate_url: string;
}

export interface RegisterRepo {
  findWorkByItemCode(itemCode: string): Promise<WorkRow | null>;
  findWorkBySeriesKey(key: string): Promise<WorkRow | null>;
  /** `rakuten_series_key` / `slug` の unique 違反（同時登録）なら "duplicate"。 */
  insertWork(row: NewWorkRow): Promise<WorkRow | "duplicate">;
  /** 既にある itemCode は何もしない。 */
  upsertVolume(row: NewVolumeRow): Promise<void>;
}

export interface RegisterWorkDeps {
  ipHash(req: Request): Promise<string>;
  checkRateLimit(kind: PostKind, ipHash: string): Promise<RateLimitResult>;
  fetchItem(itemCode: string, titleHint?: string): Promise<RakutenCandidate | null>;
  slugFor(seriesKey: string): Promise<string>;
  /** Amazon アソシエイトのトラッキング ID。null なら Amazon リンクを作らない。 */
  amazonTag: string | null;
  repo: RegisterRepo;
  /** `trigger-build` 呼び出し。失敗しても登録自体は成功として返す。 */
  triggerBuild(): Promise<void>;
}

export type RegisterInput =
  | { ok: true; itemCode: string; titleHint: string | undefined }
  | { ok: false; errors: Record<string, string> };

/** 入力の形式検証（純粋関数）。`title` は楽天 API 制限の回避用ヒント（任意）。 */
export function parseRegisterInput(raw: Record<string, unknown>): RegisterInput {
  const code = raw["rakutenItemCode"];
  if (typeof code !== "string" || code.trim() === "") {
    return { ok: false, errors: { rakutenItemCode: "is required" } };
  }
  const title = raw["title"];
  return {
    ok: true,
    itemCode: code.trim(),
    titleHint: typeof title === "string" && title.trim() !== "" ? title.trim() : undefined,
  };
}

const DATE_JP = /(\d{4})年\s*(\d{1,2})月(?:\s*(\d{1,2})日)?/;
const DATE_NUMERIC = /(\d{4})[/.\-](\d{1,2})(?:[/.\-](\d{1,2}))?/;
const SALES_DATE_DEFAULT_DAY = 1;

/**
 * 楽天の `salesDate`（「2024年05月20日」「2024年05月」「2024年05月下旬」「2024/05/20」、全角数字可）を
 * ISO 日付（YYYY-MM-DD）に。日が無ければ 1 日、暦として不正・読めなければ null。
 * Python 側 `rakuten_client.parse_sales_date` と同じ規則。
 */
export function parseSalesDate(salesDate: string): string | null {
  const text = salesDate.normalize("NFKC");
  const m = DATE_JP.exec(text) ?? DATE_NUMERIC.exec(text);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = m[3] === undefined ? SALES_DATE_DEFAULT_DAY : Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!valid) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${
    String(day).padStart(2, "0")
  }`;
}

/** 楽天アイテム → `works` 行（純粋関数）。Amazon リンクは ISBN + タグから組む。 */
export function buildWorkRow(
  item: RakutenCandidate,
  key: string,
  slug: string,
  amazonTag: string | null,
): NewWorkRow {
  return {
    slug,
    rakuten_series_key: key,
    title: seriesTitle(item.title),
    title_kana: item.titleKana,
    authors: splitAuthors(item.author),
    publisher: item.publisher,
    synopsis: item.caption,
    cover_url: item.imageUrl === "" ? null : item.imageUrl,
    first_sales_date: parseSalesDate(item.salesDate),
    volume_count: 1,
    affiliate_url_rakuten: item.affiliateUrl,
    affiliate_url_amazon: buildAmazonUrl(item.isbn, amazonTag),
    is_adult: false,
    status: "pending",
    series_confidence: SERIES_CONFIDENCE_SINGLE,
  };
}

/** 楽天アイテム → `work_volumes` 行（純粋関数）。 */
export function buildVolumeRow(item: RakutenCandidate, workId: string): NewVolumeRow {
  return {
    rakuten_item_code: item.itemCode,
    work_id: workId,
    volume_no: extractVolume(item.title),
    title_raw: item.title,
    isbn: item.isbn,
    sales_date: parseSalesDate(item.salesDate),
    affiliate_url: item.affiliateUrl,
  };
}

/**
 * POST { rakutenItemCode, title? }
 * rate limit（register）→ 楽天取得 → 正規化 → 既存なら 200 / 新規は insert + trigger-build → 201
 * 200 { work } / 201 { work } / 400 / 404 / 429 / 502
 */
export function handle(req: Request, deps: RegisterWorkDeps): Promise<Response> {
  return guarded(async () => {
    const pre = preflight(req);
    if (pre) return pre;
    const wrongMethod = requireMethod(req, "POST");
    if (wrongMethod) return wrongMethod;

    const raw = await readJsonObject(req);
    if (raw === null) return error(400, "invalid_json", "Body must be a JSON object.");

    const input = parseRegisterInput(raw);
    if (!input.ok) {
      return json(400, {
        code: "validation_failed",
        message: "Invalid register input.",
        errors: input.errors,
      });
    }

    // 同じ楽天アイテムの再登録は楽天 API を呼ばずに既存を返す
    const byCode = await deps.repo.findWorkByItemCode(input.itemCode);
    if (byCode !== null) return json(200, { work: workRowToSummary(byCode) });

    const hash = await deps.ipHash(req);
    const limit = await deps.checkRateLimit("register", hash);
    if (!limit.allowed) return rateLimited(limit.retryAfterSec);

    let item: RakutenCandidate | null;
    try {
      item = await deps.fetchItem(input.itemCode, input.titleHint);
    } catch (err) {
      if (err instanceof RakutenError) {
        return error(502, "rakuten_unavailable", "Rakuten Books API is unavailable.");
      }
      throw err;
    }
    if (item === null) {
      return error(404, "item_not_found", "Rakuten item not found.");
    }
    if (item.affiliateUrl === "") {
      return error(502, "rakuten_unavailable", "Rakuten item has no affiliate URL.");
    }

    const key = seriesKey(item.title, item.author);

    const existing = await deps.repo.findWorkBySeriesKey(key);
    if (existing !== null) {
      await deps.repo.upsertVolume(buildVolumeRow(item, existing.id));
      return json(200, { work: workRowToSummary(existing) });
    }

    const slug = await deps.slugFor(key);
    const inserted = await deps.repo.insertWork(
      buildWorkRow(item, key, slug, deps.amazonTag),
    );
    if (inserted === "duplicate") {
      const raced = await deps.repo.findWorkBySeriesKey(key);
      if (raced === null) throw new Error("works insert conflicted but row not found");
      await deps.repo.upsertVolume(buildVolumeRow(item, raced.id));
      return json(200, { work: workRowToSummary(raced) });
    }

    await deps.repo.upsertVolume(buildVolumeRow(item, inserted.id));

    try {
      await deps.triggerBuild();
    } catch (err) {
      console.error("trigger-build request failed (work was registered):", err);
    }

    return json(201, { work: workRowToSummary(inserted) });
  });
}
