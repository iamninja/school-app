"use client";

import * as React from "react";
import { Mail, Pencil, PhoneCall, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteContactAction,
  listContactsAction,
  updateContactAction,
} from "@/app/protected/teacher/task-actions";
import { ContactForm, upsertDirectoryContact } from "@/components/task-tags-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/expected-error";
import type { TeacherContact } from "@/lib/teacher-contacts";
import { formatGreekPhone } from "@/lib/teacher-app/phone";

/**
 * The Business tab's Contacts: people outside the school - suppliers, the
 * accountant - to tag with "+" in a task, so a call or email task rings or
 * writes to them. On an Android phone a contact can be picked from the
 * phonebook.
 */
export function TeacherContacts() {
  const [contacts, setContacts] = React.useState<TeacherContact[] | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    listContactsAction()
      .then((loaded) => active && setContacts(loaded))
      .catch(() => active && setContacts([]));
    return () => {
      active = false;
    };
  }, []);

  const saved = (contact: TeacherContact) => {
    upsertDirectoryContact(contact);
    setContacts((prev) =>
      [...(prev ?? []).filter((item) => item.id !== contact.id), contact].sort((a, b) =>
        a.name.localeCompare(b.name, "el"),
      ),
    );
    setAdding(false);
    setEditingId(null);
  };

  const remove = async (contact: TeacherContact) => {
    if (!window.confirm(`Delete ${contact.name}? Tasks that tag them keep the name.`)) return;
    setContacts((prev) => (prev ?? []).filter((item) => item.id !== contact.id));
    try {
      await deleteContactAction(contact.id);
    } catch (error) {
      setContacts((prev) => [...(prev ?? []), contact]);
      toast.error(getErrorMessage(error, "Couldn't delete the contact"));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Contacts</CardTitle>
          <CardDescription>
            Suppliers, your accountant and others outside the school. Tag them with + in a task.
          </CardDescription>
        </div>
        {!adding && (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            New contact
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-md border p-3">
            <ContactForm submitLabel="Add contact" onSaved={saved} onCancel={() => setAdding(false)} />
          </div>
        )}
        {contacts === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : contacts.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {contacts.map((contact) =>
              editingId === contact.id ? (
                <li key={contact.id} className="p-3">
                  <ContactForm
                    initial={{
                      name: contact.name,
                      label: contact.label ?? "",
                      phone: contact.phone ? formatGreekPhone(contact.phone) : "",
                      email: contact.email ?? "",
                    }}
                    onSubmit={(values) => updateContactAction(contact.id, values)}
                    onSaved={saved}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={contact.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      +{contact.name}
                      {contact.label && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{contact.label}</span>
                      )}
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 hover:underline">
                          <PhoneCall className="h-3 w-3" aria-hidden="true" />
                          {formatGreekPhone(contact.phone)}
                        </a>
                      )}
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 hover:underline">
                          <Mail className="h-3 w-3" aria-hidden="true" />
                          {contact.email}
                        </a>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${contact.name}`}
                    onClick={() => setEditingId(contact.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${contact.name}`}
                    onClick={() => void remove(contact)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ),
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
