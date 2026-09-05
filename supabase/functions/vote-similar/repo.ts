import { DbError, isUniqueViolation } from "../_shared/pg.ts";
import type { SupabaseClient } from "../_shared/supabase-admin.ts";
import type { InsertOutcome, VoteRepo } from "./handler.ts";

interface IdRow {
  id: string;
}

export function createVoteRepo(client: SupabaseClient): VoteRepo {
  return {
    async findVotableIds(workIds: string[]): Promise<string[]> {
      const { data, error } = await client
        .from("works")
        .select("id")
        .in("id", workIds)
        .eq("status", "published")
        .eq("is_adult", false);
      if (error) throw new DbError("works select", error);
      const rows = (data ?? []) as unknown as IdRow[];
      return rows.map((row) => row.id);
    },

    async insertVote(
      fromWorkId: string,
      toWorkId: string,
      ipHash: string,
    ): Promise<InsertOutcome> {
      const { error } = await client
        .from("similar_votes")
        .insert({ from_work_id: fromWorkId, to_work_id: toWorkId, ip_hash: ipHash });
      if (error) {
        if (isUniqueViolation(error)) return "duplicate";
        throw new DbError("similar_votes insert", error);
      }
      return "inserted";
    },
  };
}
