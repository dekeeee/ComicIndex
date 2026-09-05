import { DbError, isUniqueViolation } from "../_shared/pg.ts";
import type { SupabaseClient } from "../_shared/supabase-admin.ts";
import type { ReportReason } from "../_shared/types.ts";
import type { InsertOutcome, ReportRepo } from "./handler.ts";

export function createReportRepo(client: SupabaseClient): ReportRepo {
  return {
    async reviewExists(reviewId: string): Promise<boolean> {
      const { data, error } = await client
        .from("reviews")
        .select("id")
        .eq("id", reviewId)
        .maybeSingle();
      if (error) throw new DbError("reviews select", error);
      return data !== null;
    },

    async insertReport(
      reviewId: string,
      reason: ReportReason,
      ipHash: string,
    ): Promise<InsertOutcome> {
      const { error } = await client
        .from("reports")
        .insert({ review_id: reviewId, reason, ip_hash: ipHash });
      if (error) {
        if (isUniqueViolation(error)) return "duplicate";
        throw new DbError("reports insert", error);
      }
      return "inserted";
    },

    async countReports(reviewId: string): Promise<number> {
      const { count, error } = await client
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("review_id", reviewId);
      if (error) throw new DbError("reports count", error);
      return count ?? 0;
    },

    async recordReportCount(
      reviewId: string,
      count: number,
      hide: boolean,
    ): Promise<void> {
      const patch: Record<string, unknown> = { report_count: count };
      if (hide) patch["status"] = "hidden";
      const { error } = await client
        .from("reviews")
        .update(patch)
        .eq("id", reviewId);
      if (error) throw new DbError("reviews update", error);
    },
  };
}
