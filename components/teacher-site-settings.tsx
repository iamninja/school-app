"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getSiteSettingsAction,
  updateSiteSettingsAction,
} from "@/app/protected/teacher/site-settings-actions";
import { SettingRow, Toggle } from "@/components/teacher-app-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/expected-error";
import {
  CHRISTMAS_MESSAGE_MAX_LENGTH,
  DEFAULT_CHRISTMAS_MESSAGE,
  christmasLook,
  formatDayOfYear,
  parseDayOfYear,
  type ChristmasMode,
  type DayOfYear,
  type SiteSettings,
} from "@/lib/site-season";
import { athensToday } from "@/lib/push/athens-time";
import { cn } from "@/lib/utils";

const MODES: { value: ChristmasMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "on", label: "On now" },
  { value: "off", label: "Off" },
];

/** A day/month field ("24/12"), saved when it's left or Enter is pressed. */
function DayField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: DayOfYear;
  onSave: (value: DayOfYear) => void;
}) {
  const [text, setText] = React.useState(formatDayOfYear(value));
  const parsed = parseDayOfYear(text);
  const commit = () => {
    if (!parsed) {
      setText(formatDayOfYear(value));
      toast.error("Write the date as day/month, e.g. 24/12");
    } else if (parsed !== value) {
      onSave(parsed);
    }
  };
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <Input
        aria-label={label}
        value={text}
        inputMode="numeric"
        placeholder="dd/mm"
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className={cn("h-8 w-20 text-sm", !parsed && "border-destructive")}
      />
    </label>
  );
}

/**
 * The App tab's "Front page" card: the Christmas look on the public front
 * page - when it shows (by its dates every year, now, or never), from when
 * the decorations and from when the message, and which parts: falling
 * snow, the Santa hat, the message.
 */
export function TeacherSiteSettings() {
  const [settings, setSettings] = React.useState<SiteSettings | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    let active = true;
    getSiteSettingsAction()
      .then((loaded) => {
        if (!active) return;
        setSettings(loaded);
        setMessage(loaded.christmas_message ?? "");
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  const update = async (changes: Partial<SiteSettings>) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...previous, ...changes });
    try {
      setSettings(await updateSiteSettingsAction(changes));
    } catch (error: unknown) {
      setSettings(previous);
      toast.error(getErrorMessage(error, "Couldn't save the setting"));
    }
  };

  if (failed) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm">
          The front page settings couldn&apos;t be loaded. Has the site-settings migration been applied?
        </CardContent>
      </Card>
    );
  }
  if (!settings) return null;

  const look = christmasLook(settings, athensToday());
  const showingNow = look
    ? [look.snow && "snow", look.hat && "Santa hat", look.message && "message"].filter(Boolean).join(", ")
    : null;
  const savedMessage = settings.christmas_message ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Front page</CardTitle>
        <CardDescription>
          The Christmas look on the public front page:{" "}
          {showingNow ? `showing now (${showingNow}).` : "not showing now."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SettingRow
          title="Christmas look"
          description="Auto follows the dates below every year. On now shows everything today - to preview it, or keep it longer."
          control={
            <div role="radiogroup" aria-label="Christmas look" className="inline-flex shrink-0 rounded-md border border-border p-0.5">
              {MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.christmas_mode === mode.value}
                  onClick={() => void update({ christmas_mode: mode.value })}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium",
                    settings.christmas_mode === mode.value
                      ? "bg-brand text-brand-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <DayField
              key={`d-${settings.christmas_decorations_from}`}
              label="Snow & hat from"
              value={settings.christmas_decorations_from}
              onSave={(value) => void update({ christmas_decorations_from: value })}
            />
            <DayField
              key={`m-${settings.christmas_message_from}`}
              label="Message from"
              value={settings.christmas_message_from}
              onSave={(value) => void update({ christmas_message_from: value })}
            />
            <DayField
              key={`u-${settings.christmas_until}`}
              label="Until"
              value={settings.christmas_until}
              onSave={(value) => void update({ christmas_until: value })}
            />
          </div>
        </SettingRow>
        <SettingRow
          title="Falling snow"
          description="Small snowflakes, trees, presents, snowmen, Santas and a few maths symbols, behind the top of the page."
          control={
            <Toggle
              checked={settings.christmas_snow}
              label="Falling snow"
              onChange={(value) => void update({ christmas_snow: value })}
            />
          }
        />
        <SettingRow
          title="Santa hat on the logo"
          control={
            <Toggle
              checked={settings.christmas_hat}
              label="Santa hat on the logo"
              onChange={(value) => void update({ christmas_hat: value })}
            />
          }
        />
        <SettingRow
          title="Also in the student & parent apps"
          description="The same snow and Santa hat on the same days, behind their pages. The message stays on the front page."
          control={
            <Toggle
              checked={settings.christmas_portals}
              label="Also in the student & parent apps"
              onChange={(value) => void update({ christmas_portals: value })}
            />
          }
        />
        <SettingRow
          title="Message"
          description="A short line above the login buttons."
          control={
            <Toggle
              checked={settings.christmas_banner}
              label="Message"
              onChange={(value) => void update({ christmas_banner: value })}
            />
          }
        >
          {settings.christmas_banner && (
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void update({ christmas_message: message });
              }}
            >
              <Input
                aria-label="Message text"
                value={message}
                placeholder={DEFAULT_CHRISTMAS_MESSAGE}
                maxLength={CHRISTMAS_MESSAGE_MAX_LENGTH}
                onChange={(event) => setMessage(event.target.value)}
                className="h-8 text-sm"
              />
              <Button type="submit" size="sm" variant="outline" disabled={message.trim() === savedMessage.trim()}>
                Save
              </Button>
            </form>
          )}
        </SettingRow>
      </CardContent>
    </Card>
  );
}
