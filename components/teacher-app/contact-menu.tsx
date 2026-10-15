"use client";

import { MessageCircle, MessageSquare, Phone, PhoneCall } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CompanionContact } from "@/lib/teacher-app/load";
import { contactLinks, formatGreekPhone, type ContactLink } from "@/lib/teacher-app/phone";

const ICONS: Record<ContactLink["kind"], React.ComponentType<{ className?: string }>> = {
  call: PhoneCall,
  sms: MessageSquare,
  viber: MessageCircle,
  whatsapp: MessageCircle,
};

/**
 * Call / SMS / Viber / WhatsApp for a student's parents (primary first) and
 * the student. Whether a number actually has Viber or WhatsApp can't be
 * checked from a web page - the app itself says so if it doesn't. Landlines
 * only offer Call.
 */
export function ContactMenu({
  studentName,
  contacts,
}: {
  studentName: string;
  contacts: CompanionContact[];
}) {
  if (contacts.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label={`Contact ${studentName}'s family`}
        >
          <Phone className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {contacts.map((contact, index) => (
          <DropdownMenuGroup key={`${contact.phone}-${index}`}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate font-medium">
                {contact.name}
                {contact.role === "student" && " (student)"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {formatGreekPhone(contact.phone)}
              </span>
            </DropdownMenuLabel>
            {contactLinks(contact.phone).map((link) => {
              const Icon = ICONS[link.kind];
              return (
                <DropdownMenuItem key={link.kind} asChild>
                  <a
                    href={link.href}
                    {...(link.kind === "whatsapp" ? { target: "_blank", rel: "noreferrer" } : {})}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {link.label}
                  </a>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
