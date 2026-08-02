"use strict";

const rawConfiguration = require("../config/gianluca-tadonio.json");

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function validateConfiguration(configuration) {
  if (!configuration?.salon || !Array.isArray(configuration.services) || configuration.services.length === 0) {
    throw new Error("Configurazione salone priva di servizi.");
  }
  const seen = new Set();
  for (const service of configuration.services) {
    if (!/^[a-z0-9_]+$/.test(service.code) || seen.has(service.code)) {
      throw new Error(`Codice servizio non valido o duplicato: ${service.code}`);
    }
    if (!service.name || !service.category || !Number.isInteger(service.durationMinutes) || service.durationMinutes <= 0 || service.durationMinutes % 15 !== 0 || !Number.isInteger(service.priceCents) || service.priceCents < 0 || !Array.isArray(service.aliases)) {
      throw new Error(`Configurazione servizio non valida: ${service.code}`);
    }
    seen.add(service.code);
  }
}

validateConfiguration(rawConfiguration);
const configuration = Object.freeze(JSON.parse(JSON.stringify(rawConfiguration)));
const services = Object.freeze(configuration.services.map((service) => Object.freeze({...service, aliases: Object.freeze([...service.aliases])})));
const byCode = new Map(services.map((service) => [service.code, service]));
const byLabel = new Map();
for (const service of services) {
  for (const label of [service.code, service.name, ...service.aliases]) {
    const normalized = normalizeText(label);
    if (normalized && !byLabel.has(normalized)) byLabel.set(normalized, service);
  }
}

function resolveService({service, serviceCode} = {}) {
  const direct = String(serviceCode || "").trim();
  if (byCode.has(direct)) return byCode.get(direct);
  for (const candidate of [serviceCode, service]) {
    const normalized = normalizeText(candidate);
    if (byLabel.has(normalized)) return byLabel.get(normalized);
  }
  return null;
}

function listServices(category) {
  const normalized = normalizeText(category);
  return normalized ? services.filter((service) => normalizeText(service.category) === normalized) : [...services];
}

function formatPrice(priceCents) {
  return new Intl.NumberFormat("it-IT", {style: "currency", currency: configuration.salon.currency, minimumFractionDigits: 0, maximumFractionDigits: priceCents % 100 === 0 ? 0 : 2}).format(priceCents / 100);
}

function describeService(service) {
  return `${service.name}, ${service.durationMinutes} minuti, prezzo indicativo circa ${formatPrice(service.priceCents)}`;
}

module.exports = {configuration, describeService, formatPrice, listServices, normalizeText, resolveService, services};
