export const WORKFLOW_TAG_SEEDS = [
  { category: "phase", tagKey: "active", fullLabel: "Active", shortLabel: "Act", tone: "emerald", sortOrder: 10 },
  { category: "phase", tagKey: "closed", fullLabel: "Sale close", shortLabel: "SC", tone: "slate", sortOrder: 20 },
  { category: "phase", tagKey: "cancelled", fullLabel: "Cancelled", shortLabel: "Can", tone: "red", sortOrder: 30 },
  { category: "progress", tagKey: "verified", fullLabel: "Verified", shortLabel: "V", tone: "yellow", sortOrder: 10 },
  { category: "progress", tagKey: "processed", fullLabel: "Processed", shortLabel: "P", tone: "violet", sortOrder: 20 },
  { category: "progress", tagKey: "sale_done", fullLabel: "Sale done", shortLabel: "sd", tone: "emerald", sortOrder: 30 },
  { category: "contact", tagKey: "voicemail", fullLabel: "Voicemail", shortLabel: "VM", tone: "amber", sortOrder: 10 },
  { category: "contact", tagKey: "hangup", fullLabel: "Hangup", shortLabel: "HU", tone: "rose", sortOrder: 20 },
  { category: "contact", tagKey: "no_response", fullLabel: "No response", shortLabel: "NR", tone: "zinc", sortOrder: 30 },
  { category: "contact", tagKey: "appointment", fullLabel: "Appointment", shortLabel: "Appt", tone: "sky", sortOrder: 40 },
  { category: "payment", tagKey: "check_mail", fullLabel: "Check mail", shortLabel: "CK", tone: "teal", sortOrder: 10 },
  { category: "payment", tagKey: "e_check", fullLabel: "E-check", shortLabel: "ECK", tone: "yellow", sortOrder: 15 },
  { category: "payment", tagKey: "card", fullLabel: "Card", shortLabel: "Card", tone: "indigo", sortOrder: 20 },
  { category: "payment", tagKey: "pos_link", fullLabel: "POS Link", shortLabel: "POS", tone: "fuchsia", sortOrder: 30 },
];

export const WORKFLOW_TAG_CATEGORIES = new Set(["phase", "progress", "contact", "payment"]);
