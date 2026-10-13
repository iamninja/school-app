"use client";

import * as React from "react";
import Link from "next/link";
import { BellIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getInboxAction,
  markInboxReadAction,
  type InboxItem,
} from "@/app/notifications/actions";
import { cn } from "@/lib/utils";

const LABELS = {
  el: {
    title: "Ειδοποιήσεις",
    open: "Ειδοποιήσεις",
    unread: (n: number) => `${n} νέες`,
    empty: "Δεν υπάρχουν ειδοποιήσεις.",
    markAll: "Σήμανση όλων ως αναγνωσμένα",
    error: "Δεν ήταν δυνατή η φόρτωση των ειδοποιήσεων.",
    locale: "el-GR",
  },
  en: {
    title: "Notifications",
    open: "Notifications",
    unread: (n: number) => `${n} new`,
    empty: "No notifications.",
    markAll: "Mark all as read",
    error: "Couldn't load notifications.",
    locale: "en-GB",
  },
};

/**
 * The portal's list of recent notices - everything that was (or would have
 * been) pushed to this person, so a swiped-away notification, or a phone
 * with notifications off (an iPhone without the installed app), still sees
 * it. Hidden in the demo, which has no real session.
 */
export function NotificationBell({
  demoMode = false,
  locale = "el",
}: {
  demoMode?: boolean;
  locale?: "el" | "en";
}) {
  const labels = LABELS[locale];
  const [items, setItems] = React.useState<InboxItem[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(() => {
    getInboxAction()
      .then((rows) => {
        setItems(rows);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  React.useEffect(() => {
    if (demoMode) return;
    load();
    // A notice that arrives while the app is open in the background shows
    // up when the person comes back to it.
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [demoMode, load]);

  if (demoMode) return null;

  const unread = (items ?? []).filter((item) => !item.read_at).length;

  const markRead = (ids: string[] | "all") => {
    const now = new Date().toISOString();
    setItems((current) =>
      (current ?? []).map((item) =>
        ids === "all" || ids.includes(item.id) ? { ...item, read_at: item.read_at ?? now } : item,
      ),
    );
    void markInboxReadAction(ids).catch(() => {});
  };

  return (
    <Popover onOpenChange={(open) => open && load()}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `${labels.open} (${labels.unread(unread)})` : labels.open}
        >
          <BellIcon className="size-4" aria-hidden="true" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-brand-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-2">
          <p className="text-sm font-semibold">{labels.title}</p>
          {unread > 0 ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markRead("all")}
            >
              {labels.markAll}
            </button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {failed ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{labels.error}</p>
          ) : items && items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{labels.empty}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {(items ?? []).map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.url || "/start"}
                    onClick={() => !item.read_at && markRead([item.id])}
                    className={cn(
                      "block px-4 py-3 hover:bg-muted/50",
                      !item.read_at && "bg-brand/5",
                    )}
                  >
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {!item.read_at ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                      ) : null}
                      {item.title}
                    </p>
                    <p className="text-sm text-muted-foreground">{item.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(item.created_at).toLocaleString(labels.locale, {
                        timeZone: "Europe/Athens",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
