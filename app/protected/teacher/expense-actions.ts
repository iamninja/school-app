"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import type { Expense, ExpenseInput } from "@/lib/types/database";

const EXPENSE_COLUMNS =
  "id, expense_date, supplier_name, supplier_afm, description, amount, vat_amount, category, payment_method, notes, created_at";

async function requireTeacherSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);
  return supabase;
}

function normalize(input: ExpenseInput) {
  const supplierName = input.supplierName.trim();
  const description = input.description.trim();

  if (!supplierName) {
    throw new ExpectedError("Enter who the expense was paid to");
  }
  if (!description) {
    throw new ExpectedError("Enter what the expense was for");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ExpectedError("Amount must be greater than zero");
  }
  if (
    input.vatAmount !== undefined &&
    (!Number.isFinite(input.vatAmount) || input.vatAmount < 0)
  ) {
    throw new ExpectedError("VAT amount can't be negative");
  }

  return {
    expense_date: input.expenseDate || new Date().toISOString().slice(0, 10),
    supplier_name: supplierName,
    supplier_afm: input.supplierAfm?.trim() || null,
    description,
    amount: input.amount,
    vat_amount: input.vatAmount ?? null,
    category: input.category?.trim() || null,
    payment_method: input.paymentMethod ?? null,
    notes: input.notes?.trim() || null,
  };
}

export async function listExpensesAction(): Promise<Expense[]> {
  const supabase = await requireTeacherSession();

  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .order("expense_date", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
    vat_amount: row.vat_amount === null ? null : Number(row.vat_amount),
  })) as Expense[];
}

export async function createExpenseAction(
  input: ExpenseInput,
): Promise<Expense> {
  const supabase = await requireTeacherSession();

  const { data, error } = await supabase
    .from("expenses")
    .insert(normalize(input))
    .select(EXPENSE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    amount: Number(data.amount),
    vat_amount: data.vat_amount === null ? null : Number(data.vat_amount),
  } as Expense;
}

export async function updateExpenseAction(
  expenseId: string,
  input: ExpenseInput,
): Promise<Expense> {
  const supabase = await requireTeacherSession();

  const { data, error } = await supabase
    .from("expenses")
    .update(normalize(input))
    .eq("id", expenseId)
    .select(EXPENSE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    amount: Number(data.amount),
    vat_amount: data.vat_amount === null ? null : Number(data.vat_amount),
  } as Expense;
}

export async function deleteExpenseAction(expenseId: string): Promise<void> {
  const supabase = await requireTeacherSession();

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", expenseId);

  if (error) {
    throw error;
  }
}
