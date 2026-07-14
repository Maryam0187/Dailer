import { PAYMENT_METHOD_TYPES } from "@/server/customers/serializeCustomer";
import {
  digitsOnly as cardDigitsOnly,
  validateCardNumber,
  validateCvv,
  validateExpDate,
} from "@/lib/cardPaymentFormat";

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function digitsOnly(value, maxLen) {
  const digits = cardDigitsOnly(value, maxLen);
  return digits || null;
}

/** Normalize payment method create/update body. */
export function parsePaymentBody(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (body?.type !== undefined || !partial) {
    const type = String(body?.type || "").trim();
    if (!PAYMENT_METHOD_TYPES.includes(type)) {
      errors.push("Invalid payment type");
    } else {
      data.type = type;
    }
  }

  if (body?.notes !== undefined) data.notes = trimField(body.notes, 65535);
  if (body?.isDefault !== undefined) data.isDefault = Boolean(body.isDefault);

  if (body?.nameOnCard !== undefined) data.nameOnCard = trimField(body.nameOnCard, 255);
  if (body?.cardType !== undefined) data.cardType = trimField(body.cardType, 32);
  if (body?.brand !== undefined) data.brand = trimField(body.brand, 32);

  const type = data.type || String(body?.type || "").trim();
  const isCard = type === "card";

  if (isCard) {
    if (body?.cardNumber !== undefined || !partial) {
      const numberResult = validateCardNumber(body?.cardNumber);
      if (!numberResult.ok) errors.push(numberResult.error);
      else data.cardNumber = numberResult.digits;
    }
    if (body?.expDate !== undefined || !partial) {
      const expResult = validateExpDate(body?.expDate);
      if (!expResult.ok) errors.push(expResult.error);
      else data.expDate = expResult.expDate;
    }
    if (body?.cvv !== undefined || !partial) {
      const cvvResult = validateCvv(body?.cvv);
      if (!cvvResult.ok) errors.push(cvvResult.error);
      else data.cvv = cvvResult.cvv;
    }
  } else {
    if (body?.cardNumber !== undefined) data.cardNumber = digitsOnly(body.cardNumber, 19);
    if (body?.expDate !== undefined) data.expDate = trimField(body.expDate, 16);
    if (body?.cvv !== undefined) data.cvv = digitsOnly(body.cvv, 4);
  }

  if (body?.routingNumber !== undefined) data.routingNumber = digitsOnly(body.routingNumber, 17);
  if (body?.accountNumber !== undefined) data.accountNumber = digitsOnly(body.accountNumber, 17);
  if (body?.checkNumber !== undefined) data.checkNumber = trimField(body.checkNumber, 32);
  if (body?.bankName !== undefined) data.bankName = trimField(body.bankName, 128);

  return { data, errors };
}

/** Clear fields that do not apply to the selected payment type. */
export function clearUnusedPaymentFields(type, data) {
  const next = { ...data };
  if (type === "card") {
    next.routingNumber = null;
    next.accountNumber = null;
    next.checkNumber = null;
    next.bankName = null;
  } else if (type === "e_check") {
    next.nameOnCard = null;
    next.cardType = null;
    next.brand = null;
    next.cardNumber = null;
    next.expDate = null;
    next.cvv = null;
  } else if (type === "check_mail") {
    next.nameOnCard = null;
    next.cardType = null;
    next.brand = null;
    next.cardNumber = null;
    next.expDate = null;
    next.cvv = null;
    next.routingNumber = null;
    next.accountNumber = null;
  } else if (type === "pos_link") {
    next.nameOnCard = null;
    next.cardType = null;
    next.brand = null;
    next.cardNumber = null;
    next.expDate = null;
    next.cvv = null;
    next.routingNumber = null;
    next.accountNumber = null;
    next.checkNumber = null;
    next.bankName = null;
  }
  return next;
}
