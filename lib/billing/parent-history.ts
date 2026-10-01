/**
 * Shapes the family ledger for the parent portal's payment history.
 *
 * A multi-month receipt pre-posts one monthly_charge per covered month, all
 * in the same instant (see post_receipt_coverage()). Listing them as nine
 * separate "charge" rows dated today, for months up to a year away, is
 * accurate but noisy - so the receipt-tagged charges are folded into a
 * single line. The balance is unaffected (the folded amount is the exact
 * sum), and the discount and receipt credit stay as their own rows.
 */

import type { FamilyBalanceTransactionType } from "@/lib/types/database";

export interface LedgerHistoryRow {
  id: string;
  type: FamilyBalanceTransactionType;
  amount: number;
  description: string;
  receipt_id: string | null;
  created_at: string;
  period: string | null;
  covering_receipt_id: string | null;
}

export interface ParentHistoryTransaction {
  id: string;
  type: FamilyBalanceTransactionType;
  amount: number;
  description: string;
  createdAt: string;
  receiptId: string | null;
}

function formatMonth(period: string): string {
  const [year, month] = period.split("-");
  return `${month}/${year}`;
}

// Rows created in one transaction share created_at exactly. Displayed
// newest-first, so the receipt credit lands on top, then the discount, then
// the charges they settle - the order a parent reads it bottom-up.
function tieRank(type: string): number {
  if (type === "receipt") return 3;
  if (type === "adjustment") return 2;
  return 1;
}

export function toParentHistory(
  rows: LedgerHistoryRow[],
): ParentHistoryTransaction[] {
  const groups = new Map<string, LedgerHistoryRow[]>();
  const entries: Array<{ rank: number; txn: ParentHistoryTransaction }> = [];

  for (const row of rows) {
    if (row.type === "monthly_charge" && row.covering_receipt_id) {
      const group = groups.get(row.covering_receipt_id) ?? [];
      group.push(row);
      groups.set(row.covering_receipt_id, group);
      continue;
    }
    entries.push({
      rank: tieRank(row.type),
      txn: {
        id: row.id,
        type: row.type,
        amount: row.amount,
        description: row.description,
        createdAt: row.created_at,
        receiptId: row.receipt_id,
      },
    });
  }

  for (const [receiptId, group] of groups) {
    const periods = group
      .map((row) => row.period)
      .filter((period): period is string => Boolean(period))
      .sort();
    const first = periods[0];
    const last = periods[periods.length - 1];
    const range =
      first === undefined
        ? ""
        : first === last
          ? formatMonth(first)
          : `${formatMonth(first)} – ${formatMonth(last)}`;
    const count = group.length;
    const createdAt = group
      .map((row) => row.created_at)
      .reduce((latest, value) => (value > latest ? value : latest));
    const months = `${count} ${count === 1 ? "μήνας" : "μήνες"}`;

    entries.push({
      rank: tieRank("monthly_charge"),
      txn: {
        id: `covered-${receiptId}`,
        type: "monthly_charge",
        amount: group.reduce((sum, row) => sum + row.amount, 0),
        description: range ? `Δίδακτρα ${range} (${months})` : `Δίδακτρα (${months})`,
        createdAt,
        receiptId: null,
      },
    });
  }

  entries.sort((a, b) =>
    a.txn.createdAt === b.txn.createdAt
      ? b.rank - a.rank
      : a.txn.createdAt < b.txn.createdAt
        ? 1
        : -1,
  );

  return entries.map((entry) => entry.txn);
}
