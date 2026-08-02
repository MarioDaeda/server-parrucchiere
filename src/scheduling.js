"use strict";

const {DateTime} = require("luxon");
const {configuration} = require("./salon-config");

class SchedulingError extends Error {
  constructor(message) { super(message); this.name = "SchedulingError"; }
}

function parseLocalDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new SchedulingError("La data deve essere nel formato AAAA-MM-GG.");
  const value = DateTime.fromISO(date, {zone: configuration.salon.timezone}).startOf("day");
  if (!value.isValid) throw new SchedulingError("Data non valida.");
  return value;
}

function parseLocalTime(date, time) {
  const match = String(time || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) throw new SchedulingError("L'ora deve essere nel formato HH:MM.");
  return parseLocalDate(date).set({hour: Number(match[1]), minute: Number(match[2]), second: 0, millisecond: 0});
}

function getOpeningWindow(date) {
  const localDate = parseLocalDate(date);
  const hours = configuration.openingHours[String(localDate.weekday)];
  if (!hours) return null;
  return {open: parseLocalTime(date, hours.open), close: parseLocalTime(date, hours.close)};
}

function assertDateWithinBookingRange(date, now) {
  const localDate = parseLocalDate(date);
  const today = now.setZone(configuration.salon.timezone).startOf("day");
  if (localDate < today) throw new SchedulingError("Non è possibile prenotare una data passata.");
  if (localDate > today.plus({days: configuration.salon.maximumAdvanceDays})) throw new SchedulingError(`Le prenotazioni sono disponibili fino a ${configuration.salon.maximumAdvanceDays} giorni in anticipo.`);
}

function normalizeBusy(busy, window) {
  return (busy || []).map((item) => ({start: DateTime.fromISO(item.start).setZone(configuration.salon.timezone), end: DateTime.fromISO(item.end).setZone(configuration.salon.timezone)})).filter((item) => item.start.isValid && item.end.isValid && item.end > window.open && item.start < window.close);
}

function overlaps(start, end, busy) {
  return busy.some((item) => start < item.end && end > item.start);
}

function computeAvailableSlots({busyIntervals, date, durationMinutes, now}) {
  assertDateWithinBookingRange(date, now);
  const window = getOpeningWindow(date);
  if (!window) return [];
  const busy = normalizeBusy(busyIntervals, window);
  const earliest = now.setZone(configuration.salon.timezone).plus({minutes: configuration.salon.minimumLeadMinutes});
  const slots = [];
  for (let start = window.open; start.plus({minutes: durationMinutes}) <= window.close; start = start.plus({minutes: configuration.salon.slotStepMinutes})) {
    const end = start.plus({minutes: durationMinutes});
    if (start >= earliest && !overlaps(start, end, busy)) slots.push(start);
  }
  return slots;
}

function isExactSlotAvailable({busyIntervals, date, durationMinutes, now, time}) {
  assertDateWithinBookingRange(date, now);
  const window = getOpeningWindow(date);
  if (!window) return false;
  const start = parseLocalTime(date, time);
  const end = start.plus({minutes: durationMinutes});
  const earliest = now.setZone(configuration.salon.timezone).plus({minutes: configuration.salon.minimumLeadMinutes});
  if (start < window.open || end > window.close || start < earliest) return false;
  return !overlaps(start, end, normalizeBusy(busyIntervals, window));
}

module.exports = {SchedulingError, assertDateWithinBookingRange, computeAvailableSlots, getOpeningWindow, isExactSlotAvailable, parseLocalDate, parseLocalTime};
