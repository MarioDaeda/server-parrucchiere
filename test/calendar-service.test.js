"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {DateTime} = require("luxon");
const {createCalendarService} = require("../src/calendar-service");

const CALENDAR_ID = "calendar@example.com";
const NOW = DateTime.fromISO("2026-08-02T18:00:00+02:00", {zone: "Europe/Rome"});

function createFakeCalendar({busy = [], insertError = null} = {}) {
  const calls = {calendars: [], freebusy: [], inserts: []};
  return {
    calls,
    client: {
      calendars: {async get(args) { calls.calendars.push(args); return {data: {id: args.calendarId}}; }},
      events: {async insert(args) { calls.inserts.push(args); if (insertError) throw insertError; return {data: {id: args.requestBody.id}}; }},
      freebusy: {async query(args) { calls.freebusy.push(args); return {data: {calendars: {[CALENDAR_ID]: {busy}}}}; }},
    },
  };
}

function createService(fake, now = NOW) {
  return createCalendarService({calendarClient: fake.client, calendarId: CALENDAR_ID, googleServiceAccount: {client_email: "service@example.com", private_key: "unused"}, now: () => now});
}

test("elenca prezzo e durata del servizio", async () => {
  const result = await createService(createFakeCalendar()).getServiceInfo({serviceCode: "taglio_uomo"});
  assert.match(result, /Taglio uomo/);
  assert.match(result, /45 minuti/);
  assert.match(result, /30/);
  assert.match(result, /indicativo/);
});

test("non offre appuntamenti nei giorni di chiusura", async () => {
  const fake = createFakeCalendar();
  const result = await createService(fake).checkAvailability({date: "2026-08-03", serviceCode: "taglio_uomo"});
  assert.match(result, /chiuso/i);
  assert.equal(fake.calls.freebusy.length, 0);
});

test("calcola slot che contengono tutta la durata", async () => {
  const fake = createFakeCalendar({busy: [{start: "2026-08-04T10:00:00+02:00", end: "2026-08-04T11:00:00+02:00"}]});
  const result = await createService(fake).checkAvailability({date: "2026-08-04", serviceCode: "taglio_uomo"});
  assert.match(result, /09:00/);
  assert.doesNotMatch(result, /09:30/);
  assert.match(result, /11:00/);
});

test("crea un evento con durata e prezzo del servizio", async () => {
  const fake = createFakeCalendar();
  const result = await createService(fake).bookAppointment({date: "2026-08-04", time: "09:00", serviceCode: "taglio_uomo", name: "Mario Rossi", phone: "+393331234567"});
  assert.match(result, /PRENOTAZIONE_CREATA/);
  const event = fake.calls.inserts[0].requestBody;
  assert.equal(event.start.dateTime, "2026-08-04T09:00:00+02:00");
  assert.equal(event.end.dateTime, "2026-08-04T09:45:00+02:00");
  assert.match(event.description, /45 minuti/);
  assert.match(event.description, /indicativo/i);
  assert.equal(event.extendedProperties.private.serviceCode, "taglio_uomo");
});

test("gestisce automaticamente l'ora solare", async () => {
  const fake = createFakeCalendar();
  const winterNow = DateTime.fromISO("2026-11-01T12:00:00+01:00", {zone: "Europe/Rome"});
  await createService(fake, winterNow).bookAppointment({date: "2026-12-01", time: "09:00", serviceCode: "taglio_uomo", name: "Mario Rossi"});
  const event = fake.calls.inserts[0].requestBody;
  assert.equal(event.start.dateTime, "2026-12-01T09:00:00+01:00");
  assert.equal(event.end.dateTime, "2026-12-01T09:45:00+01:00");
});

test("ricontrolla lo slot prima di prenotare", async () => {
  const fake = createFakeCalendar({busy: [{start: "2026-08-04T09:00:00+02:00", end: "2026-08-04T09:30:00+02:00"}]});
  const result = await createService(fake).bookAppointment({date: "2026-08-04", time: "09:00", serviceCode: "taglio_uomo", name: "Mario Rossi"});
  assert.match(result, /PRENOTAZIONE_NON_CREATA/);
  assert.equal(fake.calls.inserts.length, 0);
});

test("tratta il retry come prenotazione già presente", async () => {
  const error = new Error("duplicate");
  error.code = 409;
  const result = await createService(createFakeCalendar({insertError: error})).bookAppointment({date: "2026-08-04", time: "09:00", serviceCode: "taglio_uomo", name: "Mario Rossi"});
  assert.match(result, /PRENOTAZIONE_GIA_PRESENTE/);
});

test("testConnection verifica l'accesso al calendario", async () => {
  const fake = createFakeCalendar();
  await createService(fake).testConnection();
  assert.deepEqual(fake.calls.calendars, [{calendarId: CALENDAR_ID}]);
});
