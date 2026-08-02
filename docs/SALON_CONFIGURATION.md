# Configurazione operativa — Gianluca Tadonio

La configurazione è centralizzata in `config/gianluca-tadonio.json`.

## Orari ufficiali

- martedì-venerdì: 09:00-19:30;
- sabato: 08:00-17:30;
- lunedì e domenica: chiuso;
- fuso orario: `Europe/Rome`.

## Prezzi

I 34 prezzi iniziali sono indicativi. Il backend usa sempre la dicitura “prezzo indicativo” e salva prezzo e durata nell'evento Calendar. Per correggere un prezzo basta modificare `priceCents`, eseguire i test e distribuire nuovamente Render.

## Motore degli slot

- legge gli impegni con Google Calendar FreeBusy;
- genera slot ogni 15 minuti;
- applica un anticipo minimo di 60 minuti;
- permette prenotazioni fino a 90 giorni;
- verifica che tutta la durata termini prima della chiusura;
- ricontrolla lo slot immediatamente prima della scrittura;
- usa un ID evento stabile per evitare duplicati sui retry.

## Google Calendar

Il calendario deve appartenere al Google Account del salone ed essere condiviso con il `client_email` del service account con permesso di modifica. Il suo ID va inserito nella variabile Render `CALENDAR_ID`.

Il test di avvio usa `calendars.get`, quindi verifica anche che il service account possa accedere al calendario configurato.

## Vapi

Dopo il deploy del backend, aggiungere le quattro definizioni di `vapi/tool-definitions.json` e integrare `vapi/system-prompt-services.txt`. Il server resta `https://server-vapi-parrucchiere.onrender.com/webhook` con la Custom Credential Bearer già configurata.
