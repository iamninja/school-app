/** Shared EUR formatter - extracted from the several components that each
 * declared this identically (teacher-receipts.tsx, teacher-expenses.tsx,
 * receipt-document.tsx). */
export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}
