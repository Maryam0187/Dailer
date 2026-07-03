import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import FilesClient from "@/components/Files/FilesClient";

export default async function FilesPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");

  const pageDescription =
    authedUser.role === "admin"
      ? "View and manage rich-text documents for all users. New files you create are saved under your account."
      : "Create and save rich-text documents. Shared files from admins are read-only — make a copy to edit your own version.";

  return (
    <FilesClient
      userRole={authedUser.role}
      currentUserId={authedUser.id}
      pageDescription={pageDescription}
      accessMode={authedUser.accessMode}
    />
  );
}
