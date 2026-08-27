"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Shared "see everything" popup for the parent/student portals - a list
 * card shows a handful of recent entries inline, this wraps the full list
 * behind a button so the page itself never grows into one long scroll.
 * `open`/`onOpenChange` are optional so most callers can use it
 * uncontrolled; the tuition history dialog controls it so it can reset its
 * own "viewing a receipt" sub-state when the dialog closes.
 */
export function PortalHistoryDialog({
  triggerLabel,
  title,
  open,
  onOpenChange,
  children,
}: {
  triggerLabel: string;
  title: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
