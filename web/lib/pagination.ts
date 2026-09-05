import type { Paginated } from "@/lib/types";

export function pageCount(total: number, size: number): number {
  if (size <= 0) throw new Error("page size must be positive");
  return Math.max(1, Math.ceil(total / size));
}

/** 1-based pagination over an in-memory list. Out-of-range pages return an empty page. */
export function paginate<T>(items: T[], page: number, size: number): Paginated<T> {
  const count = pageCount(items.length, size);
  const safePage = Math.max(1, Math.floor(page));
  const start = (safePage - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: safePage,
    pageCount: count,
    total: items.length,
  };
}
