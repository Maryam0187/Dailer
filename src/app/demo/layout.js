import { DemoProvider } from "@/lib/demo/DemoProvider";

export const metadata = {
  title: "Interactive demo — Dialer",
  description:
    "Interactive dialer demo — softphone, leads workflow, team messaging, and presence. No sign-in required.",
};

export default function DemoLayout({ children }) {
  return <DemoProvider>{children}</DemoProvider>;
}
