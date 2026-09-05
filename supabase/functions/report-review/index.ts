import { REPORT_HIDE_THRESHOLD } from "../_shared/config.ts";
import { ipHash } from "../_shared/iphash.ts";
import { createPostLogStore } from "../_shared/postlog-store.ts";
import { checkRateLimit, limitsFor } from "../_shared/ratelimit.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { handle, type ReportReviewDeps } from "./handler.ts";
import { createReportRepo } from "./repo.ts";

const client = createAdminClient();
const store = createPostLogStore(client);

const deps: ReportReviewDeps = {
  ipHash: (req) => ipHash(req),
  checkRateLimit: (kind, hash) =>
    checkRateLimit(kind, hash, limitsFor(kind), { store }),
  repo: createReportRepo(client),
  hideThreshold: REPORT_HIDE_THRESHOLD,
};

Deno.serve((req) => handle(req, deps));
