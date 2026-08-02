"use strict";

const ALLOWED_OUTCOMES = new Set([
  "booking_completed",
  "information_provided",
  "change_or_cancellation",
  "transferred",
  "incomplete",
  "technical_error",
  "abandoned",
]);

class VapiPayloadError extends Error {
  constructor(message) {
    super(message);
    this.name = "VapiPayloadError";
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maxLength);
}

function normalizePhone(value) {
  const candidate = cleanText(value, 32);

  if (!candidate) {
    return null;
  }

  const compact = candidate.replace(/[\s().-]/g, "");

  return /^\+[1-9]\d{7,14}$/.test(compact)
    ? compact
    : null;
}

function parseDate(value) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function firstDefined(...values) {
  return values.find(
    (value) => value !== undefined && value !== null,
  );
}

function numericDuration(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return Math.round(number);
}

function deriveDurationSeconds({
  call,
  endedAt,
  message,
  startedAt,
}) {
  if (startedAt && endedAt) {
    return Math.max(
      0,
      Math.round(
        (new Date(endedAt).getTime() -
          new Date(startedAt).getTime()) /
          1000,
      ),
    );
  }

  return numericDuration(
    firstDefined(
      message.durationSeconds,
      call.durationSeconds,
      message.duration,
      call.duration,
    ),
  );
}

function flattenStrings(value, output = [], depth = 0) {
  if (depth > 5 || output.length > 250) {
    return output;
  }

  if (typeof value === "string") {
    output.push(value);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      flattenStrings(item, output, depth + 1);
    }

    return output;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      flattenStrings(item, output, depth + 1);
    }
  }

  return output;
}

function includesAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

function resolveOutcome({
  call,
  endedReason,
  message,
  structuredData,
}) {
  const explicitOutcome = cleanText(
    structuredData.outcome,
    64,
  );

  if (
    explicitOutcome &&
    ALLOWED_OUTCOMES.has(explicitOutcome)
  ) {
    return explicitOutcome;
  }

  const structuredText = JSON.stringify(
    structuredData,
  ).toLowerCase();
  const artifactText = flattenStrings([
    message.artifact?.messages,
    call.messages,
  ])
    .join(" ")
    .toLowerCase();

  if (
    structuredData.bookingCompleted === true ||
    structuredData.appointmentBooked === true ||
    structuredData.prenotazioneCreata === true ||
    includesAny(
      `${structuredText} ${artifactText}`,
      [
        "prenotazione_creata",
        "booking_completed",
        "bookappointment",
      ],
    )
  ) {
    return "booking_completed";
  }

  const intent = cleanText(
    firstDefined(
      structuredData.intent,
      structuredData.requestType,
      structuredData.esito,
    ),
    120,
  )?.toLowerCase();

  if (
    intent &&
    includesAny(intent, [
      "cancel",
      "cancell",
      "change",
      "modific",
      "spost",
    ])
  ) {
    return "change_or_cancellation";
  }

  if (
    structuredData.informationProvided === true ||
    structuredData.infoProvided === true
  ) {
    return "information_provided";
  }

  const normalizedReason = (
    endedReason || ""
  ).toLowerCase();

  if (
    includesAny(normalizedReason, [
      "transfer",
      "forward",
    ])
  ) {
    return "transferred";
  }

  if (
    includesAny(normalizedReason, [
      "error",
      "failed",
      "failure",
      "worker-died",
      "provider-closed",
      "transport-never-connected",
      "shutdown",
    ])
  ) {
    return "technical_error";
  }

  if (
    includesAny(normalizedReason, [
      "did-not-answer",
      "busy",
      "no-answer",
      "voicemail",
      "rejected",
      "declined",
    ])
  ) {
    return "abandoned";
  }

  return "incomplete";
}

function normalizeVapiEndOfCallReport(
  payload,
  { salonId },
) {
  const root = asObject(payload);
  const message = asObject(root.message);

  if (message.type !== "end-of-call-report") {
    throw new VapiPayloadError(
      "Il payload non è un end-of-call-report.",
    );
  }

  const call = asObject(message.call);

  const externalCallId = cleanText(call.id, 240);

  if (!externalCallId) {
    throw new VapiPayloadError(
      "Il report Vapi non contiene call.id.",
    );
  }

  let startedAt = parseDate(
    firstDefined(call.startedAt, message.startedAt),
  );
  let endedAt = parseDate(
    firstDefined(call.endedAt, message.endedAt),
  );

  const preliminaryDuration = numericDuration(
    firstDefined(
      message.durationSeconds,
      call.durationSeconds,
      message.duration,
      call.duration,
    ),
  );

  if (!startedAt && endedAt && preliminaryDuration !== null) {
    startedAt = new Date(
      new Date(endedAt).getTime() -
        preliminaryDuration * 1000,
    ).toISOString();
  }

  if (!endedAt && startedAt && preliminaryDuration !== null) {
    endedAt = new Date(
      new Date(startedAt).getTime() +
        preliminaryDuration * 1000,
    ).toISOString();
  }

  if (!startedAt) {
    throw new VapiPayloadError(
      "Il report Vapi non contiene un orario di inizio valido.",
    );
  }

  const analysis = asObject(
    firstDefined(message.analysis, call.analysis),
  );
  const structuredData = asObject(
    analysis.structuredData,
  );
  const customer = asObject(call.customer);
  const endedReason = cleanText(
    firstDefined(message.endedReason, call.endedReason),
    240,
  );

  const customerPhone = normalizePhone(
    firstDefined(
      customer.number,
      customer.phoneNumber,
      message.customer?.number,
      call.phoneCallProviderDetails?.from,
    ),
  );

  const customerName = cleanText(
    firstDefined(
      structuredData.customerName,
      structuredData.fullName,
      structuredData.name,
      customer.name,
    ),
    160,
  );

  const requestedService = cleanText(
    firstDefined(
      structuredData.requestedService,
      structuredData.service,
      structuredData.serviceName,
      structuredData.servizio,
    ),
    240,
  );

  const summary = cleanText(
    firstDefined(
      analysis.summary,
      structuredData.summary,
      structuredData.riepilogo,
    ),
    2000,
  );

  const eventSuffix =
    endedAt ||
    parseDate(call.updatedAt) ||
    "final";

  const externalEventId = cleanText(
    firstDefined(
      message.id,
      message.eventId,
      `${externalCallId}:end-of-call-report:${eventSuffix}`,
    ),
    240,
  );

  return {
    customerName,
    customerPhone,
    durationSeconds: deriveDurationSeconds({
      call,
      endedAt,
      message,
      startedAt,
    }),
    endedAt,
    externalCallId,
    externalEventId,
    outcome: resolveOutcome({
      call,
      endedReason,
      message,
      structuredData,
    }),
    processingStatus: "processed",
    requestedService,
    salonId,
    startedAt,
    summary,
  };
}

module.exports = {
  VapiPayloadError,
  normalizeVapiEndOfCallReport,
};
