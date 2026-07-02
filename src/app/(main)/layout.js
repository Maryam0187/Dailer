import { redirect } from "next/navigation";
import Footer from "@/components/layout/Footer";
import MainAppShell from "@/components/layout/MainAppShell";
import MainContentShell from "@/components/layout/MainContentShell";
import Navbar from "@/components/layout/Navbar";
import { getAuthedUserWithLogoutReason, signInRedirectPath } from "@/server/auth/getAuthedUser";
import { getLiveShiftStatus } from "@/server/auth/shiftSettings";
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
  const shiftStatus = authedUser.role === "admin" ? await getLiveShiftStatus() : null;

  return (
    <MainAppShell>
      <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-black">
        <Navbar role={authedUser.role} shiftStatus={shiftStatus} accessMode={authedUser.accessMode} />
        {authedUser.accessMode === "limited" ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            Limited after-shift access — dialer and your assigned file only.
          </div>
        ) : null}
        <main className="min-h-0 flex-1">
          <MainContentShell>{children}</MainContentShell>
        </main>
        <Footer deploymentTag={deploymentTag} deployedAt={deployedAt} />
      </div>
    </MainAppShell>
  );
}
