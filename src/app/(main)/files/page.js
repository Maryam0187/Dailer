import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import FilesClient from "@/components/Files/FilesClient";

export default async function FilesPage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");

  return (
    <>
      <div className="mb-8 border-b border-zinc-200/80 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Files</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          {authedUser.role === "admin"
            ? "View and manage rich-text documents for all users. New files you create are saved under your account."
            : "Create and save rich-text documents with custom file names. Your files are private to your account."}
        </p>
      </div>
      <FilesClient userRole={authedUser.role} />
    </>
  );
}
