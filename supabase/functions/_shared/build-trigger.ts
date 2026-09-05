import { requireEnv } from "./config.ts";

/**
 * `register-work` から内部的に `trigger-build` を呼ぶ。
 * service role key を Bearer に載せる（`trigger-build` はこれ以外を 401 で拒否する）。
 * 失敗は例外で伝え、呼び出し側が「登録は成功したがビルド起動は失敗」として扱う。
 */
export async function requestBuild(fetchFn: typeof fetch = fetch): Promise<void> {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetchFn(`${baseUrl}/functions/v1/trigger-build`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(`trigger-build responded ${res.status}`);
  }
}
