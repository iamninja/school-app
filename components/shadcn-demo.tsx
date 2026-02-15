"use client";

import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";

export function ShadcnDemo() {
  return (
    <section className="w-full rounded-xl border bg-card/50 p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Shadcn UI demo</h2>
          <p className="text-sm text-muted-foreground">
            Quick sample of Alert, Tabs, Dialog, and Sonner toast.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            toast.success("Enrollment synced", {
              description: "Student roster updated just now.",
            })
          }
        >
          Show toast
        </Button>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>
            This is a lightweight example alert you can restyle per section.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="grading">Grading</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="text-sm text-muted-foreground">
            Track upcoming assessments, class notes, and quick stats.
          </TabsContent>
          <TabsContent
            value="attendance"
            className="text-sm text-muted-foreground"
          >
            Review attendance trends and flag students who need follow-up.
          </TabsContent>
          <TabsContent value="grading" className="text-sm text-muted-foreground">
            Export grade summaries or push updates to parents.
          </TabsContent>
        </Tabs>

        <Dialog>
          <DialogTrigger asChild>
            <Button>Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share class update</DialogTitle>
              <DialogDescription>
                Notify guardians with the latest assignment summary.
              </DialogDescription>
            </DialogHeader>
            <div className="text-sm text-muted-foreground">
              This modal is just a template. Swap in a form or stepper.
            </div>
            <DialogFooter>
              <Button variant="outline">Later</Button>
              <Button>Send update</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Toaster richColors />
    </section>
  );
}
