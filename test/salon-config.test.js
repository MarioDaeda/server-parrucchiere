"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {configuration, formatPrice, resolveService, services} = require("../src/salon-config");

test("carica il catalogo completo con prezzi indicativi", () => {
  assert.equal(configuration.salon.pricesAreIndicative, true);
  assert.equal(services.length, 34);
  for (const service of services) {
    assert.ok(service.durationMinutes > 0);
    assert.equal(service.durationMinutes % 15, 0);
    assert.ok(service.priceCents >= 0);
  }
});

test("usa gli orari ufficiali Gianluca Tadonio", () => {
  assert.equal(configuration.openingHours["1"], null);
  assert.deepEqual(configuration.openingHours["2"], {open: "09:00", close: "19:30"});
  assert.deepEqual(configuration.openingHours["6"], {open: "08:00", close: "17:30"});
  assert.equal(configuration.openingHours["7"], null);
});

test("risolve codici, nomi e sinonimi", () => {
  assert.equal(resolveService({serviceCode: "taglio_uomo"}).code, "taglio_uomo");
  assert.equal(resolveService({service: "ritocco ricrescita"}).code, "colore_ricrescita");
  assert.equal(resolveService({service: "mèches lunghe"}).code, "meches_lunghi");
});

test("formatta i prezzi in euro", () => {
  assert.match(formatPrice(3000), /30/);
  assert.match(formatPrice(6100), /61/);
});
