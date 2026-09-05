import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { jsonRequest } from "../_shared/testing.ts";
import {
  bearerToken,
  type BuildTriggerRepo,
  type BuildTriggerState,
  handle,
  isDebounced,
  type TriggerBuildDeps,
} from "./handler.ts";

/**
 * 内部専用エンドポイント。Turnstile・レート制限は使わない（設計どおり）ので、
 * 代わりに認証失敗・デバウンス・dispatch 失敗を検証する。
 */

const URL_ = "http://localhost/functions/v1/trigger-build";
const KEY = "service-role-key";
const NOW = new Date("2026-09-03T12:00:00Z");

interface Harness {
  deps: TriggerBuildDeps;
  state: BuildTriggerState;
  dispatches: number;
  clock: { now: Date };
}

function makeHarness(
  initial: BuildTriggerState = { lastTriggeredAt: null, pendingCount: 0 },
  overrides: Partial<TriggerBuildDeps> = {},
): Harness {
  const box = { state: initial, dispatches: 0 };
  const clock = { now: NOW };
  const repo: BuildTriggerRepo = {
    get: () => Promise.resolve(box.state),
    set: (s) => {
      box.state = s;
      return Promise.resolve();
    },
  };
  const deps: TriggerBuildDeps = {
    serviceRoleKey: KEY,
    repo,
    dispatch: () => {
      box.dispatches += 1;
      return Promise.resolve();
    },
    debounceSec: 3600,
    now: () => clock.now,
    ...overrides,
  };
  const harness = { deps, clock } as Harness;
  Object.defineProperty(harness, "state", { get: () => box.state });
  Object.defineProperty(harness, "dispatches", { get: () => box.dispatches });
  return harness;
}

const authed = () => jsonRequest(URL_, "POST", {}, { Authorization: `Bearer ${KEY}` });

Deno.test("trigger-build: first call dispatches and records the time (normal case)", async () => {
  const h = makeHarness();
  const res = await handle(authed(), h.deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { triggered: true, pendingCount: 0 });
  assertEquals(h.dispatches, 1);
  assertEquals(h.state.lastTriggeredAt?.toISOString(), NOW.toISOString());
});

Deno.test("trigger-build: missing or wrong bearer is 401 (auth failure case)", async () => {
  const h = makeHarness();
  assertEquals((await handle(jsonRequest(URL_, "POST", {}), h.deps)).status, 401);
  const wrong = jsonRequest(URL_, "POST", {}, { Authorization: "Bearer nope" });
  assertEquals((await handle(wrong, h.deps)).status, 401);
  assertEquals(h.dispatches, 0);
});

Deno.test("trigger-build: within one hour is debounced (no dispatch, pending_count++)", async () => {
  const h = makeHarness({ lastTriggeredAt: new Date(NOW.getTime() - 30 * 60_000), pendingCount: 2 });
  const res = await handle(authed(), h.deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { triggered: false, pendingCount: 3 });
  assertEquals(h.dispatches, 0);
  assertEquals(h.state.pendingCount, 3);

  // 1 時間経過後は再び起動し pending_count がリセットされる
  h.clock.now = new Date(NOW.getTime() + 31 * 60_000);
  const later = await handle(authed(), h.deps);
  assertEquals(await later.json(), { triggered: true, pendingCount: 0 });
  assertEquals(h.dispatches, 1);
});

Deno.test("trigger-build: dispatch failure is 502 and does not update the timestamp", async () => {
  const h = makeHarness(undefined, { dispatch: () => Promise.reject(new Error("gh")) });
  const res = await handle(authed(), h.deps);
  assertEquals(res.status, 502);
  assertEquals(h.state.lastTriggeredAt, null);
});

Deno.test("trigger-build: pure helpers", () => {
  assertFalse(isDebounced(null, NOW, 3600));
  assert(isDebounced(new Date(NOW.getTime() - 3599_000), NOW, 3600));
  assertFalse(isDebounced(new Date(NOW.getTime() - 3600_000), NOW, 3600));
  assertEquals(bearerToken(new Request(URL_, { headers: { Authorization: "Bearer abc" } })), "abc");
  assertEquals(bearerToken(new Request(URL_, { headers: { Authorization: "Basic abc" } })), null);
  assertEquals(bearerToken(new Request(URL_)), null);
});
