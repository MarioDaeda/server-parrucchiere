# Ingestione costi Vapi

Il backend legge il costo totale e il breakdown dal report finale Vapi.

## Sorgenti supportate

La normalizzazione controlla, in ordine:

- payload principale;
- `message`;
- `call`.

Per le componenti usa `costBreakdown` e, come fallback, l'array `costs`.

## Conversione

I valori USD decimali sono convertiti in microdollari:

```text
Math.round(costoUsd * 1.000.000)
```

Esempio:

```text
0.1413 USD -> 141300 microdollari
```

I valori negativi, non numerici o assenti diventano `null`. Un report senza
costi resta valido e viene ingerito normalmente.

## Persistenza

Il backend chiama `ingest_vapi_call_v2`, già installata nel database remoto.
La RPC v1 resta disponibile come compatibilità temporanea ma non viene più
usata dal backend dopo il deploy.
