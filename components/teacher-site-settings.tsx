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
  isChristmasSeason,
  type ChristmasMode,
  type SiteSettings,
} from "@/lib/site-season";
import { athensToday } from "@/lib/push/athens-time";
import { cn } from "@/lib/utils";

const MODES: { value: ChristmasMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "on", label: "On now" },
  { value: "off", label: "Off" },
];

/**
 * The App tab's "Front page" card: the Christmas look on the public front
 * page - when it shows (automatically 1/12 - 7/1, now, or never) and which
 * parts: falling snow, the Santa hat, the message.
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

  const inSeason = isChristmasSeason(athensToday());
  const showing = settings.christmas_mode === "on" || (settings.christmas_mode === "auto" && inSeason);
  const savedMessage = settings.christmas_message ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Front page</CardTitle>
        <CardDescription>
          The Christmas look on the public front page:{" "}
          {showing ? "showing now." : inSeason ? "switched off." : "not showing now - Auto turns it on from 1 December to 7 January."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SettingRow
          title="Christmas look"
          description="Auto shows it every year from 1 December to 7 January. On now shows it today - to preview it, or keep it longer."
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
        />
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
