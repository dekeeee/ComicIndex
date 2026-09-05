import { requestBuild } from "../_shared/build-trigger.ts";
import { optionalEnv } from "../_shared/config.ts";
import { ipHash } from "../_shared/iphash.ts";
import { createPostLogStore } from "../_shared/postlog-store.ts";
import { fetchRakutenItem } from "../_shared/rakuten.ts";
import { checkRateLimit, limitsFor } from "../_shared/ratelimit.ts";
import { slugFor } from "../_shared/series.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { handle, type RegisterWorkDeps } from "./handler.ts";
import { createRegisterRepo } from "./repo.ts";

const client = createAdminClient();
const store = createPostLogStore(client);

const deps: RegisterWorkDeps = {
  ipHash: (req) => ipHash(req),
  checkRateLimit: (kind, hash) =>
    checkRateLimit(kind, hash, limitsFor(kind), { store }),
  fetchItem: (code, titleHint) => fetchRakutenItem(code, titleHint),
  slugFor,
  amazonTag: optionalEnv("AMAZON_ASSOCIATE_TAG") ?? null,
  repo: createRegisterRepo(client),
  triggerBuild: () => requestBuild(),
};

Deno.serve((req) => handle(req, deps));
