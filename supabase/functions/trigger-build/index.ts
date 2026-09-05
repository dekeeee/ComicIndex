import {
  BUILD_DEBOUNCE_SEC,
  GITHUB_DISPATCH_EVENT_TYPE,
  requireEnv,
} from "../_shared/config.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { handle, type TriggerBuildDeps } from "./handler.ts";
import { createBuildTriggerRepo } from "./repo.ts";

/** GitHub `repository_dispatch`。204 以外は失敗。 */
async function dispatchToGitHub(): Promise<void> {
  const repo = requireEnv("GH_REPO");
  const token = requireEnv("GH_DISPATCH_TOKEN");
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "comicomi-trigger-build",
    },
    body: JSON.stringify({ event_type: GITHUB_DISPATCH_EVENT_TYPE }),
  });
  if (!res.ok) {
    throw new Error(`GitHub dispatches responded ${res.status}`);
  }
}

const client = createAdminClient();

const deps: TriggerBuildDeps = {
  serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  repo: createBuildTriggerRepo(client),
  dispatch: dispatchToGitHub,
  debounceSec: BUILD_DEBOUNCE_SEC,
  now: () => new Date(),
};

Deno.serve((req) => handle(req, deps));
