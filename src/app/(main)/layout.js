import { redirect } from "next/navigation";
import Footer from "@/components/layout/Footer";
import MainAppShell from "@/components/layout/MainAppShell";
import MainContentShell from "@/components/layout/MainContentShell";
import Navbar from "@/components/layout/Navbar";
import { getAuthedUserWithLogoutReason } from "@/server/auth/getAuthedUser";
import { getDeploymentTag, getDeploymentTimestampRaw } from "@/server/deploymentInfo";

/** Read Railway/runtime env on each request (avoid build-time inlining of deployment metadata). */
export const dynamic = "force-dynamic";

export default async function MainLayout({ children }) {
  const { user: authedUser, logoutReason } = await getAuthedUserWithLogoutReason();
  if (!authedUser) {
    redirect(logoutReason === "shift_ended" ? "/sign-in?reason=shift_ended" : "/sign-in");
  }
  const deploymentTag = getDeploymentTag();
  const deployedAt = getDeploymentTimestampRaw();

  return (
    <MainAppShell>
      <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-black">
        <Navbar role={authedUser.role} />
        <main className="min-h-0 flex-1">
          <MainContentShell>{children}</MainContentShell>
        </main>
        <Footer deploymentTag={deploymentTag} deployedAt={deployedAt} />
      </div>
    </MainAppShell>
  );
}
