import { requireEnv, TURNSTILE_VERIFY_URL } from "./config.ts";

export interface TurnstileOptions {
  /** 省略時は環境変数 `TURNSTILE_SECRET_KEY`。 */
  secret?: string;
  /** テスト用に差し替え可能な fetch。 */
  fetchFn?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Cloudflare Turnstile の siteverify を呼び、成功なら true。
 * ネットワーク失敗・不正レスポンスは false（= 403 扱い）にする。
 * `ip` は siteverify の `remoteip` にだけ渡し、ログには出さない。
 */
export async function verifyTurnstile(
  token: string,
  ip: string | null,
  options: TurnstileOptions = {},
): Promise<boolean> {
  if (token === "") return false;
  const secret = options.secret ?? requireEnv("TURNSTILE_SECRET_KEY");
  const fetchFn = options.fetchFn ?? fetch;

  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);

  try {
    const res = await fetchFn(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: form,
    });
    if (!res.ok) return false;
    const data: unknown = await res.json();
    return isRecord(data) && data["success"] === true;
  } catch (err) {
    console.error("turnstile siteverify request failed:", err);
    return false;
  }
}
