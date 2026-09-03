"use client";

import { startOutgoingCallLine2 } from "@/lib/startOutgoingCallLine2";
import { useDialerCapabilities } from "@/contexts/DialerCapabilitiesContext";
import { useLine2Call } from "@/contexts/Line2CallContext";
import { useTwilioVoiceLine2 } from "@/contexts/TwilioVoiceLine2Context";
import { useTwilioVoice } from "@/contexts/TwilioVoiceContext";

export function usePlaceLine2Call() {
  const { canUseDialer2 } = useDialerCapabilities();
  const { session, beginSession } = useLine2Call();
  const { isPrimaryTab } = useTwilioVoice();
  const {
    ensureRegistered,
    registered,
    sdkInitializing,
    expectOutgoingIncomingLeg,
    enabled,
  } = useTwilioVoiceLine2();

  const canStartLine2 =
    Boolean(canUseDialer2 && enabled) &&
    isPrimaryTab !== false &&
    registered &&
    !sdkInitializing &&
    !session;

  async function placeLine2Call({
    leadId,
    toNumber,
    phoneLabel,
    customerName,
    callKind,
    extra = {},
  } = {}) {
    if (!canUseDialer2) throw new Error("Second dialer is not enabled for this account");
    if (session) throw new Error("Line 2 is already on a call");
    expectOutgoingIncomingLeg(45000);
    if (!registered || sdkInitializing) await ensureRegistered();
    const result =
      Number.isInteger(leadId) && leadId > 0
        ? await startOutgoingCallLine2({ leadId })
        : await startOutgoingCallLine2({ toNumber });
    if (!result.ok) throw new Error(result.error);
    beginSession({
      callId: result.call.id,
      callOwnedByMe: true,
      callMode: result.callMode || "direct",
      callKind: callKind || (result.lead ? "lead" : null),
      dialMode: "agent_first",
      dialerIndex: 2,
      toNumber: result.call.toNumber,
      phoneLabel: phoneLabel || result.call.toNumber,
      customerName,
      leadId: result.lead?.id || leadId || undefined,
      ...extra,
    });
    return result;
  }

  return { placeLine2Call, canStartLine2, line2Session: session, canUseDialer2 };
}
