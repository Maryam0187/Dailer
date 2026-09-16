import coreMod from "./addressBotCore.cjs";
import db from "@/server/db";

const core = coreMod?.ADDRESS_BOT_LABEL ? coreMod : coreMod.default;

export const ADDRESS_BOT_LABEL = core.ADDRESS_BOT_LABEL;

export function getOpenAiApiKey() {
  return core.getOpenAiApiKey();
}

export function getAddressBotVoice() {
  return core.getAddressBotVoice();
}

export async function loadCompanyAddressById(addressId) {
  const id = Number(addressId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.CompanyAddress.findByPk(id, {
    attributes: ["id", "label", "address", "sortOrder"],
  });
}

export function buildAddressBotConnectTwiml({ origin, addressId, callId, addressText }) {
  const token = core.signRelayToken({ addressId, callId });
  const relayUrl = core.buildRelayUrl(origin, { addressId, callId, token });
  const welcomeGreeting = core.buildWelcomeGreeting(addressText);
  return core.buildConversationRelayTwiml({
    relayUrl,
    welcomeGreeting,
    voice: core.getAddressBotVoice(),
  });
}

export const parseCompanyAddressBody = core.parseCompanyAddressBody;
export const serializeCompanyAddress = core.serializeCompanyAddress;
