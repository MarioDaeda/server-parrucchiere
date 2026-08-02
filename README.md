# server-parrucchiere

Backend Express della receptionist BetterCallQ.

## Responsabilità

- autenticare le richieste webhook di Vapi;
- eseguire le tool call Google Calendar;
- ricevere `end-of-call-report`;
- normalizzare soltanto i metadati necessari;
- invocare la RPC Supabase `ingest_vapi_call`;
- non persistere transcript, messaggi o registrazioni.

## Endpoint

### `GET /health`

Health check pubblico senza dati sensibili.

### `POST /webhook`

Richiede:

```http
Authorization: Bearer <VAPI_WEBHOOK_SECRET>
```

Eventi gestiti:

- `tool-calls`;
- `end-of-call-report`.

Gli altri eventi Vapi vengono confermati con `status: ignored`.

## Variabili d'ambiente

- `GOOGLE_SERVICE_ACCOUNT`
- `CALENDAR_ID`
- `VAPI_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `BETTERCALLQ_SALON_ID`
- `PORT` facoltativa

`SUPABASE_SECRET_KEY` deve rimanere esclusivamente su Render. Non deve
essere aggiunta alla dashboard, al browser o al repository.

## Sviluppo

```bash
npm install
npm test
npm run check
npm start
```

## Flusso di ingestione

```text
Vapi end-of-call-report
        ↓
server-parrucchiere
        ↓
normalizeVapiEndOfCallReport
        ↓
RPC ingest_vapi_call
        ↓
Supabase
        ↓
dashboard BetterCallQ
```

L'ID evento è derivato dalla chiamata e dall'orario di conclusione. I retry
dello stesso report producono quindi lo stesso ID e vengono deduplicati dal
database.
