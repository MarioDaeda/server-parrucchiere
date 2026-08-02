"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildVapiRpcParams,
} = require("../src/supabase-ingestion");

const call = {
  customerName: "Mario Test",
  customerPhone: null,
  durationSeconds: 90,
  endedAt: "2026-08-02T14:01:30.000Z",
  externalCallId: "call-123",
  externalEventId: "event-123",
  outcome: "booking_completed",
  processingStatus: "processed",
  requestedService: "Taglio uomo",
  salonId:
    "10000000-0000-4000-8000-000000000001",
  startedAt: "2026-08-02T14:00:00.000Z",
  summary: "Prenotazione completata.",
};

test(
  "costruisce i parametri della RPC v2 con i microdollari",
  () => {
    const params = buildVapiRpcParams({
      ...call,
      costsUsdMicros: {
        chatUsdMicros: 0,
        knowledgeBaseUsdMicros: 0,
        llmUsdMicros: 37000,
        sttUsdMicros: 15000,
        totalUsdMicros: 141300,
        transportUsdMicros: 0,
        ttsUsdMicros: 14600,
        vapiUsdMicros: 74700,
      },
    });

    assert.equal(
      params.p_cost_total_usd_micros,
      141300,
    );
    assert.equal(
      params.p_cost_stt_usd_micros,
      15000,
    );
    assert.equal(
      params.p_cost_llm_usd_micros,
      37000,
    );
    assert.equal(
      params.p_cost_tts_usd_micros,
      14600,
    );
    assert.equal(
      params.p_cost_vapi_usd_micros,
      74700,
    );
    assert.equal(
      params.p_cost_transport_usd_micros,
      0,
    );
    assert.equal(
      params.p_cost_chat_usd_micros,
      0,
    );
    assert.equal(
      params.p_cost_knowledge_base_usd_micros,
      0,
    );
    assert.equal(
      params.p_external_call_id,
      "call-123",
    );
  },
);

test(
  "invia null alla RPC v2 quando Vapi non fornisce i costi",
  () => {
    const params = buildVapiRpcParams(call);

    assert.equal(
      params.p_cost_total_usd_micros,
      null,
    );
    assert.equal(
      params.p_cost_stt_usd_micros,
      null,
    );
    assert.equal(
      params.p_cost_llm_usd_micros,
      null,
    );
    assert.equal(
      params.p_cost_tts_usd_micros,
      null,
    );
    assert.equal(
      params.p_cost_vapi_usd_micros,
      null,
    );
  },
);
