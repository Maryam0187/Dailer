import db from "@/server/db";

const core = require("./addressBotCore.cjs");
const sessions = require("./addressBotSessions.cjs");
const turn = require("./addressBotTurn.cjs");

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

export function buildAddressBotConnectTwiml({ origin, callId }) {
  const token = core.signRelayToken({ addressId: 0, callId });
  const relayUrl = core.buildRelayUrl(origin, { addressId: 0, callId, token });
  return core.buildConversationRelayTwiml({
    relayUrl,
    voice: core.getAddressBotVoice(),
  });
}

export function beginAddressBotSpeech(opts) {
  return sessions.beginAddressBotSpeech(opts);
}

export function waitForAddressBotSession(callId, timeoutMs) {
  return sessions.waitForAddressBotSession(callId, timeoutMs);
}

export const parseCompanyAddressBody = core.parseCompanyAddressBody;
export const serializeCompanyAddress = core.serializeCompanyAddress;

export const MAX_TRAIN_AUDIO_BYTES = core.MAX_TRAIN_AUDIO_BYTES;
export const isAllowedTrainAudioType = core.isAllowedTrainAudioType;
export const transcribeCustomerAudio = core.transcribeCustomerAudio;
export const synthesizeSpeech = core.synthesizeSpeech;
export const startAddressBotTurn = turn.startAddressBotTurn;
export const continueAddressBotTurn = turn.continueAddressBotTurn;
