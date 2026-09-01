/** Snapshot + optional processor refs for CustomerCharge rows (Chargeflow matching). */

function trimField(value, maxLen) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

export function cardLast4FromNumber(cardNumber) {
  const digits = String(cardNumber || "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-4);
}

export function brandFromPaymentMethod(pm) {
  if (!pm) return null;
  const brand = String(pm.brand || pm.cardType || "").trim();
  return brand || null;
}

/** Auto last4 + brand from a decrypted payment method (card only). */
export function snapshotFromPaymentMethod(pm) {
  if (!pm || pm.type !== "card") {
    return { cardLast4: null, cardBrand: null };
  }
  return {
    cardLast4: cardLast4FromNumber(pm.cardNumber),
    cardBrand: brandFromPaymentMethod(pm),
  };
}

/** Optional match fields from charge form body. */
export function parseChargeMatchFields(body) {
  return {
    authCode: trimField(body?.authCode, 64),
    arn: trimField(body?.arn, 128),
    processorTransactionId: trimField(body?.processorTransactionId, 128),
  };
}
