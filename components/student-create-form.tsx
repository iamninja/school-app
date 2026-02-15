"use client";

import * as React from "react";
import { PlusIcon, UserRoundIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CLASS_OPTIONS = [
  { id: "algebra", name: "Algebra II" },
  { id: "biology", name: "Biology Lab" },
  { id: "history", name: "World History" },
  { id: "literature", name: "Literature" },
  { id: "coding", name: "Intro to Coding" },
];

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `parent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type ParentContact = {
  id: string;
  name: string;
  relation: string;
  email: string;
  phone: string;
};

export function StudentCreateForm() {
  const [student, setStudent] = React.useState({
    firstName: "",
    lastName: "",
    gradeLevel: "",
    email: "",
    phone: "",
    dob: "",
    address: "",
  });
  const [parents, setParents] = React.useState<ParentContact[]>([
    {
      id: createId(),
      name: "",
      relation: "",
      email: "",
      phone: "",
    },
  ]);
  const [tuition, setTuition] = React.useState({
    plan: "monthly",
    amount: "",
    dueDate: "",
    status: "current",
  });
  const [assignedClasses, setAssignedClasses] = React.useState<string[]>([]);

  const handleStudentChange = (key: keyof typeof student, value: string) => {
    setStudent((prev) => ({ ...prev, [key]: value }));
  };

  const handleTuitionChange = (key: keyof typeof tuition, value: string) => {
    setTuition((prev) => ({ ...prev, [key]: value }));
  };

  const handleParentChange = (
    id: string,
    key: keyof ParentContact,
    value: string
  ) => {
    setParents((prev) =>
      prev.map((parent) =>
        parent.id === id ? { ...parent, [key]: value } : parent
      )
    );
  };

  const handleAddParent = () => {
    setParents((prev) => [
      ...prev,
      { id: createId(), name: "", relation: "", email: "", phone: "" },
    ]);
  };

  const handleRemoveParent = (id: string) => {
    setParents((prev) => prev.filter((parent) => parent.id !== id));
  };

  const handleToggleClass = (classId: string) => {
    setAssignedClasses((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UserRoundIcon className="h-4 w-4" />
          Create student profile
        </div>
        <h1 className="text-2xl font-semibold">Student details</h1>
        <p className="text-sm text-muted-foreground">
          Capture student info, parent contacts, tuition, and assigned classes.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Student info</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first-name">First name</Label>
              <Input
                id="first-name"
                value={student.firstName}
                onChange={(event) =>
                  handleStudentChange("firstName", event.target.value)
                }
                placeholder="e.g. Maya"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last name</Label>
              <Input
                id="last-name"
                value={student.lastName}
                onChange={(event) =>
                  handleStudentChange("lastName", event.target.value)
                }
                placeholder="e.g. Carter"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grade">Grade level</Label>
              <Input
                id="grade"
                value={student.gradeLevel}
                onChange={(event) =>
                  handleStudentChange("gradeLevel", event.target.value)
                }
                placeholder="e.g. 10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                type="date"
                value={student.dob}
                onChange={(event) =>
                  handleStudentChange("dob", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="student-email">Student email</Label>
              <Input
                id="student-email"
                type="email"
                value={student.email}
                onChange={(event) =>
                  handleStudentChange("email", event.target.value)
                }
                placeholder="student@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="student-phone">Student phone</Label>
              <Input
                id="student-phone"
                value={student.phone}
                onChange={(event) =>
                  handleStudentChange("phone", event.target.value)
                }
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={student.address}
                onChange={(event) =>
                  handleStudentChange("address", event.target.value)
                }
                placeholder="Street, city, state"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Tuition</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tuition-plan">Plan</Label>
                <select
                  id="tuition-plan"
                  value={tuition.plan}
                  onChange={(event) =>
                    handleTuitionChange("plan", event.target.value)
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semester">Per semester</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tuition-amount">Amount</Label>
                <Input
                  id="tuition-amount"
                  type="number"
                  min={0}
                  value={tuition.amount}
                  onChange={(event) =>
                    handleTuitionChange("amount", event.target.value)
                  }
                  placeholder="e.g. 420"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tuition-due">Next due date</Label>
                <Input
                  id="tuition-due"
                  type="date"
                  value={tuition.dueDate}
                  onChange={(event) =>
                    handleTuitionChange("dueDate", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tuition-status">Status</Label>
                <select
                  id="tuition-status"
                  value={tuition.status}
                  onChange={(event) =>
                    handleTuitionChange("status", event.target.value)
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="current">Current</option>
                  <option value="past-due">Past due</option>
                  <option value="scholarship">Scholarship</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assigned classes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                {CLASS_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      checked={assignedClasses.includes(option.id)}
                      onCheckedChange={() => handleToggleClass(option.id)}
                    />
                    <span className="flex-1">{option.name}</span>
                  </label>
                ))}
              </div>
              {assignedClasses.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {assignedClasses.map((classId) => {
                    const name =
                      CLASS_OPTIONS.find((option) => option.id === classId)
                        ?.name ?? classId;
                    return (
                      <Badge key={classId} variant="secondary">
                        {name}
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Select classes to attach to this student.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Parents or guardians</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {parents.map((parent, index) => (
            <div
              key={parent.id}
              className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_120px_1fr_1fr]"
            >
              <div className="space-y-2">
                <Label htmlFor={`parent-name-${parent.id}`}>Name</Label>
                <Input
                  id={`parent-name-${parent.id}`}
                  value={parent.name}
                  onChange={(event) =>
                    handleParentChange(parent.id, "name", event.target.value)
                  }
                  placeholder="e.g. Jordan Carter"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`parent-email-${parent.id}`}>Email</Label>
                <Input
                  id={`parent-email-${parent.id}`}
                  type="email"
                  value={parent.email}
                  onChange={(event) =>
                    handleParentChange(parent.id, "email", event.target.value)
                  }
                  placeholder="parent@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`parent-relation-${parent.id}`}>Relation</Label>
                <Input
                  id={`parent-relation-${parent.id}`}
                  value={parent.relation}
                  onChange={(event) =>
                    handleParentChange(parent.id, "relation", event.target.value)
                  }
                  placeholder="Mother"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`parent-phone-${parent.id}`}>Phone</Label>
                <Input
                  id={`parent-phone-${parent.id}`}
                  value={parent.phone}
                  onChange={(event) =>
                    handleParentChange(parent.id, "phone", event.target.value)
                  }
                  placeholder="(555) 654-1234"
                />
              </div>
              <div className="flex items-end justify-end">
                {parents.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveParent(parent.id)}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground sm:col-span-5">
                Parent {index + 1}
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={handleAddParent}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add parent
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          This is a UI prototype. Connect Supabase to save students.
        </p>
        <Button type="submit">Create student</Button>
      </div>
    </form>
  );
}
