function toCents(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

function fromCents(cents) {
  return (cents / 100).toFixed(2);
}

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
