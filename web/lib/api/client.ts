import { demoEnabled, demoStore } from "@/lib/demo";
import { config } from "@/lib/config";
import type { ApiResult } from "@/lib/types";

interface ErrorBody {
  code?: string;
  message?: string;
}

/** Thin fetch wrapper for Supabase Edge Functions. Never throws; returns ApiResult. */
export async function callFunction<T>(
  name: string,
  init: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string> },
): Promise<ApiResult<T>> {
  if (demoEnabled) {
    try { return demoStore().call(name, init.body, init.query) as ApiResult<T>; }
    catch { return { ok: false, status: 0, code: "storage", message: "ブラウザの保存機能を利用できません" }; }
  }
  if (!config.functionsBaseUrl) {
    return { ok: false, status: 0, code: "not_configured", message: "APIが設定されていません" };
  }
  const url = new URL(`${config.functionsBaseUrl}/${name}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  try {
    const res = await fetch(url.toString(), {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = (json ?? {}) as ErrorBody;
      return { ok: false, status: res.status, code: err.code ?? "error", message: err.message ?? "エラーが発生しました" };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 0, code: "network", message: "通信に失敗しました" };
  }
}
