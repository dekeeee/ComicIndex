import { clientIp, ipHash } from "../_shared/iphash.ts";
import { createPostLogStore } from "../_shared/postlog-store.ts";
import { checkRateLimit, limitsFor } from "../_shared/ratelimit.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { handle, type PostReviewDeps } from "./handler.ts";
import { createReviewRepo } from "./repo.ts";

const client = createAdminClient();
const store = createPostLogStore(client);

const deps: PostReviewDeps = {
  ipHash: (req) => ipHash(req),
  clientIp,
  verifyTurnstile: (token, ip) => verifyTurnstile(token, ip),
  checkRateLimit: (kind, hash) =>
    checkRateLimit(kind, hash, limitsFor(kind), { store }),
  repo: createReviewRepo(client),
};

Deno.serve((req) => handle(req, deps));
