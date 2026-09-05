import { DbError } from "../_shared/pg.ts";
import type { SupabaseClient } from "../_shared/supabase-admin.ts";
import type { BuildTriggerRepo, BuildTriggerState } from "./handler.ts";

const ROW_ID = 1;

interface BuildTriggerRow {
  last_triggered_at: string | null;
  pending_count: number;
}

export function createBuildTriggerRepo(client: SupabaseClient): BuildTriggerRepo {
  return {
    async get(): Promise<BuildTriggerState> {
      const { data, error } = await client
        .from("build_triggers")
        .select("last_triggered_at,pending_count")
        .eq("id", ROW_ID)
        .maybeSingle();
      if (error) throw new DbError("build_triggers select", error);
      const row = data as unknown as BuildTriggerRow | null;
      if (row === null) return { lastTriggeredAt: null, pendingCount: 0 };
      return {
        lastTriggeredAt: row.last_triggered_at === null
          ? null
          : new Date(row.last_triggered_at),
        pendingCount: row.pending_count,
      };
    },

    async set(state: BuildTriggerState): Promise<void> {
      const { error } = await client
        .from("build_triggers")
        .upsert({
          id: ROW_ID,
          last_triggered_at: state.lastTriggeredAt?.toISOString() ?? null,
          pending_count: state.pendingCount,
        });
      if (error) throw new DbError("build_triggers upsert", error);
    },
  };
}
