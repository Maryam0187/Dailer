/** Safe summary of a payment method for lead charging (no full PAN/CVV). */

function maskTail(value, keep = 4) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= keep) return digits;
  return `•••• ${digits.slice(-keep)}`;
}

export function serializeChargeablePaymentMethod(row) {
  const type = row.type;
  let summary = "";
  if (type === "card") {
    const brand = row.brand || row.cardType || "Card";
    const num = maskTail(row.cardNumber);
    const exp = row.expDate ? ` exp ${row.expDate}` : "";
    summary = `${brand}${num ? ` ${num}` : ""}${exp}`.trim();
  } else if (type === "e_check") {
    const bank = row.bankName || "E-check";
    const acct = maskTail(row.accountNumber);
    summary = `${bank}${acct ? ` ${acct}` : ""}`.trim();
  } else if (type === "check_mail") {
    const parts = [row.bankName, row.checkNumber ? `#${row.checkNumber}` : null].filter(Boolean);
    summary = parts.join(" · ") || "Check mail";
  } else {
    summary = row.email || row.notes?.slice(0, 60) || "POS";
  }

  return {
    id: row.id,
    customerId: row.customerId,
    type: row.type,
    isDefault: Boolean(row.isDefault),
    nameOnCard: row.nameOnCard || null,
    cardType: row.cardType || null,
    brand: row.brand || null,
    bankName: row.bankName || null,
    email: row.email || null,
    summary,
  };
}
