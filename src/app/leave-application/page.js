import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import LeaveApplicationClient from "@/components/Leave/LeaveApplicationClient";

export const dynamic = "force-dynamic";

export default async function LeaveApplicationPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in?mode=leave");

  return <LeaveApplicationClient username={authedUser.username} />;
}
