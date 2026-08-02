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
