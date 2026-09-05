import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

it("routes explicit demo mode locally even when a live API URL exists", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("window", { localStorage: { getItem: () => null } });
  const { callFunction } = await import("@/lib/api/client");
  const result = await callFunction("search-works", { method: "GET", query: { q: "剣" } });
  expect(result).toMatchObject({ ok: true, data: { db: [{ title: "剣と魔法の放課後" }] } });
  expect(fetch).not.toHaveBeenCalled();
});

it("does not enable local writes in ordinary fixture or unconfigured mode", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_USE_FIXTURES", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  const { callFunction } = await import("@/lib/api/client");
  expect(await callFunction("register-work", { method: "POST", body: {} })).toMatchObject({ ok: false, code: "not_configured" });
});
