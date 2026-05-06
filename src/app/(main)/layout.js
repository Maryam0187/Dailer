import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MainContentShell from "@/components/layout/MainContentShell";
import MainAppShell from "@/components/layout/MainAppShell";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export default async function MainLayout({ children }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");
  const railwayTag =
    process.env.RAILWAY_GIT_TAG ||
    process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    null;
  const deployedAt =
    process.env.RAILWAY_DEPLOYMENT_CREATED_AT ||
    process.env.RAILWAY_DEPLOYED_AT ||
    process.env.NEXT_PUBLIC_DEPLOYED_AT ||
    process.env.NEXT_PUBLIC_BUILD_TIME ||
    null;

  return (
    <MainAppShell>
      <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-black">
        <Navbar role={authedUser.role} />
        <main className="min-h-0 flex-1">
          <MainContentShell>{children}</MainContentShell>
        </main>
        <Footer railwayTag={railwayTag} deployedAt={deployedAt} />
      </div>
    </MainAppShell>
  );
}
