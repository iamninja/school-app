// Display-only Greek label maps for the parent/student dashboards. The
// underlying stored values (day abbreviations, status enums) stay in
// English/as-is in the database and in teacher-facing UI - these are purely
// presentational lookups for the two Greek-language views.

export const DAY_LABELS_EL: Record<string, string> = {
  Mon: "Δευ",
  Tue: "Τρι",
  Wed: "Τετ",
  Thu: "Πεμ",
  Fri: "Παρ",
  Sat: "Σαβ",
  Sun: "Κυρ",
};

export const ATTENDANCE_STATUS_LABELS_EL: Record<string, string> = {
  present: "Παρών",
  late: "Άργησε",
  absent: "Απουσία",
};

export const TUITION_STATUS_LABELS_EL: Record<string, string> = {
  current: "Ενημερωμένος",
  "past-due": "Σε καθυστέρηση",
  scholarship: "Υποτροφία",
};
