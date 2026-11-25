"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  COUNTRY_USA,
  countriesForAccess,
  normalizeCountry,
  normalizeCountryAccess,
} from "@/lib/countries";

const SESSION_PREFIX = "dialer-country:";

function storageKey(userId) {
  return `${SESSION_PREFIX}${userId || "session"}`;
}

function readStoredCountry(userId) {
  if (typeof window === "undefined") return null;
  try {
    return normalizeCountry(sessionStorage.getItem(storageKey(userId)));
  } catch {
    return null;
  }
}

const CountryContext = createContext(null);

export function CountryProvider({
  userId = null,
  userRole = null,
  countryAccess = "usa",
  children,
}) {
  const access = userRole === "admin" ? "both" : normalizeCountryAccess(countryAccess);
  const allowedCountries = useMemo(() => countriesForAccess(access), [access]);
  const canSwitchCountry = allowedCountries.length > 1;
  const lockedCountry = allowedCountries[0];

  const [country, setCountryState] = useState(lockedCountry);

  useEffect(() => {
    if (!canSwitchCountry) {
      setCountryState(lockedCountry);
      return;
    }
    const stored = readStoredCountry(userId);
    setCountryState(stored && allowedCountries.includes(stored) ? stored : COUNTRY_USA);
  }, [userId, canSwitchCountry, lockedCountry, allowedCountries]);

  const setCountry = useCallback(
    (next) => {
      if (!canSwitchCountry) return;
      const normalized = normalizeCountry(next);
      if (!normalized || !allowedCountries.includes(normalized)) return;
      setCountryState(normalized);
      try {
        sessionStorage.setItem(storageKey(userId), normalized);
      } catch {
        /* ignore private-mode storage failures */
      }
    },
    [allowedCountries, canSwitchCountry, userId],
  );

  useEffect(() => {
    try {
      sessionStorage.setItem("dialer-active-country", country);
    } catch {
      /* ignore private-mode storage failures */
    }
  }, [country]);

  const value = useMemo(
    () => ({
      country,
      countryAccess: access,
      allowedCountries,
      canSwitchCountry,
      setCountry,
    }),
    [country, access, allowedCountries, canSwitchCountry, setCountry],
  );

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
}

export function useCountry() {
  const ctx = useContext(CountryContext);
  if (!ctx) {
    throw new Error("useCountry must be used within CountryProvider");
  }
  return ctx;
}
