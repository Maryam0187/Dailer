import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import FilesClient from "@/components/Files/FilesClient";

export default async function FilesPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");

  const pageDescription =
    authedUser.role === "admin"
      ? "View and manage rich-text documents for all users. New files you create are saved under your account."
      : "Create and save rich-text documents with custom file names. Your files are private to your account.";

  return <FilesClient userRole={authedUser.role} pageDescription={pageDescription} accessMode={authedUser.accessMode} />;
}
