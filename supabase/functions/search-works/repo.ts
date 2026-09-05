import { WORK_SUMMARY_COLUMNS, workRowToSummary } from "../_shared/mappers.ts";
import { DbError } from "../_shared/pg.ts";
import type { SupabaseClient } from "../_shared/supabase-admin.ts";
import type { WorkRow, WorkSummary } from "../_shared/types.ts";
import { buildOrFilter, type SearchRepo } from "./handler.ts";

export function createSearchRepo(client: SupabaseClient): SearchRepo {
  return {
    async searchPublished(q: string, limit: number): Promise<WorkSummary[]> {
      const filter = buildOrFilter(q);
      if (filter === null) return [];

      const { data, error } = await client
        .from("works")
        .select(WORK_SUMMARY_COLUMNS)
        .eq("status", "published")
        .eq("is_adult", false)
        .or(filter)
        .order("review_count", { ascending: false })
        .limit(limit);
      if (error) throw new DbError("works search", error);
      const rows = (data ?? []) as unknown as WorkRow[];
      return rows.map(workRowToSummary);
    },
  };
}
