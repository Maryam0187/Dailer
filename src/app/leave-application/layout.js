import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export const dynamic = "force-dynamic";

export default async function LeaveApplicationLayout({ children }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in?mode=leave");
  if (authedUser.sessionPurpose !== "leave_application") redirect("/");

  return children;
}
