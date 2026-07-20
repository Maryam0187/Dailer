/** Target fields available in the sales import column mapper. */

export const IMPORT_TARGET_GROUPS = [
  {
    id: "required",
    label: "Required",
    options: [{ value: "phone", label: "Phone → Customers + Leads" }],
  },
  {
    id: "lead",
    label: "Lead / customer fields",
    options: [
      { value: "fullName", label: "Full name" },
      { value: "firstName", label: "First name (combine)" },
      { value: "lastName", label: "Last name (combine)" },
      { value: "email", label: "Email" },
      { value: "cellNumber", label: "Cell / landline" },
      { value: "company", label: "Company" },
      { value: "city", label: "City" },
      { value: "state", label: "State" },
      { value: "zipCode", label: "Zip code" },
      { value: "serviceType", label: "Service type (dish/direct/cable/streams)" },
      { value: "cableName", label: "Cable name" },
      { value: "streamName", label: "Stream name" },
      { value: "breakdown", label: "Breakdown" },
      { value: "notes", label: "Notes" },
      { value: "status", label: "Status → contact / phase / card / progress tags" },
      { value: "tags", label: "Tags → verified / processed / sale_done (+ same parsing)" },
      { value: "leadProcessedRequired", label: "Processing required" },
      { value: "leadPaymentChargeAmount", label: "Charge amount" },
      { value: "verifiedAt", label: "Verified at" },
      { value: "leadAppointmentAt", label: "Appointment datetime" },
      { value: "createdAt", label: "Created at (preserve)" },
    ],
  },
  {
    id: "agent",
    label: "Agent lookup (map to night users)",
    options: [
      { value: "agentId", label: "Agent id (lookup key)" },
      { value: "agentEmail", label: "Agent email (lookup key)" },
      { value: "agentName", label: "Agent name (lookup key)" },
    ],
  },
  {
    id: "extra",
    label: "Other",
    options: [
      { value: "append_notes", label: "Append to notes" },
      { value: "skip", label: "Skip" },
    ],
  },
];

export const IMPORT_TARGET_VALUES = new Set(
  IMPORT_TARGET_GROUPS.flatMap((g) => g.options.map((o) => o.value)),
);

/** Guess a target from a file header name. */
export function guessImportTarget(header) {
  const h = String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const exact = {
    agentid: "agentId",
    agentemail: "agentEmail",
    agentname: "agentName",
    customerphone: "phone",
    phone: "phone",
    customername: "fullName",
    customerfirstname: "firstName",
    customerlastname: "lastName",
    fullname: "fullName",
    firstname: "firstName",
    lastname: "lastName",
    customeremail: "email",
    email: "email",
    customerlandline: "cellNumber",
    cellnumber: "cellNumber",
    customercompany: "company",
    company: "company",
    customercity: "city",
    city: "city",
    customerstate: "state",
    state: "state",
    customerzipcode: "zipCode",
    customerzip: "zipCode",
    zipcode: "zipCode",
    zip: "zipCode",
    breakdown: "breakdown",
    notes: "notes",
    additionalinfo: "append_notes",
    status: "status",
    tags: "tags",
    processingrequired: "leadProcessedRequired",
    charge: "leadPaymentChargeAmount",
    verifiedon: "verifiedAt",
    appointmentdatetime: "leadAppointmentAt",
    createdat: "createdAt",
    carrier: "serviceType",
    saleid: "append_notes",
    spoketo: "append_notes",
    pincode: "skip",
    pincodestatus: "skip",
    ssnname: "skip",
    ssnnumber: "skip",
    ssnnumberstatus: "skip",
    securityquestion: "skip",
    securityanswer: "skip",
    cards: "skip",
    banks: "skip",
    chequeselectronic: "skip",
    chequesmail: "skip",
    paymentemails: "skip",
    paymentlogs: "skip",
    basicpackage: "append_notes",
    basicpackagestatus: "append_notes",
    newpackage: "append_notes",
    nooftv: "append_notes",
    noofreceiver: "append_notes",
    accountholder: "append_notes",
    accountnumber: "append_notes",
    regularbill: "append_notes",
    promotionalbill: "append_notes",
    bundle: "append_notes",
    lastpayment: "append_notes",
    lastpaymentdate: "append_notes",
    balance: "append_notes",
    dueondate: "append_notes",
    services: "append_notes",
    receivers: "append_notes",
    receiversinfo: "append_notes",
    techvisitdate: "append_notes",
    techvisittime: "append_notes",
    usedoldpaymentrefs: "skip",
    customeraddress: "append_notes",
    customercountry: "append_notes",
    customermailingaddress: "append_notes",
    customerstatus: "append_notes",
    customerfeedback: "append_notes",
    customerid: "append_notes",
  };

  if (exact[h]) return exact[h];
  if (h.startsWith("agent")) return "skip";
  return "skip";
}

export function buildDefaultColumnMap(headers) {
  const map = {};
  for (const header of headers) {
    map[header] = guessImportTarget(header);
  }
  return map;
}
