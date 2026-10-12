function toCents(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

function fromCents(cents) {
  return (cents / 100).toFixed(2);
}

/**
 * Totals from per-call Twilio Call resources (legacy).
 */
export function calculateTotals(calls, fixedMarkupPerCall) {
  const markupCents = toCents(fixedMarkupPerCall);
  let baseTotalCents = 0;
  let markupTotalCents = 0;

  const lines = calls.map((call) => {
    const twilioCost = Math.abs(Number(call.price || 0));
    const twilioCostCents = toCents(twilioCost);
    const lineTotalCents = twilioCostCents + markupCents;
    baseTotalCents += twilioCostCents;
    markupTotalCents += markupCents;

    return {
      twilioSid: call.sid,
      toNumber: call.to || null,
      fromNumber: call.from || null,
      durationSeconds: call.duration ? Number(call.duration) : null,
      twilioCost: fromCents(twilioCostCents),
      markupApplied: fromCents(markupCents),
      lineAmount: fromCents(lineTotalCents),
    };
  });

  const totalAmountCents = baseTotalCents + markupTotalCents;

  return {
    lines,
    totalCalls: lines.length,
    twilioBaseAmount: fromCents(baseTotalCents),
    markupAmount: fromCents(markupTotalCents),
    totalAmount: fromCents(totalAmountCents),
  };
}

/**
 * Totals from Twilio Usage Records categories (Voice, Client, Recording, Phone Numbers).
 * Markup is applied per voice+client call count (Programmable Voice + Client).
 * @param {Array<{ category: string, label?: string, price: string|number, count?: number, usage?: number, usageUnit?: string|null }>} categories
 * @param {number|string} fixedMarkupPerCall
 */
export function calculateUsageTotals(categories, fixedMarkupPerCall) {
  const markupCents = toCents(fixedMarkupPerCall);
  let baseTotalCents = 0;
  let callCount = 0;

  const categoryLines = (categories || []).map((row) => {
    const priceCents = toCents(Math.abs(Number(row.price || 0)));
    baseTotalCents += priceCents;
    if (row.category === "calls" || row.category === "calls-client") {
      const c = Number(row.count);
      if (Number.isFinite(c) && c > 0) callCount += c;
    }
    return {
      category: row.category,
      label: row.label || row.category,
      count: Number.isFinite(Number(row.count)) ? Number(row.count) : 0,
      usage: Number.isFinite(Number(row.usage)) ? Number(row.usage) : 0,
      usageUnit: row.usageUnit || null,
      twilioCost: fromCents(priceCents),
    };
  });

  const markupTotalCents = callCount * markupCents;
  const totalAmountCents = baseTotalCents + markupTotalCents;

  return {
    categories: categoryLines,
    totalCalls: callCount,
    twilioBaseAmount: fromCents(baseTotalCents),
    markupAmount: fromCents(markupTotalCents),
    totalAmount: fromCents(totalAmountCents),
  };
}
