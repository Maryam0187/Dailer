"use client";

import { Suspense } from "react";
import SignInPageClient from "@/components/Auth/SignInPageClient";

export default function SignInPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-zinc-600">Loading…</p>}>
      <SignInPageClient />
    </Suspense>
  );
}
