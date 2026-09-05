import { WORK_SUMMARY_COLUMNS } from "../_shared/mappers.ts";
import { DbError, isUniqueViolation } from "../_shared/pg.ts";
import type { SupabaseClient } from "../_shared/supabase-admin.ts";
import type { WorkRow } from "../_shared/types.ts";
import type { NewVolumeRow, NewWorkRow, RegisterRepo } from "./handler.ts";

interface VolumeWorkIdRow {
  work_id: string;
}

export function createRegisterRepo(client: SupabaseClient): RegisterRepo {
  async function findWorkById(id: string): Promise<WorkRow | null> {
    const { data, error } = await client
      .from("works")
      .select(WORK_SUMMARY_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new DbError("works select", error);
    return (data as unknown as WorkRow | null) ?? null;
  }

  return {
    async findWorkByItemCode(itemCode: string): Promise<WorkRow | null> {
      const { data, error } = await client
        .from("work_volumes")
        .select("work_id")
        .eq("rakuten_item_code", itemCode)
        .maybeSingle();
      if (error) throw new DbError("work_volumes select", error);
      const row = data as unknown as VolumeWorkIdRow | null;
      if (row === null) return null;
      return findWorkById(row.work_id);
    },

    async findWorkBySeriesKey(key: string): Promise<WorkRow | null> {
      const { data, error } = await client
        .from("works")
        .select(WORK_SUMMARY_COLUMNS)
        .eq("rakuten_series_key", key)
        .maybeSingle();
      if (error) throw new DbError("works select", error);
      return (data as unknown as WorkRow | null) ?? null;
    },

    async insertWork(row: NewWorkRow): Promise<WorkRow | "duplicate"> {
      const { data, error } = await client
        .from("works")
        .insert(row)
        .select(WORK_SUMMARY_COLUMNS)
        .single();
      if (error) {
        if (isUniqueViolation(error)) return "duplicate";
        throw new DbError("works insert", error);
      }
      return data as unknown as WorkRow;
    },

    async upsertVolume(row: NewVolumeRow): Promise<void> {
      const { error } = await client
        .from("work_volumes")
        .upsert(row, { onConflict: "rakuten_item_code", ignoreDuplicates: true });
      if (error) throw new DbError("work_volumes upsert", error);
    },
  };
}
