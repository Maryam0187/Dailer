/** US states/territories with primary IANA timezone for local clock display. */
export const US_STATES = [
  { code: "AL", name: "Alabama", timeZone: "America/Chicago" },
  { code: "AK", name: "Alaska", timeZone: "America/Anchorage" },
  { code: "AZ", name: "Arizona", timeZone: "America/Phoenix" },
  { code: "AR", name: "Arkansas", timeZone: "America/Chicago" },
  { code: "CA", name: "California", timeZone: "America/Los_Angeles" },
  { code: "CO", name: "Colorado", timeZone: "America/Denver" },
  { code: "CT", name: "Connecticut", timeZone: "America/New_York" },
  { code: "DE", name: "Delaware", timeZone: "America/New_York" },
  { code: "DC", name: "District of Columbia", timeZone: "America/New_York" },
  { code: "FL", name: "Florida", timeZone: "America/New_York" },
  { code: "GA", name: "Georgia", timeZone: "America/New_York" },
  { code: "HI", name: "Hawaii", timeZone: "Pacific/Honolulu" },
  { code: "ID", name: "Idaho", timeZone: "America/Boise" },
  { code: "IL", name: "Illinois", timeZone: "America/Chicago" },
  { code: "IN", name: "Indiana", timeZone: "America/Indiana/Indianapolis" },
  { code: "IA", name: "Iowa", timeZone: "America/Chicago" },
  { code: "KS", name: "Kansas", timeZone: "America/Chicago" },
  { code: "KY", name: "Kentucky", timeZone: "America/New_York" },
  { code: "LA", name: "Louisiana", timeZone: "America/Chicago" },
  { code: "ME", name: "Maine", timeZone: "America/New_York" },
  { code: "MD", name: "Maryland", timeZone: "America/New_York" },
  { code: "MA", name: "Massachusetts", timeZone: "America/New_York" },
  { code: "MI", name: "Michigan", timeZone: "America/Detroit" },
  { code: "MN", name: "Minnesota", timeZone: "America/Chicago" },
  { code: "MS", name: "Mississippi", timeZone: "America/Chicago" },
  { code: "MO", name: "Missouri", timeZone: "America/Chicago" },
  { code: "MT", name: "Montana", timeZone: "America/Denver" },
  { code: "NE", name: "Nebraska", timeZone: "America/Chicago" },
  { code: "NV", name: "Nevada", timeZone: "America/Los_Angeles" },
  { code: "NH", name: "New Hampshire", timeZone: "America/New_York" },
  { code: "NJ", name: "New Jersey", timeZone: "America/New_York" },
  { code: "NM", name: "New Mexico", timeZone: "America/Denver" },
  { code: "NY", name: "New York", timeZone: "America/New_York" },
  { code: "NC", name: "North Carolina", timeZone: "America/New_York" },
  { code: "ND", name: "North Dakota", timeZone: "America/Chicago" },
  { code: "OH", name: "Ohio", timeZone: "America/New_York" },
  { code: "OK", name: "Oklahoma", timeZone: "America/Chicago" },
  { code: "OR", name: "Oregon", timeZone: "America/Los_Angeles" },
  { code: "PA", name: "Pennsylvania", timeZone: "America/New_York" },
  { code: "RI", name: "Rhode Island", timeZone: "America/New_York" },
  { code: "SC", name: "South Carolina", timeZone: "America/New_York" },
  { code: "SD", name: "South Dakota", timeZone: "America/Chicago" },
  { code: "TN", name: "Tennessee", timeZone: "America/Chicago" },
  { code: "TX", name: "Texas", timeZone: "America/Chicago" },
  { code: "UT", name: "Utah", timeZone: "America/Denver" },
  { code: "VT", name: "Vermont", timeZone: "America/New_York" },
  { code: "VA", name: "Virginia", timeZone: "America/New_York" },
  { code: "WA", name: "Washington", timeZone: "America/Los_Angeles" },
  { code: "WV", name: "West Virginia", timeZone: "America/New_York" },
  { code: "WI", name: "Wisconsin", timeZone: "America/Chicago" },
  { code: "WY", name: "Wyoming", timeZone: "America/Denver" },
];

const byCode = new Map(US_STATES.map((s) => [s.code, s]));

export function getStateByCode(code) {
  return byCode.get(String(code || "").trim().toUpperCase()) || null;
}

export function formatStateLocalTime(timeZone, date = new Date()) {
  if (!timeZone) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return "";
  }
}
