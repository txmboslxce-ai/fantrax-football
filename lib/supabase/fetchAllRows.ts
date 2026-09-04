import type { PostgrestError } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

// Supabase/PostgREST caps how many rows a single request can return
// regardless of an explicit .limit() value -- a query that actually matches
// more rows than that cap silently returns a truncated, arbitrarily-ordered
// subset rather than an error. Confirmed live: a player_gameweeks fetch for
// a whole prior season (one row per player per gameweek, comfortably into
// five figures) was silently dropping rows for some players entirely,
// making their real prior-season history invisible to the shrinkage
// formulas that depend on it -- with no error, just a fallback to a generic
// position average as if that player had no history at all. Paging through
// with .range() until a page comes back short of PAGE_SIZE guarantees every
// matching row is actually fetched, however many there are.
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(error.message);
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}
