import { demoEnabled, demoStore } from "@/lib/demo";
import { config } from "@/lib/config";
import type { PendingWorkRow } from "@/lib/db-rows";
import { fixtures, useFixtures } from "@/lib/fixtures";
import { toPendingWork } from "@/lib/mappers";
import { createAnonClient } from "@/lib/supabase";
import type { PendingWork } from "@/lib/types";

/** A user-registered work that has no static page yet (client side only). */
export async function fetchPendingWork(id: string): Promise<PendingWork | null> {
  if (demoEnabled) return demoStore().pending(id);
  if (useFixtures) return fixtures.pendingWork();
  if (!config.hasSupabase) return null;
  const client = createAnonClient();
  const { data, error } = await client
    .from("works_pending_public")
    .select("id, slug, title, authors, cover_url, publisher, synopsis, affiliate_url_rakuten")
    .eq("id", id)
    .maybeSingle<PendingWorkRow>();
  if (error) throw new Error(error.message);
  return data ? toPendingWork(data) : null;
}
