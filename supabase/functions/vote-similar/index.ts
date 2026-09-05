import { ipHash } from "../_shared/iphash.ts";
import { createPostLogStore } from "../_shared/postlog-store.ts";
import { checkRateLimit, limitsFor } from "../_shared/ratelimit.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { handle, type VoteSimilarDeps } from "./handler.ts";
import { createVoteRepo } from "./repo.ts";

const client = createAdminClient();
const store = createPostLogStore(client);

const deps: VoteSimilarDeps = {
  ipHash: (req) => ipHash(req),
  checkRateLimit: (kind, hash) =>
    checkRateLimit(kind, hash, limitsFor(kind), { store }),
  repo: createVoteRepo(client),
};

Deno.serve((req) => handle(req, deps));
