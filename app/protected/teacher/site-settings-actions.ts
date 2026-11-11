"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  CHRISTMAS_MESSAGE_MAX_LENGTH,
  SITE_SETTINGS_COLUMNS,
  type ChristmasMode,
  type SiteSettings,
} from "@/lib/site-season";

// The front page's seasonal look, set from the console's App tab - see
// supabase/migrations/*_site-settings.sql.

async function requireTeacherSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  await requireTeacher(supabase, user.id);
  return supabase;
}

const MODES: readonly ChristmasMode[] = ["auto", "on", "off"];

export async function getSiteSettingsAction(): Promise<SiteSettings> {
  const supabase = await requireTeacherSession();
  const { data, error } = await supabase
    .from("site_settings")
    .select(SITE_SETTINGS_COLUMNS)
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data as SiteSettings;
}

export async function updateSiteSettingsAction(changes: Partial<SiteSettings>): Promise<SiteSettings> {
  const supabase = await requireTeacherSession();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.christmas_mode !== undefined) {
    if (!MODES.includes(changes.christmas_mode)) throw new ExpectedError("Pick auto, on or off");
    update.christmas_mode = changes.christmas_mode;
  }
  for (const key of ["christmas_snow", "christmas_hat", "christmas_banner"] as const) {
    if (changes[key] !== undefined) update[key] = changes[key] === true;
  }
  if (changes.christmas_message !== undefined) {
    const message = changes.christmas_message?.replace(/\s+/g, " ").trim() || null;
    if (message && message.length > CHRISTMAS_MESSAGE_MAX_LENGTH) {
      throw new ExpectedError(`Keep the message under ${CHRISTMAS_MESSAGE_MAX_LENGTH} characters`);
    }
    update.christmas_message = message;
  }

  const { data, error } = await supabase
    .from("site_settings")
    .update(update)
    .eq("id", 1)
    .select(SITE_SETTINGS_COLUMNS)
    .single();
  if (error) throw error;
  // The front page reads these on each visit; refresh any cached copy.
  revalidatePath("/");
  return data as SiteSettings;
}
