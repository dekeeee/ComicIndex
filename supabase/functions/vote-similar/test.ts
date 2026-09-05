import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  ALLOWED,
  EXCEEDED,
  fakeIpHash,
  fakeRateLimit,
  jsonRequest,
  UUID_A,
  UUID_B,
  UUID_C,
} from "../_shared/testing.ts";
import {
  handle,
  parseVotePair,
  type VoteRepo,
  type VoteSimilarDeps,
} from "./handler.ts";

/**
 * 必須 3 ケースのうち「Turnstile 失敗」は F-09 の設計（Turnstile 不要）により対象外。
 * 代わりに 400 / 404 / 409 を検証する。
 */

const URL_ = "http://localhost/functions/v1/vote-similar";

interface Harness {
  deps: VoteSimilarDeps;
  votes: string[];
}

function makeHarness(overrides: Partial<VoteSimilarDeps> = {}): Harness {
  const votes: string[] = [];
  const votable = new Set([UUID_A, UUID_B]);
  const repo: VoteRepo = {
    findVotableIds: (ids) => Promise.resolve(ids.filter((id) => votable.has(id))),
    insertVote: (from, to, hash) => {
      const key = `${from}|${to}|${hash}`;
      if (votes.includes(key)) return Promise.resolve("duplicate");
      votes.push(key);
      return Promise.resolve("inserted");
    },
  };
  const deps: VoteSimilarDeps = {
    ipHash: fakeIpHash("hash-1"),
    checkRateLimit: fakeRateLimit(ALLOWED).check,
    repo,
    ...overrides,
  };
  return { deps, votes };
}

Deno.test("vote-similar: normal case inserts and returns 201", async () => {
  const h = makeHarness();
  const res = await handle(
    jsonRequest(URL_, "POST", { fromWorkId: UUID_A, toWorkId: UUID_B }),
    h.deps,
  );
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { fromWorkId: UUID_A, toWorkId: UUID_B });
  assertEquals(h.votes.length, 1);
});

Deno.test("vote-similar: rate limit exceeded returns 429", async () => {
  const h = makeHarness({ checkRateLimit: fakeRateLimit(EXCEEDED).check });
  const res = await handle(
    jsonRequest(URL_, "POST", { fromWorkId: UUID_A, toWorkId: UUID_B }),
    h.deps,
  );
  assertEquals(res.status, 429);
  assertEquals(h.votes.length, 0);
});

Deno.test("vote-similar: same id or invalid uuid is 400", async () => {
  const h = makeHarness();
  const same = await handle(
    jsonRequest(URL_, "POST", { fromWorkId: UUID_A, toWorkId: UUID_A }),
    h.deps,
  );
  assertEquals(same.status, 400);
  const bad = await handle(
    jsonRequest(URL_, "POST", { fromWorkId: "x", toWorkId: UUID_B }),
    h.deps,
  );
  assertEquals(bad.status, 400);
  assertEquals(h.votes.length, 0);

  const parsed = parseVotePair({ fromWorkId: UUID_A, toWorkId: UUID_B });
  assert(parsed.ok);
  assertFalse(parseVotePair({ fromWorkId: UUID_A }).ok);
});

Deno.test("vote-similar: unknown or unpublished work is 404", async () => {
  const h = makeHarness();
  const res = await handle(
    jsonRequest(URL_, "POST", { fromWorkId: UUID_A, toWorkId: UUID_C }),
    h.deps,
  );
  assertEquals(res.status, 404);
});

Deno.test("vote-similar: second vote for the same pair from the same ip_hash is 409", async () => {
  const h = makeHarness();
  const req = () => jsonRequest(URL_, "POST", { fromWorkId: UUID_A, toWorkId: UUID_B });
  assertEquals((await handle(req(), h.deps)).status, 201);
  const second = await handle(req(), h.deps);
  assertEquals(second.status, 409);
  assertEquals((await second.json()).code, "already_voted");
  // 逆方向は別ペア
  const reverse = await handle(
    jsonRequest(URL_, "POST", { fromWorkId: UUID_B, toWorkId: UUID_A }),
    h.deps,
  );
  assertEquals(reverse.status, 201);
});
