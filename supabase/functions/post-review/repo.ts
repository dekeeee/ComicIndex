import { REVIEW_COLUMNS } from "../_shared/mappers.ts";
import { DbError } from "../_shared/pg.ts";
import type { SupabaseClient } from "../_shared/supabase-admin.ts";
import type { ReviewRow } from "../_shared/types.ts";
import type { NewReviewRow, ReviewRepo, WorkGate } from "./handler.ts";

export function createReviewRepo(client: SupabaseClient): ReviewRepo {
  return {
    async findWorkGate(workId: string): Promise<WorkGate | null> {
      const { data, error } = await client
        .from("works")
        .select("status,is_adult")
        .eq("id", workId)
        .maybeSingle();
      if (error) throw new DbError("works select", error);
      return (data as unknown as WorkGate | null) ?? null;
    },

    async insertReview(row: NewReviewRow): Promise<ReviewRow> {
      const { data, error } = await client
        .from("reviews")
        .insert(row)
        .select(REVIEW_COLUMNS)
        .single();
      if (error) throw new DbError("reviews insert", error);
      return data as unknown as ReviewRow;
    },
  };
}
