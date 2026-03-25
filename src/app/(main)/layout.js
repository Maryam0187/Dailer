import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MainContentShell from "@/components/layout/MainContentShell";
import MainAppShell from "@/components/layout/MainAppShell";
import { getAuthedUser } from "@/server/auth/getAuthedUser";

export default async function MainLayout({ children }) {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");

  return (
    <MainAppShell>
      <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-black">
        <Navbar role={authedUser.role} />
        <main className="min-h-0 flex-1">
          <MainContentShell>{children}</MainContentShell>
        </main>
        <Footer />
      </div>
    </MainAppShell>
  );
}
