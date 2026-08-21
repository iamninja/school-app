"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  CheckCircle2Icon,
  FileTextIcon,
  KeyRoundIcon,
  PrinterIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import {
  deleteCredentialAction,
  setCredentialAction,
  updateBusinessProfileAction,
  updateIntegrationSettingsAction,
} from "@/app/protected/teacher/business-settings-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptDocument } from "@/components/receipt-document";
import type {
  BusinessProfile,
  IntegrationSettings,
  Receipt,
} from "@/lib/types/database";

// A fixed sample receipt - never saved, never sent anywhere - so a teacher
// can see how their business details actually lay out on a real receipt
// (logo, spacing, field order) before ever issuing a real one.
const DEMO_RECEIPT: Receipt = {
  id: "demo",
  series: "Α",
  receipt_number: 1,
  issue_date: new Date().toISOString().slice(0, 10),
  recipient_name: "Δείγμα Ονοματεπώνυμο",
  recipient_afm: null,
  recipient_address: null,
  family_id: null,
  total_amount: 50,
  vat_category: "exempt_article_27",
  payment_method: 3,
  notes: null,
  mydata_status: "not_submitted",
  mydata_mark: null,
  mydata_uid: null,
  mydata_error: null,
  mydata_submitted_at: null,
  mydata_environment: null,
  mydata_last_verified_at: null,
  mydata_last_verified_ok: null,
  emailed_at: null,
  created_at: new Date().toISOString(),
  lineItems: [
    {
      id: "demo-1",
      student_id: null,
      description: "Ιδιαίτερο μάθημα Άλγεβρας",
      amount: 25,
      order_index: 0,
    },
    {
      id: "demo-2",
      student_id: null,
      description: "Ιδιαίτερο μάθημα Γεωμετρίας",
      amount: 25,
      order_index: 1,
    },
  ],
};

export interface CredentialStatusView {
  hasValue: boolean;
  lastFour: string | null;
  updatedAt: string | null;
  lastUsedAt: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  aade_mydata: "AADE myDATA",
};

const CREDENTIAL_LABELS: Record<string, string> = {
  user_id: "User ID",
  subscription_key: "Subscription key",
};

const PROFILE_FIELDS = [
  { key: "businessName", label: "Business name", placeholder: "Modus" },
  { key: "afm", label: "ΑΦΜ (tax ID)", placeholder: "123456789" },
  { key: "doy", label: "ΔΟΥ (tax office)", placeholder: "Α ΑΘΗΝΩΝ" },
  { key: "activityCode", label: "ΚΑΔ (activity code)", placeholder: "85.59" },
  { key: "address", label: "Address", placeholder: "Οδός 1" },
  { key: "city", label: "City", placeholder: "Αθήνα" },
  { key: "postalCode", label: "Postal code", placeholder: "12345" },
  { key: "phone", label: "Phone", placeholder: "2100000000" },
] as const;

type ProfileFieldKey = (typeof PROFILE_FIELDS)[number]["key"];
type ProfileForm = Record<ProfileFieldKey, string>;

function profileToForm(profile: BusinessProfile | null): ProfileForm {
  return {
    businessName: profile?.business_name ?? "",
    afm: profile?.afm ?? "",
    doy: profile?.doy ?? "",
    activityCode: profile?.activity_code ?? "",
    address: profile?.address ?? "",
    city: profile?.city ?? "",
    postalCode: profile?.postal_code ?? "",
    phone: profile?.phone ?? "",
  };
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "never";
}

export function TeacherBusinessSettings({
  initialProfile,
  initialIntegrations,
  initialCredentialStatuses,
}: {
  initialProfile: BusinessProfile | null;
  initialIntegrations: IntegrationSettings[];
  initialCredentialStatuses: Record<string, CredentialStatusView>;
}) {
  const [form, setForm] = React.useState<ProfileForm>(
    profileToForm(initialProfile),
  );
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const [integrations, setIntegrations] = React.useState(initialIntegrations);
  const [statuses, setStatuses] = React.useState(initialCredentialStatuses);
  const [viewingDemoReceipt, setViewingDemoReceipt] = React.useState(false);

  const [editing, setEditing] = React.useState<{
    provider: string;
    credentialKey: string;
    environment: "sandbox" | "production";
  } | null>(null);
  const [credentialValue, setCredentialValue] = React.useState("");
  const [isSavingCredential, setIsSavingCredential] = React.useState(false);

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSavingProfile(true);
    try {
      await updateBusinessProfileAction(form);
      toast.success("Business details saved");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save details",
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleToggleEnvironment = async (
    provider: string,
    activeEnvironment: "sandbox" | "production",
    enabled: boolean,
  ) => {
    try {
      const updated = await updateIntegrationSettingsAction(provider, {
        activeEnvironment,
        enabled,
      });
      setIntegrations((prev) =>
        prev.map((item) => (item.provider === provider ? updated : item)),
      );
      toast.success("Integration updated");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update integration",
      );
    }
  };

  const handleSaveCredential = async () => {
    if (!editing || !credentialValue.trim()) {
      toast.error("Enter a value first");
      return;
    }
    setIsSavingCredential(true);
    try {
      const status = await setCredentialAction(
        editing.provider,
        editing.credentialKey,
        editing.environment,
        credentialValue,
      );
      setStatuses((prev) => ({
        ...prev,
        [`${editing.provider}:${editing.credentialKey}:${editing.environment}`]:
          status,
      }));
      setEditing(null);
      setCredentialValue("");
      toast.success("Credential saved");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save credential",
      );
    } finally {
      setIsSavingCredential(false);
    }
  };

  const handleDeleteCredential = async (
    provider: string,
    credentialKey: string,
    environment: "sandbox" | "production",
  ) => {
    if (
      !window.confirm(
        "Remove this credential? Any integration using it will stop working until a new one is set.",
      )
    ) {
      return;
    }
    try {
      const status = await deleteCredentialAction(
        provider,
        credentialKey,
        environment,
      );
      setStatuses((prev) => ({
        ...prev,
        [`${provider}:${credentialKey}:${environment}`]: status,
      }));
      toast.success("Credential removed");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove credential",
      );
    }
  };

  if (viewingDemoReceipt) {
    // Reflects the form as currently edited, not just the last-saved
    // profile - the point is checking layout before committing to Save.
    const previewBusiness: BusinessProfile = {
      id: initialProfile?.id ?? 1,
      business_name: form.businessName || null,
      afm: form.afm || null,
      doy: form.doy || null,
      activity_code: form.activityCode || null,
      address: form.address || null,
      city: form.city || null,
      postal_code: form.postalCode || null,
      phone: form.phone || null,
      updated_at: initialProfile?.updated_at ?? new Date().toISOString(),
    };
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewingDemoReceipt(false)}
          >
            <XIcon className="mr-1 h-3.5 w-3.5" /> Back to Business
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <PrinterIcon className="mr-1 h-3.5 w-3.5" /> Print / Save as PDF
          </Button>
        </div>
        <ReceiptDocument
          receipt={DEMO_RECEIPT}
          business={previewBusiness}
          isDemo
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              These appear on every receipt you issue and are sent to AADE
              with each submission.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {PROFILE_FIELDS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`business-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`business-${field.key}`}
                    value={form[field.key]}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSavingProfile}>
                {isSavingProfile ? "Saving..." : "Save business details"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setViewingDemoReceipt(true)}
              >
                <FileTextIcon className="mr-1 h-3.5 w-3.5" /> Preview demo
                receipt
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {integrations.map((integration) => {
        const credentialKeys = ["user_id", "subscription_key"];
        return (
          <Card key={integration.provider}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>
                {PROVIDER_LABELS[integration.provider] ?? integration.provider}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={integration.enabled ? "default" : "outline"}>
                  {integration.enabled ? "Enabled" : "Disabled"}
                </Badge>
                <Badge
                  variant={
                    integration.active_environment === "production"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {integration.active_environment}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Label
                  htmlFor={`env-${integration.provider}`}
                  className="text-sm font-normal"
                >
                  Active environment
                </Label>
                <select
                  id={`env-${integration.provider}`}
                  value={integration.active_environment}
                  onChange={(event) =>
                    handleToggleEnvironment(
                      integration.provider,
                      event.target.value as "sandbox" | "production",
                      integration.enabled,
                    )
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Production</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleToggleEnvironment(
                      integration.provider,
                      integration.active_environment,
                      !integration.enabled,
                    )
                  }
                >
                  {integration.enabled ? "Disable" : "Enable"}
                </Button>
              </div>

              {(["sandbox", "production"] as const).map((environment) => (
                <div
                  key={environment}
                  className="space-y-2 rounded-md border p-3"
                >
                  <p className="text-sm font-medium capitalize">
                    {environment} credentials
                  </p>
                  {credentialKeys.map((credentialKey) => {
                    const status =
                      statuses[
                        `${integration.provider}:${credentialKey}:${environment}`
                      ];
                    return (
                      <div
                        key={credentialKey}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          {status?.hasValue ? (
                            <CheckCircle2Icon className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <KeyRoundIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span>
                            {CREDENTIAL_LABELS[credentialKey] ?? credentialKey}
                          </span>
                          <span className="text-muted-foreground">
                            {status?.hasValue
                              ? `Set ····${status.lastFour ?? ""} · last used ${formatDate(status.lastUsedAt)}`
                              : "Not set"}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing({
                                provider: integration.provider,
                                credentialKey,
                                environment,
                              });
                              setCredentialValue("");
                            }}
                          >
                            {status?.hasValue ? "Replace" : "Set"}
                          </Button>
                          {status?.hasValue && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${CREDENTIAL_LABELS[credentialKey] ?? credentialKey} for ${environment}`}
                              onClick={() =>
                                void handleDeleteCredential(
                                  integration.provider,
                                  credentialKey,
                                  environment,
                                )
                              }
                            >
                              <Trash2Icon className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setCredentialValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `${CREDENTIAL_LABELS[editing.credentialKey] ?? editing.credentialKey} — ${editing.environment}`
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="credential-value">Value</Label>
            <Input
              id="credential-value"
              type="password"
              autoComplete="off"
              value={credentialValue}
              onChange={(event) => setCredentialValue(event.target.value)}
              placeholder="Paste the value from AADE"
            />
            <p className="text-xs text-muted-foreground">
              Stored encrypted. It is never shown again after saving — only
              the last 4 characters.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={handleSaveCredential}
              disabled={isSavingCredential}
            >
              {isSavingCredential ? "Saving..." : "Save credential"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
