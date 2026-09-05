import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { DbError } from "./pg.ts";
import type { PostLogStore } from "./ratelimit.ts";
import type { PostKind } from "./types.ts";

interface PostLogRow {
  created_at: string;
}

/** `post_log` テーブルを使う `PostLogStore` 実装（service role）。 */
export function createPostLogStore(client: SupabaseClient): PostLogStore {
  return {
    async listRecent(
      kind: PostKind,
      ipHash: string,
      since: Date,
      limit: number,
    ): Promise<Date[]> {
      const { data, error } = await client
        .from("post_log")
        .select("created_at")
        .eq("kind", kind)
        .eq("ip_hash", ipHash)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new DbError("post_log select", error);
      const rows = (data ?? []) as unknown as PostLogRow[];
      return rows.map((row) => new Date(row.created_at));
    },

    async record(kind: PostKind, ipHash: string): Promise<void> {
      const { error } = await client
        .from("post_log")
        .insert({ kind, ip_hash: ipHash });
      if (error) throw new DbError("post_log insert", error);
    },
  };
}
