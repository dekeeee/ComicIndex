import { ipHash } from "../_shared/iphash.ts";
import { createPostLogStore } from "../_shared/postlog-store.ts";
import { searchRakutenBooks } from "../_shared/rakuten.ts";
import { checkRateLimit, limitsFor } from "../_shared/ratelimit.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { handle, type SearchWorksDeps } from "./handler.ts";
import { createSearchRepo } from "./repo.ts";

const client = createAdminClient();
const store = createPostLogStore(client);

const deps: SearchWorksDeps = {
  ipHash: (req) => ipHash(req),
  checkRateLimit: (kind, hash) =>
    checkRateLimit(kind, hash, limitsFor(kind), { store }),
  repo: createSearchRepo(client),
  searchRakuten: (q) => searchRakutenBooks(q),
};

Deno.serve((req) => handle(req, deps));
