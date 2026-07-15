"use client";

import { WORKFLOW_ICON_CLASS } from "@/lib/leadWorkflow";

const iconClass = (tone) => `h-4 w-4 shrink-0 ${WORKFLOW_ICON_CLASS[tone] || WORKFLOW_ICON_CLASS.zinc}`;

const svgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function WorkflowTickIcon({ tone }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={iconClass(tone)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path
        d="M7 12.5l3.2 3.2L17 8.8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WorkflowPhoneIcon({ tone }) {
  return (
    <svg {...svgProps} className={iconClass(tone)}>
      <path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-1.173 1.566a15.042 15.042 0 01-6.059-6.059l1.566-1.173c.362-.271.527-.733.417-1.173L5.91 4.602A1.125 1.125 0 004.818 3.75H3.375A2.25 2.25 0 001.125 6v2.25z" />
    </svg>
  );
}

function WorkflowCardIcon({ tone }) {
  return (
    <svg {...svgProps} className={iconClass(tone)}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

/** Paper check / cheque for check-by-mail. */
function WorkflowCheckIcon({ tone }) {
  return (
    <svg {...svgProps} className={iconClass(tone)}>
      <rect x="2" y="6" width="20" height="12" rx="1.5" />
      <path d="M5 10h6M5 13h4M14 13h5" />
      <path d="M16.5 8.5h2.5v2" />
    </svg>
  );
}

/** Paper check with an E badge for e-check. */
function WorkflowECheckIcon({ tone }) {
  return (
    <svg {...svgProps} className={iconClass(tone)}>
      <rect x="2" y="6" width="20" height="12" rx="1.5" />
      <path d="M5 10h4M5 13h3" />
      <text
        x="16.5"
        y="14.25"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="8"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        E
      </text>
    </svg>
  );
}

/** Globe / URL icon for POS link. */
function WorkflowGlobeIcon({ tone }) {
  return (
    <svg {...svgProps} className={iconClass(tone)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </svg>
  );
}

const CATEGORY_ICON = {
  progress: WorkflowTickIcon,
  contact: WorkflowPhoneIcon,
  payment: WorkflowCardIcon,
};

const PAYMENT_ICON = {
  card: WorkflowCardIcon,
  check_mail: WorkflowCheckIcon,
  e_check: WorkflowECheckIcon,
  pos_link: WorkflowGlobeIcon,
};

export default function WorkflowSwatch({ category, tone, title, tagKey }) {
  const Icon =
    category === "payment" && tagKey && PAYMENT_ICON[tagKey]
      ? PAYMENT_ICON[tagKey]
      : CATEGORY_ICON[category] || WorkflowTickIcon;
  return (
    <span title={title} className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <Icon tone={tone} />
    </span>
  );
}
