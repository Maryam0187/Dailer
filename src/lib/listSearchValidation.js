import { digitsOnly, nationalUsDigits } from "@/lib/phoneFormat";

/**
 * Validate list search input for all / phone / name / phone last-4.
 * Empty value is allowed (clears the search filter).
 */
export function validateListSearchQuery(searchBy, rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return { isValid: true, normalized: "", message: "" };
  }

  if (searchBy === "all") {
    if (value.length < 2) {
      return {
        isValid: false,
        normalized: value,
        message: "Enter at least 2 characters",
      };
    }
    if (value.length > 128) {
      return { isValid: false, normalized: value, message: "Search is too long" };
    }
    return { isValid: true, normalized: value, message: "" };
  }

  if (searchBy === "phone") {
    const national = nationalUsDigits(value);
    if (national.length !== 10) {
      return {
        isValid: false,
        normalized: value,
        message: "Enter a valid 10-digit phone number",
      };
    }
    return { isValid: true, normalized: national, message: "" };
  }

  if (searchBy === "last4") {
    const digits = digitsOnly(value);
    if (digits.length !== 4) {
      return {
        isValid: false,
        normalized: value,
        message: "Phone last 4 must be exactly 4 digits",
      };
    }
    return { isValid: true, normalized: digits, message: "" };
  }

  if (searchBy === "name") {
    if (value.length < 2) {
      return {
        isValid: false,
        normalized: value,
        message: "Enter at least 2 characters for name",
      };
    }
    if (value.length > 128) {
      return { isValid: false, normalized: value, message: "Name is too long" };
    }
    if (!/[A-Za-z]/.test(value)) {
      return {
        isValid: false,
        normalized: value,
        message: "Name must include letters",
      };
    }
    return { isValid: true, normalized: value, message: "" };
  }

  return { isValid: true, normalized: value, message: "" };
}
