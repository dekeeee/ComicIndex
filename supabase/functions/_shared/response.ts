import { optionalEnv } from "./config.ts";
import type { ErrorBody } from "./types.ts";

/**
 * CORS ヘッダ。
 * 現状は `*` で全オリジン許可。本番では環境変数 `ALLOWED_ORIGIN`（例: https://comicomi.example）を
 * 設定してサイトのオリジンだけに絞ること。設定があればそちらを優先する。
 */
export function corsHeaders(): Record<string, string> {
  const origin = optionalEnv("ALLOWED_ORIGIN") ?? "*";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
  if (origin !== "*") headers["Vary"] = "Origin";
  return headers;
}

/** JSON レスポンス（CORS 付き）。 */
export function json(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

/** エラーレスポンス `{ code, message }`（CORS 付き）。 */
export function error(
  status: number,
  code: string,
  message: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const body: ErrorBody = { code, message };
  return json(status, body, extraHeaders);
}

/** 429 + Retry-After。 */
export function rateLimited(retryAfterSec: number): Response {
  return error(
    429,
    "rate_limited",
    `Too many requests. Retry after ${retryAfterSec} seconds.`,
    { "Retry-After": String(retryAfterSec) },
  );
}

/** OPTIONS プリフライトなら 204 を返す。それ以外は null。 */
export function preflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/** 許可メソッド以外なら 405 を返す。 */
export function requireMethod(req: Request, method: string): Response | null {
  if (req.method === method) return null;
  return error(405, "method_not_allowed", `Use ${method}.`, { Allow: method });
}

/** JSON オブジェクト本文を読む。JSON でない・オブジェクトでない場合は null。 */
export async function readJsonObject(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * ハンドラ本体を包み、未捕捉例外を 500 に変換する。
 * ログにはエラーだけを出し、リクエストヘッダ（生 IP を含む）は出さない。
 */
export async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    console.error("unhandled error in edge function:", err);
    return error(500, "internal_error", "Internal server error.");
  }
}
