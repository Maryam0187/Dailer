"use client";

import { COUNTRY_CANADA, COUNTRY_USA } from "@/lib/countries";
import { useCountry } from "@/contexts/CountryContext";

const OPTIONS = [
  { value: COUNTRY_USA, label: "USA" },
  { value: COUNTRY_CANADA, label: "Canada" },
];

export default function NavbarCountrySwitch() {
  const { country, canSwitchCountry, setCountry } = useCountry();
  if (!canSwitchCountry) return null;

  return (
    <div
      role="group"
      aria-label="Country"
      className="inline-flex shrink-0 rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-600 dark:bg-zinc-900"
    >
      {OPTIONS.map((option) => {
        const selected = country === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => setCountry(option.value)}
            className={`rounded-md px-2 py-1 text-xs font-semibold sm:px-2.5 sm:text-sm ${
              selected
                ? option.value === COUNTRY_CANADA
                  ? "bg-red-600 text-white"
                  : "bg-sky-600 text-white"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
