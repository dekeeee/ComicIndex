import {
  error,
  guarded,
  json,
  preflight,
  rateLimited,
  readJsonObject,
  requireMethod,
} from "../_shared/response.ts";
import type { PostKind, RateLimitResult } from "../_shared/types.ts";
import { isUuid } from "../_shared/validation.ts";

export type InsertOutcome = "inserted" | "duplicate";

export interface VoteRepo {
  /** 渡した ID のうち `published` かつ非成人のものだけを返す。 */
  findVotableIds(workIds: string[]): Promise<string[]>;
  /** unique (from, to, ip_hash) 違反なら "duplicate"。 */
  insertVote(
    fromWorkId: string,
    toWorkId: string,
    ipHash: string,
  ): Promise<InsertOutcome>;
}

export interface VoteSimilarDeps {
  ipHash(req: Request): Promise<string>;
  checkRateLimit(kind: PostKind, ipHash: string): Promise<RateLimitResult>;
  repo: VoteRepo;
}

export type VotePair =
  | { ok: true; fromWorkId: string; toWorkId: string }
  | { ok: false; errors: Record<string, string> };

/** 入力の形式検証（純粋関数）。同一 ID・uuid 以外は拒否。 */
export function parseVotePair(raw: Record<string, unknown>): VotePair {
  const errors: Record<string, string> = {};
  const from = raw["fromWorkId"];
  const to = raw["toWorkId"];
  if (!isUuid(from)) errors["fromWorkId"] = "must be a uuid";
  if (!isUuid(to)) errors["toWorkId"] = "must be a uuid";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (from === to) {
    return { ok: false, errors: { toWorkId: "must differ from fromWorkId" } };
  }
  return { ok: true, fromWorkId: from as string, toWorkId: to as string };
}

/**
 * POST { fromWorkId, toWorkId }
 * 同一 ID 拒否 → 存在確認 → rate limit → insert
 * 201 / 400 / 404 / 409 / 429
 */
export function handle(req: Request, deps: VoteSimilarDeps): Promise<Response> {
  return guarded(async () => {
    const pre = preflight(req);
    if (pre) return pre;
    const wrongMethod = requireMethod(req, "POST");
    if (wrongMethod) return wrongMethod;

    const raw = await readJsonObject(req);
    if (raw === null) return error(400, "invalid_json", "Body must be a JSON object.");

    const pair = parseVotePair(raw);
    if (!pair.ok) {
      return json(400, {
        code: "validation_failed",
        message: "Invalid vote input.",
        errors: pair.errors,
      });
    }

    const votable = await deps.repo.findVotableIds([pair.fromWorkId, pair.toWorkId]);
    if (!votable.includes(pair.fromWorkId) || !votable.includes(pair.toWorkId)) {
      return error(404, "work_not_found", "Work not found.");
    }

    const hash = await deps.ipHash(req);
    const limit = await deps.checkRateLimit("vote", hash);
    if (!limit.allowed) return rateLimited(limit.retryAfterSec);

    const outcome = await deps.repo.insertVote(pair.fromWorkId, pair.toWorkId, hash);
    if (outcome === "duplicate") {
      return error(409, "already_voted", "You have already voted for this pair.");
    }

    return json(201, { fromWorkId: pair.fromWorkId, toWorkId: pair.toWorkId });
  });
}
