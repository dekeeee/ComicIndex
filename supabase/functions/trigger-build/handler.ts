import { error, guarded, json, preflight, requireMethod } from "../_shared/response.ts";

export interface BuildTriggerState {
  lastTriggeredAt: Date | null;
  pendingCount: number;
}

export interface BuildTriggerRepo {
  /** `build_triggers` の id = 1 行。無ければ初期状態を返す。 */
  get(): Promise<BuildTriggerState>;
  set(state: BuildTriggerState): Promise<void>;
}

export interface TriggerBuildDeps {
  /** これと一致する Bearer だけを受け付ける（内部呼び出し専用）。 */
  serviceRoleKey: string;
  repo: BuildTriggerRepo;
  /** GitHub `repository_dispatch` を送る。失敗は例外。 */
  dispatch(): Promise<void>;
  debounceSec: number;
  now(): Date;
}

/** Bearer トークンを取り出す。無ければ null。 */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header === null) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m?.[1] ?? null;
}

/** 前回起動から `debounceSec` 未満なら true（純粋関数）。 */
export function isDebounced(
  lastTriggeredAt: Date | null,
  now: Date,
  debounceSec: number,
): boolean {
  if (lastTriggeredAt === null) return false;
  return now.getTime() - lastTriggeredAt.getTime() < debounceSec * 1000;
}

/**
 * POST（内部）。Authorization: Bearer <service role key> 必須。
 * 1 時間以内に起動済みなら pending_count++ で no-op、そうでなければ repository_dispatch。
 * 200 { triggered, pendingCount } / 401 / 502
 */
export function handle(req: Request, deps: TriggerBuildDeps): Promise<Response> {
  return guarded(async () => {
    const pre = preflight(req);
    if (pre) return pre;
    const wrongMethod = requireMethod(req, "POST");
    if (wrongMethod) return wrongMethod;

    if (bearerToken(req) !== deps.serviceRoleKey) {
      return error(401, "unauthorized", "Internal endpoint.");
    }

    const now = deps.now();
    const state = await deps.repo.get();

    if (isDebounced(state.lastTriggeredAt, now, deps.debounceSec)) {
      const pendingCount = state.pendingCount + 1;
      await deps.repo.set({ lastTriggeredAt: state.lastTriggeredAt, pendingCount });
      return json(200, { triggered: false, pendingCount });
    }

    try {
      await deps.dispatch();
    } catch (err) {
      console.error("repository_dispatch failed:", err);
      return error(502, "dispatch_failed", "Could not trigger the build.");
    }

    await deps.repo.set({ lastTriggeredAt: now, pendingCount: 0 });
    return json(200, { triggered: true, pendingCount: 0 });
  });
}
