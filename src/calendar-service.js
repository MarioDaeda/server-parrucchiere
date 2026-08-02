"use strict";

const crypto = require("node:crypto");
const {google} = require("googleapis");
const {DateTime} = require("luxon");
const {configuration, describeService, formatPrice, listServices, resolveService} = require("./salon-config");
const {SchedulingError, assertDateWithinBookingRange, computeAvailableSlots, getOpeningWindow, isExactSlotAvailable, parseLocalTime} = require("./scheduling");

function createCalendarService({calendarClient, calendarId, googleServiceAccount, now = () => DateTime.now().setZone(configuration.salon.timezone)}) {
  let cachedClient = calendarClient || null;

  function getClient() {
    if (cachedClient) return cachedClient;
    const auth = new google.auth.JWT({
      email: googleServiceAccount.client_email,
      key: googleServiceAccount.private_key.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    cachedClient = google.calendar({version: "v3", auth});
    return cachedClient;
  }

  function requireService(args) {
    const service = resolveService(args);
    if (!service) throw new SchedulingError("Servizio non riconosciuto. Usa listServices o getServiceInfo prima di controllare la disponibilità.");
    return service;
  }

  async function readBusyIntervals(date) {
    assertDateWithinBookingRange(date, now());
    const window = getOpeningWindow(date);
    if (!window) return {busy: [], window: null};
    const response = await getClient().freebusy.query({
      requestBody: {
        items: [{id: calendarId}],
        timeMin: window.open.toUTC().toISO(),
        timeMax: window.close.toUTC().toISO(),
        timeZone: configuration.salon.timezone,
      },
    });
    const calendar = response.data.calendars?.[calendarId];
    if (calendar?.errors?.length) throw new Error("Google Calendar non ha restituito una disponibilità valida.");
    return {busy: calendar?.busy || [], window};
  }

  function speechDate(date) {
    return DateTime.fromISO(date, {zone: configuration.salon.timezone}).setLocale("it").toFormat("cccc d LLLL yyyy");
  }

  function stableEventId({date, name, phone, serviceCode, time}) {
    const source = [configuration.salon.name, date, time, serviceCode, String(name || "").trim().toLowerCase(), String(phone || "").trim()].join("|");
    return `bcq${crypto.createHash("sha256").update(source).digest("hex").slice(0, 40)}`;
  }

  return {
    async listServices({category} = {}) {
      const result = listServices(category);
      return result.length ? result.map((service) => `${service.code}: ${describeService(service)}`).join("\n") : "Nessun servizio trovato per questa categoria.";
    },

    async getServiceInfo(args = {}) {
      const service = requireService(args);
      return `${describeService(service)}. Il prezzo è indicativo e potrà essere confermato dal salone.`;
    },

    async checkAvailability(args = {}) {
      const service = requireService(args);
      const {date, preferredTime} = args;
      if (!date) throw new SchedulingError("Data mancante per il controllo disponibilità.");
      const {busy, window} = await readBusyIntervals(date);
      if (!window) return `Il salone è chiuso ${speechDate(date)}.`;
      if (preferredTime) {
        const available = isExactSlotAvailable({busyIntervals: busy, date, durationMinutes: service.durationMinutes, now: now(), time: preferredTime});
        return available
          ? `${preferredTime} è disponibile per ${service.name}. Durata ${service.durationMinutes} minuti, prezzo indicativo circa ${formatPrice(service.priceCents)}.`
          : `${preferredTime} non è disponibile per ${service.name}. Controlla gli altri orari disponibili.`;
      }
      const slots = computeAvailableSlots({busyIntervals: busy, date, durationMinutes: service.durationMinutes, now: now()}).slice(0, configuration.salon.maximumSuggestedSlots);
      if (!slots.length) return `Non risultano slot disponibili per ${service.name} ${speechDate(date)}.`;
      return `Per ${service.name}, durata ${service.durationMinutes} minuti e prezzo indicativo circa ${formatPrice(service.priceCents)}, ${speechDate(date)} sono disponibili: ${slots.map((slot) => slot.toFormat("HH:mm")).join(", ")}.`;
    },

    async bookAppointment(args = {}) {
      const {date, name, phone, time} = args;
      const service = requireService(args);
      if (!date || !time || !String(name || "").trim()) throw new SchedulingError("Per prenotare servono data, ora e nome del cliente.");
      const {busy, window} = await readBusyIntervals(date);
      if (!window) return "PRENOTAZIONE_NON_CREATA: il salone è chiuso nella data richiesta.";
      if (!isExactSlotAvailable({busyIntervals: busy, date, durationMinutes: service.durationMinutes, now: now(), time})) {
        return "PRENOTAZIONE_NON_CREATA: lo slot non è più disponibile oppure non contiene l'intera durata del servizio.";
      }
      const start = parseLocalTime(date, time);
      const end = start.plus({minutes: service.durationMinutes});
      const eventId = stableEventId({date, name, phone, serviceCode: service.code, time});
      try {
        await getClient().events.insert({
          calendarId,
          sendUpdates: "none",
          requestBody: {
            id: eventId,
            summary: `${service.name} - ${String(name).trim()}`,
            location: configuration.salon.address,
            description: [
              "Prenotazione effettuata tramite BetterCallQ.",
              `Cliente: ${String(name).trim()}`,
              phone ? `Telefono: ${String(phone).trim()}` : null,
              `Servizio: ${service.name}`,
              `Codice servizio: ${service.code}`,
              `Durata: ${service.durationMinutes} minuti`,
              `Prezzo indicativo: circa ${formatPrice(service.priceCents)}`,
              "Il prezzo dovrà essere confermato dal salone."
            ].filter(Boolean).join("\n"),
            start: {dateTime: start.toISO({suppressMilliseconds: true}), timeZone: configuration.salon.timezone},
            end: {dateTime: end.toISO({suppressMilliseconds: true}), timeZone: configuration.salon.timezone},
            extendedProperties: {private: {bettercallq: "true", serviceCode: service.code, serviceDurationMinutes: String(service.durationMinutes), priceCents: String(service.priceCents), priceIndicative: "true"}},
          },
        });
      } catch (error) {
        if (error?.code === 409) return "PRENOTAZIONE_GIA_PRESENTE: l'appuntamento risulta già inserito.";
        throw error;
      }
      return `PRENOTAZIONE_CREATA: ${service.name} per ${String(name).trim()}, ${speechDate(date)} alle ${time}, durata ${service.durationMinutes} minuti, prezzo indicativo circa ${formatPrice(service.priceCents)}.`;
    },

    async testConnection() {
      await getClient().calendars.get({calendarId});
    },
  };
}

module.exports = {createCalendarService};
