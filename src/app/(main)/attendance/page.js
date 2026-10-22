import { redirect } from "next/navigation";

export default function AttendancePage() {
  redirect("/user-reports?tab=attendance");
}
