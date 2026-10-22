import { redirect } from "next/navigation";

export default function ReportsPage() {
  redirect("/user-reports?tab=metrics");
}
