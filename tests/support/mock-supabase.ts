import { vi } from "vitest";

/**
 * Reusable fake Supabase client for unit-testing server actions without a
 * real database. Every query-builder chain method (select/insert/eq/...)
 * returns itself and is a no-op vi.fn() - the mock doesn't care which
 * specific chain was called, only which *table* was queried, since every
 * action in this codebase follows the same `if (error) throw error`
 * pattern regardless of the exact chain shape. `await` on the builder
 * resolves to a canned { data, error } per table, consumed in order if an
 * array is given (for actions that query the same table more than once).
 */

export type TableResponse = {
  data: unknown;
  error: unknown;
  // Supabase's { count: "exact", head: true } queries (used by
  // getQuizAttemptCount/buildQuizListItem) resolve to { count, error },
  // no meaningful `data` - optional here since most queries don't use it.
  count?: number;
};

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "delete",
  "upsert",
  "eq",
  "is",
  "match",
  "in",
  "gte",
  "lte",
  "order",
  "limit",
  "single",
  "maybeSingle",
] as const;

export function createMockSupabaseClient(
  tableResponses: Record<string, TableResponse | TableResponse[]>,
  user: { id: string } | null = { id: "teacher-1" },
) {
  const callIndex: Record<string, number> = {};

  function builder(table: string) {
    const queued = tableResponses[table];
    const list = Array.isArray(queued) ? queued : [queued];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- chain proxy, methods are dynamically attached below
    const chain: any = {};
    for (const method of CHAIN_METHODS) {
      chain[method] = vi.fn(() => chain);
    }
    chain.then = (resolve: (value: TableResponse) => void) => {
      const i = callIndex[table] ?? 0;
      callIndex[table] = i + 1;
      const response = list[Math.min(i, list.length - 1)] ?? {
        data: null,
        error: null,
        count: undefined,
      };
      resolve(response);
      return chain;
    };
    return chain;
  }

  return {
    from: vi.fn((table: string) => builder(table)),
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    // Not stubbed by default - tests that touch Storage (quiz images) set
    // this themselves, e.g. `client.storage = { from: vi.fn(...) }`.
    storage: undefined as unknown,
  };
}
