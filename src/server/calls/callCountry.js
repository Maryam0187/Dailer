import { resolveUserCountry } from "@/lib/countries";

/** A lead's country wins. A call with no lead uses the navbar country, or USA when it is missing. */
export function resolveCallCountry(user, { lead, raw } = {}) {
  if (lead?.country === "canada" || lead?.country === "usa") {
    return { country: lead.country };
  }
  return resolveUserCountry(user, raw);
}
