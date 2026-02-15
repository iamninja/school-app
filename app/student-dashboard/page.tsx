import { getStudentDashboardDataAction } from "@/app/auth/student/actions";
import { StudentDashboard } from "@/components/student-dashboard";

export default async function StudentDashboardPage() {
  const data = await getStudentDashboardDataAction();

  // If data is a redirect, it will be handled by Next.js
  // Otherwise we have the dashboard data
  return <StudentDashboard {...data} />;
}
