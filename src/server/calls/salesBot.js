const core = require("./salesBotCore.cjs");
const sessions = require("./salesBotSessions.cjs");
const turn = require("./salesBotTurn.cjs");

export const SALES_BOT_LABEL = core.SALES_BOT_LABEL;

export function getOpenAiApiKey() {
  return core.getOpenAiApiKey();
}

export function getSalesBotVoice() {
  return core.getSalesBotVoice();
}

export function buildSalesBotConnectTwiml({ origin, callId }) {
  const token = core.signRelayToken({ callId });
  const relayUrl = core.buildRelayUrl(origin, { callId, token });
  return core.buildConversationRelayTwiml({
    relayUrl,
    voice: core.getSalesBotVoice(),
  });
}

export function waitForSalesBotSession(callId, timeoutMs) {
  return sessions.waitForSalesBotSession(callId, timeoutMs);
}

export function beginSalesBotSpeech(opts) {
  return sessions.beginSalesBotSpeech(opts);
}

export const MAX_TRAIN_AUDIO_BYTES = core.MAX_TRAIN_AUDIO_BYTES;
export const isAllowedTrainAudioType = core.isAllowedTrainAudioType;
export const transcribeCustomerAudio = core.transcribeCustomerAudio;
export const synthesizeSpeech = core.synthesizeSpeech;
export const startSalesBotTurn = turn.startSalesBotTurn;
export const continueSalesBotTurn = turn.continueSalesBotTurn;
