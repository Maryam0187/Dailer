import { redirect } from "next/navigation";
import { getAuthedUser } from "@/server/auth/getAuthedUser";
import ProfileClient from "@/components/Profile/ProfileClient";

export default async function ProfilePage() {
  const authedUser = await getAuthedUser();
  if (!authedUser) redirect("/sign-in");

  return (
    <>
      <div className="mb-6 border-b border-zinc-200/80 pb-5 sm:mb-8 sm:pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
          Profile
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Manage your account and which devices get message notifications.
        </p>
      </div>
      <ProfileClient
        userId={authedUser.id}
        username={authedUser.username}
        role={authedUser.role}
      />
    </>
  );
}
