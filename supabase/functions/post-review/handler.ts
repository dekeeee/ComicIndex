import { reviewRowToReview } from "../_shared/mappers.ts";
import { containsNgWord, countUrls } from "../_shared/ngwords.ts";
import {
  error,
  guarded,
  json,
  preflight,
  rateLimited,
  readJsonObject,
  requireMethod,
} from "../_shared/response.ts";
import type {
  PostKind,
  RateLimitResult,
  ReviewRow,
  ReviewStatus,
  WorkStatus,
} from "../_shared/types.ts";
import { reviewRules, validateReviewInput } from "../_shared/validation.ts";

/** insert する行。`ip_hash` のみで生 IP は含まない。 */
export interface NewReviewRow {
  work_id: string;
  nickname: string;
  body: string;
  rating: number;
  has_spoiler: boolean;
  status: ReviewStatus;
  ip_hash: string;
}

export interface WorkGate {
  status: WorkStatus;
  is_adult: boolean;
}

export interface ReviewRepo {
  /** 作品の存在と公開可否を見る。無ければ null。 */
  findWorkGate(workId: string): Promise<WorkGate | null>;
  insertReview(row: NewReviewRow): Promise<ReviewRow>;
}

export interface PostReviewDeps {
  ipHash(req: Request): Promise<string>;
  clientIp(req: Request): string | null;
  verifyTurnstile(token: string, ip: string | null): Promise<boolean>;
  checkRateLimit(kind: PostKind, ipHash: string): Promise<RateLimitResult>;
  repo: ReviewRepo;
}

/** NG ワードまたは URL 過多なら `pending`、それ以外は `visible`（F-08）。 */
export function decideReviewStatus(body: string): ReviewStatus {
  if (containsNgWord(body)) return "pending";
  if (countUrls(body) > reviewRules.maxUrls) return "pending";
  return "visible";
}

/**
 * POST { workId, nickname?, body, rating, hasSpoiler, turnstileToken }
 * Turnstile → validation → 作品存在確認 → rate limit → NG/URL 判定 → insert
 * 201 { review } / 400 / 403 / 404 / 429
 */
export function handle(req: Request, deps: PostReviewDeps): Promise<Response> {
  return guarded(async () => {
    const pre = preflight(req);
    if (pre) return pre;
    const wrongMethod = requireMethod(req, "POST");
    if (wrongMethod) return wrongMethod;

    const raw = await readJsonObject(req);
    if (raw === null) return error(400, "invalid_json", "Body must be a JSON object.");

    const token = raw["turnstileToken"];
    if (typeof token !== "string" || token === "") {
      return error(400, "turnstile_required", "turnstileToken is required.");
    }
    const ok = await deps.verifyTurnstile(token, deps.clientIp(req));
    if (!ok) return error(403, "turnstile_failed", "Bot verification failed.");

    const validation = validateReviewInput(raw);
    if (!validation.ok) {
      return json(400, {
        code: "validation_failed",
        message: "Invalid review input.",
        errors: validation.errors,
      });
    }
    const input = validation.value;

    const gate = await deps.repo.findWorkGate(input.workId);
    if (gate === null || gate.is_adult || gate.status === "rejected") {
      return error(404, "work_not_found", "Work not found.");
    }

    const hash = await deps.ipHash(req);
    const limit = await deps.checkRateLimit("review", hash);
    if (!limit.allowed) return rateLimited(limit.retryAfterSec);

    const row = await deps.repo.insertReview({
      work_id: input.workId,
      nickname: input.nickname,
      body: input.body,
      rating: input.rating,
      has_spoiler: input.hasSpoiler,
      status: decideReviewStatus(input.body),
      ip_hash: hash,
    });

    return json(201, { review: reviewRowToReview(row) });
  });
}
