"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import { requestDocs, type RequestedInvoice } from "@/lib/mydata/client";

async function requireTeacherSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);
}

/** yyyy-MM-dd (an <input type="date"> value) -> AADE's required dd/MM/yyyy. */
function toAadeDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Documents suppliers/customers have transmitted to myDATA that reference
 * this business - read-only, no import into `expenses` (see TODO.md).
 *
 * Deliberately always queries the "production" environment, unlike
 * sendInvoiceXml which resolves integration_settings.active_environment:
 * this is a read that never files anything, and real supplier documents
 * only ever exist in AADE's actual production system regardless of which
 * environment this app is currently issuing ITS OWN receipts to. Also
 * deliberately does not check integration_settings.enabled - that flag
 * gates real filing, not this lookup.
 */
export async function listMyDataDocumentsAction(params: {
  dateFrom?: string; // yyyy-MM-dd
  dateTo?: string; // yyyy-MM-dd
}): Promise<RequestedInvoice[]> {
  await requireTeacherSession();

  const result = await requestDocs({
    mark: "0",
    dateFrom: params.dateFrom ? toAadeDate(params.dateFrom) : undefined,
    dateTo: params.dateTo ? toAadeDate(params.dateTo) : undefined,
    environment: "production",
  });

  if (!result.ok) {
    // Missing/unconfigured production credentials is a normal state for a
    // teacher who hasn't set them up yet, not a bug.
    throw new ExpectedError(result.error ?? "Could not reach myDATA");
  }

  return result.invoices ?? [];
}
