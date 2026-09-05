import { callFunction } from "@/lib/api/client";
import type { ApiResult, SearchResult, WorkSummary } from "@/lib/types";

export function searchWorks(q: string): Promise<ApiResult<SearchResult>> {
  return callFunction<SearchResult>("search-works", { method: "GET", query: { q } });
}

/** `title` is a hint the function needs because the Rakuten Books API cannot look items up by code. */
export function registerWork(rakutenItemCode: string, title: string): Promise<ApiResult<{ work: WorkSummary }>> {
  return callFunction<{ work: WorkSummary }>("register-work", { method: "POST", body: { rakutenItemCode, title } });
}
