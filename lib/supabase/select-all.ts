/** The project's API row cap (Supabase "Max rows", default 1000). */
export const PAGE_SIZE = 1000;

/**
 * Every row of a query that may return more than the API's row cap.
 *
 * PostgREST returns at most PAGE_SIZE rows per request whatever .limit()
 * asks for, silently - so a plain select over all of a teacher's questions
 * (1233 of them) came back with 1000 and some sections counted 0. This
 * pages with .range() until a short page. `page(from, to)` must build the
 * query with a stable .order() (e.g. on "id"), or pages can overlap.
 */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxRows = 200_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}
