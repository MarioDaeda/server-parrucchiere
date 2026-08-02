"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  VapiPayloadError,
  normalizeVapiEndOfCallReport,
} = require("../src/vapi-normalizer");

const SALON_ID =
  "10000000-0000-4000-8000-000000000001";

function createPayload() {
  return {
    message: {
      analysis: {
        structuredData: {
          appointmentBooked: true,
          customerName: "Mario Rossi",
          requestedService: "Taglio",
        },
        summary:
          "Il cliente ha prenotato un taglio.",
      },
      artifact: {
        recording: {
          url: "https://example.test/audio.wav",
        },
        transcript: "contenuto sensibile",
      },
      call: {
        customer: {
          number: "+39 333 123 4567",
        },
        endedAt: "2026-08-02T14:01:30.000Z",
        id: "call-123",
        startedAt:
          "2026-08-02T14:00:00.000Z",
      },
      endedReason: "customer-ended-call",
      type: "end-of-call-report",
    },
  };
}

test(
  "normalizza un report finale senza conservare artefatti",
  () => {
    const normalized =
      normalizeVapiEndOfCallReport(
        createPayload(),
        {
          salonId: SALON_ID,
        },
      );

    assert.deepEqual(normalized, {
      customerName: "Mario Rossi",
      customerPhone: "+393331234567",
      durationSeconds: 90,
      endedAt: "2026-08-02T14:01:30.000Z",
      externalCallId: "call-123",
      externalEventId:
        "call-123:end-of-call-report:2026-08-02T14:01:30.000Z",
      outcome: "booking_completed",
      processingStatus: "processed",
      requestedService: "Taglio",
      salonId: SALON_ID,
      startedAt:
        "2026-08-02T14:00:00.000Z",
      summary:
        "Il cliente ha prenotato un taglio.",
    });

    assert.equal(
      Object.hasOwn(normalized, "artifact"),
      false,
    );
    assert.equal(
      Object.hasOwn(normalized, "transcript"),
      false,
    );
    assert.equal(
      Object.hasOwn(normalized, "recordingUrl"),
      false,
    );
  },
);

test(
  "estrae cliente e servizio da arguments JSON di bookAppointment",
  () => {
    const payload = createPayload();
    payload.message.analysis = {
      structuredData: {
        outcome: "incomplete",
      },
    };
    payload.message.call.customer = {};
    payload.message.artifact.messages = [
      {
        toolCall: {
          function: {
            arguments: JSON.stringify({
              date: "2026-08-04",
              name: "Mario Test End To End",
              serviceCode: "taglio_uomo",
              time: "09:30",
            }),
            name: "bookAppointment",
          },
        },
      },
    ];

    const normalized =
      normalizeVapiEndOfCallReport(
        payload,
        {
          salonId: SALON_ID,
        },
      );

    assert.equal(
      normalized.customerName,
      "Mario Test End To End",
    );
    assert.equal(normalized.customerPhone, null);
    assert.equal(normalized.outcome, "booking_completed");
    assert.equal(normalized.requestedService, "Taglio uomo");
    assert.equal(
      normalized.summary,
      "Prenotazione completata per Taglio uomo il 2026-08-04 alle 09:30.",
    );
  },
);

test(
  "supporta arguments già deserializzati in una tool call annidata",
  () => {
    const payload = createPayload();
    payload.message.analysis = {
      structuredData: {},
    };
    payload.message.call.customer = {};
    payload.message.artifact.messages = [
      {
        content: [
          {
            function: {
              arguments: {
                date: "2026-08-05",
                name: "Giulia Verdi",
                phone: "+39 333 222 1100",
                serviceCode: "taglio_uomo",
                time: "10:15",
              },
              name: "bookAppointment",
            },
          },
        ],
      },
    ];

    const normalized =
      normalizeVapiEndOfCallReport(
        payload,
        {
          salonId: SALON_ID,
        },
      );

    assert.equal(normalized.customerName, "Giulia Verdi");
    assert.equal(
      normalized.customerPhone,
      "+393332221100",
    );
    assert.equal(normalized.requestedService, "Taglio uomo");
    assert.equal(normalized.outcome, "booking_completed");
  },
);

test(
  "genera lo stesso event id quando Vapi ritenta il report",
  () => {
    const first =
      normalizeVapiEndOfCallReport(
        createPayload(),
        {
          salonId: SALON_ID,
        },
      );
    const retry =
      normalizeVapiEndOfCallReport(
        createPayload(),
        {
          salonId: SALON_ID,
        },
      );

    assert.equal(
      retry.externalEventId,
      first.externalEventId,
    );
  },
);

test(
  "classifica errori di trasporto come errore tecnico",
  () => {
    const payload = createPayload();
    payload.message.analysis.structuredData = {};
    payload.message.artifact.messages = [];
    payload.message.endedReason =
      "phone-call-provider-closed-websocket";

    const normalized =
      normalizeVapiEndOfCallReport(
        payload,
        {
          salonId: SALON_ID,
        },
      );

    assert.equal(
      normalized.outcome,
      "technical_error",
    );
  },
);

test(
  "rifiuta report senza call id",
  () => {
    const payload = createPayload();
    delete payload.message.call.id;

    assert.throws(
      () =>
        normalizeVapiEndOfCallReport(
          payload,
          {
            salonId: SALON_ID,
          },
        ),
      VapiPayloadError,
    );
  },
);

test(
  "normalizza costo totale e breakdown Vapi in microdollari USD",
  () => {
    const payload = createPayload();
    payload.message.cost = 0.1413;
    payload.message.costBreakdown = {
      chat: 0,
      knowledgeBaseCost: 0,
      llm: 0.037,
      stt: 0.015,
      total: 0.1413,
      transport: 0,
      tts: 0.0146,
      vapi: 0.0747,
    };
    payload.message.costs = [
      {
        cost: 0.015049206666666665,
        type: "transcriber",
      },
      {
        cost: 0.0369677,
        type: "model",
      },
      {
        cost: 0.01461,
        type: "voice",
      },
      {
        cost: 0.074675,
        type: "vapi",
      },
      {
        cost: 0,
        type: "knowledge-base",
      },
    ];

    const normalized =
      normalizeVapiEndOfCallReport(
        payload,
        {
          salonId: SALON_ID,
        },
      );

    assert.deepEqual(
      normalized.costsUsdMicros,
      {
        chatUsdMicros: 0,
        knowledgeBaseUsdMicros: 0,
        llmUsdMicros: 37000,
        sttUsdMicros: 15000,
        totalUsdMicros: 141300,
        transportUsdMicros: 0,
        ttsUsdMicros: 14600,
        vapiUsdMicros: 74700,
      },
    );
  },
);

test(
  "usa l'array costs quando costBreakdown non è presente",
  () => {
    const payload = createPayload();
    payload.message.costs = [
      {
        cost: 0.015049206666666665,
        type: "transcriber",
      },
      {
        cost: 0.0369677,
        type: "model",
      },
      {
        cost: 0.01461,
        type: "voice",
      },
      {
        cost: 0.074675,
        type: "vapi",
      },
    ];

    const normalized =
      normalizeVapiEndOfCallReport(
        payload,
        {
          salonId: SALON_ID,
        },
      );

    assert.deepEqual(
      normalized.costsUsdMicros,
      {
        chatUsdMicros: null,
        knowledgeBaseUsdMicros: null,
        llmUsdMicros: 36968,
        sttUsdMicros: 15049,
        totalUsdMicros: 141302,
        transportUsdMicros: null,
        ttsUsdMicros: 14610,
        vapiUsdMicros: 74675,
      },
    );
  },
);

test(
  "ignora costi negativi o non numerici senza bloccare il report",
  () => {
    const payload = createPayload();
    payload.message.cost = -1;
    payload.message.costBreakdown = {
      llm: "non disponibile",
    };

    const normalized =
      normalizeVapiEndOfCallReport(
        payload,
        {
          salonId: SALON_ID,
        },
      );

    assert.equal(
      Object.hasOwn(
        normalized,
        "costsUsdMicros",
      ),
      false,
    );
  },
);
