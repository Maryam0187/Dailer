import { redirect } from "next/navigation";

/** Legacy route — conference logs live on the home Call logs “Conference calls” filter. */
export default function ConferenceRedirectPage() {
  redirect("/?scope=conference");
}
