import { callFunction } from "@/lib/api/client";
import type { ApiResult } from "@/lib/types";

export function voteSimilar(fromWorkId: string, toWorkId: string): Promise<ApiResult<void>> {
  return callFunction<void>("vote-similar", { method: "POST", body: { fromWorkId, toWorkId } });
}
