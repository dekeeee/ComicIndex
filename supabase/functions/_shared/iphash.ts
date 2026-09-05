import { requireEnv } from "./config.ts";

/**
 * クライアント IP の取得と `ip_hash = sha256(ip + IP_HASH_SALT)` の計算。
 * 生 IP は戻り値としてのみ扱い、ログ・DB には一切残さない。
 *
 * 設計書では `ipHash(req): string` だが、Web Crypto の digest が非同期のため Promise を返す。
 */

/**
 * `cf-connecting-ip` → `x-forwarded-for`（先頭）→ `x-real-ip` の順で取る。
 * どれも無ければ null。
 */
export function clientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf && cf.trim() !== "") return cf.trim();

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = req.headers.get("x-real-ip");
  if (real && real.trim() !== "") return real.trim();

  return null;
}

/** 文字列の SHA-256 を小文字 hex で返す。 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** `sha256(ip + salt)`。 */
export function hashIp(ip: string, salt: string): Promise<string> {
  return sha256Hex(ip + salt);
}

/**
 * リクエストから ip_hash を計算する。
 * IP が取れない場合は "unknown" バケツにまとめる（Supabase 経由では常に x-forwarded-for が付く）。
 * `salt` 省略時は環境変数 `IP_HASH_SALT` を使う。
 */
export function ipHash(req: Request, salt?: string): Promise<string> {
  const ip = clientIp(req) ?? "unknown";
  return hashIp(ip, salt ?? requireEnv("IP_HASH_SALT"));
}
