import { redirect } from "next/navigation";
import Footer from "@/components/layout/Footer";
import MainAppShell from "@/components/layout/MainAppShell";
import MainContentShell from "@/components/layout/MainContentShell";
import Navbar from "@/components/layout/Navbar";
import { getAuthedUserWithLogoutReason, signInRedirectPath } from "@/server/auth/getAuthedUser";
import { getShiftStatus } from "@/server/auth/loginWindow";
import { getDeploymentTag, getDeploymentTimestampRaw } from "@/server/deploymentInfo";

/** Read Railway/runtime env on each request (avoid build-time inlining of deployment metadata). */
export const dynamic = "force-dynamic";

export default async function MainLayout({ children }) {
  const { user: authedUser, logoutReason } = await getAuthedUserWithLogoutReason();
  if (!authedUser) {
    redirect(signInRedirectPath(logoutReason));
  }
  const deploymentTag = getDeploymentTag();
  const deployedAt = getDeploymentTimestampRaw();
  const shiftStatus = authedUser.role === "admin" ? getShiftStatus() : null;

  return (
    <MainAppShell>
      <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-black">
        <Navbar role={authedUser.role} shiftStatus={shiftStatus} />
        <main className="min-h-0 flex-1">
          <MainContentShell>{children}</MainContentShell>
        </main>
        <Footer deploymentTag={deploymentTag} deployedAt={deployedAt} />
      </div>
    </MainAppShell>
  );
}
