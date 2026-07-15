/** Digits-only helpers and validation for card number, exp date, and CVV. */

export function digitsOnly(value, maxLen = Infinity) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(0, maxLen);
}

/** Format card number as groups of 4: 4532 1234 5678 9010 */
export function formatCardNumberInput(value) {
  const digits = digitsOnly(value, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

/**
 * Infer card brand from IIN/BIN prefixes.
 * Returns a CARD_BRANDS value or "" when not enough digits / unknown.
 */
export function detectCardBrand(raw) {
  const digits = digitsOnly(raw, 19);
  if (!digits) return "";

  if (digits.startsWith("4")) return "Visa";

  if (digits.length >= 2) {
    const two = Number(digits.slice(0, 2));
    if (two === 34 || two === 37) return "Amex";
    if (two >= 51 && two <= 55) return "Mastercard";
    if (two === 65) return "Discover";
  }

  if (digits.length >= 4) {
    const four = Number(digits.slice(0, 4));
    if (four >= 2221 && four <= 2720) return "Mastercard";
    if (four === 6011) return "Discover";
  }

  if (digits.length >= 3) {
    const three = Number(digits.slice(0, 3));
    if (three >= 644 && three <= 649) return "Discover";
  }

  return "";
}

/**
 * Format expiry as MM/YY while typing.
 * Typing 2–9 as the first month digit becomes 02/–09/ (ready for year).
 * 0 or 1 waits for the second month digit. Backspace can remove the slash.
 */
export function formatExpDateInput(value, previous = "") {
  const raw = String(value || "");
  const prev = String(previous || "");
  const digits = digitsOnly(raw, 4);
  const prevDigits = digitsOnly(prev, 4);
  const deleting = raw.length < prev.length || digits.length < prevDigits.length;

  if (!digits) return "";

  if (digits.length === 1) {
    const d = digits[0];
    // 2–9 can only be months 02–09 → pad and jump to year.
    if (d >= "2" && d <= "9") return `0${d}/`;
    return d;
  }

  if (digits.length === 2) {
    // Allow deleting back to "MM" without forcing the slash again.
    if (deleting && !raw.includes("/")) return digits;
    return `${digits}/`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function formatCvvInput(value) {
  return digitsOnly(value, 4);
}

function luhnValid(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * @returns {{ ok: true, digits: string } | { ok: false, error: string }}
 */
export function validateCardNumber(raw) {
  const digits = digitsOnly(raw, 19);
  if (!digits) return { ok: false, error: "Card number is required" };
  if (digits.length < 13 || digits.length > 19) {
    return { ok: false, error: "Card number must be 13–19 digits" };
  }
  if (!luhnValid(digits)) return { ok: false, error: "Card number is invalid" };
  return { ok: true, digits };
}

/**
 * @returns {{ ok: true, expDate: string } | { ok: false, error: string }}
 */
export function validateExpDate(raw) {
  const digits = digitsOnly(raw, 4);
  if (!digits) return { ok: false, error: "Exp date is required" };
  if (digits.length !== 4) return { ok: false, error: "Exp date must be MM/YY" };

  const month = Number(digits.slice(0, 2));
  const year = Number(digits.slice(2, 4));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: "Exp month must be 01–12" };
  }

  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { ok: false, error: "Card is expired" };
  }

  return {
    ok: true,
    expDate: `${String(month).padStart(2, "0")}/${String(year).padStart(2, "0")}`,
  };
}

/**
 * @returns {{ ok: true, cvv: string } | { ok: false, error: string }}
 */
export function validateCvv(raw) {
  const digits = digitsOnly(raw, 4);
  if (!digits) return { ok: false, error: "CVV is required" };
  if (digits.length < 3 || digits.length > 4) {
    return { ok: false, error: "CVV must be 3 or 4 digits" };
  }
  return { ok: true, cvv: digits };
}

/**
 * Validate card fields for create/update. Returns first error or normalized values.
 * @param {{ cardNumber?: string|null, expDate?: string|null, cvv?: string|null }} fields
 * @param {{ requireAll?: boolean }} options
 */
export function validateCardPaymentFields(fields, { requireAll = true } = {}) {
  const hasNumber = fields.cardNumber !== undefined && fields.cardNumber !== null;
  const hasExp = fields.expDate !== undefined && fields.expDate !== null;
  const hasCvv = fields.cvv !== undefined && fields.cvv !== null;

  if (requireAll || hasNumber || String(fields.cardNumber || "").trim()) {
    const numberResult = validateCardNumber(fields.cardNumber);
    if (!numberResult.ok) return numberResult;
  }
  if (requireAll || hasExp || String(fields.expDate || "").trim()) {
    const expResult = validateExpDate(fields.expDate);
    if (!expResult.ok) return expResult;
  }
  if (requireAll || hasCvv || String(fields.cvv || "").trim()) {
    const cvvResult = validateCvv(fields.cvv);
    if (!cvvResult.ok) return cvvResult;
  }

  const out = { ok: true };
  if (hasNumber || requireAll) {
    const numberResult = validateCardNumber(fields.cardNumber);
    if (numberResult.ok) out.cardNumber = numberResult.digits;
  }
  if (hasExp || requireAll) {
    const expResult = validateExpDate(fields.expDate);
    if (expResult.ok) out.expDate = expResult.expDate;
  }
  if (hasCvv || requireAll) {
    const cvvResult = validateCvv(fields.cvv);
    if (cvvResult.ok) out.cvv = cvvResult.cvv;
  }
  return out;
}
