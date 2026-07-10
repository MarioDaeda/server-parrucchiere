const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');

// --- 1. DEBUG & LOAD CREDENTIALS ---
const credentialsString = process.env.GOOGLE_SERVICE_ACCOUNT;
if (!credentialsString) {
    throw new Error("CRITICO: Variabile GOOGLE_SERVICE_ACCOUNT non trovata!");
}

let credentials;
try {
    credentials = JSON.parse(credentialsString);
    console.log("Credenziali caricate correttamente per:", credentials.client_email);
} catch (error) {
    throw new Error("CRITICO: JSON non valido in GOOGLE_SERVICE_ACCOUNT: " + error.message);
}

const CALENDAR_ID = process.env.CALENDAR_ID;

// --- 2. AUTH SETUP ---
const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key.replace(/\\n/g, '\n'), // Correzione fondamentale per le newline
    ['https://www.googleapis.com/auth/calendar']
);
const calendar = google.calendar({ version: 'v3', auth });

const app = express();
app.use(bodyParser.json());

// --- 3. WEBHOOK ENDPOINT ---
app.post('/webhook', async (req, res) => {
    try {
        const vapiPayload = req.body;

        if (vapiPayload.message && vapiPayload.message.type === 'tool-calls') {
            const toolCall = vapiPayload.message.toolCalls[0];
            const functionName = toolCall.function.name;
            const args = toolCall.function.arguments;

            console.log(`Tool intercettato: ${functionName}`, args);

            // TOOL: checkAvailability
            if (functionName === 'checkAvailability') {
                const requestedDateStr = args.date; // Formato atteso: YYYY-MM-DD
                
                const timeMin = new Date(`${requestedDateStr}T09:00:00+02:00`).toISOString();
                const timeMax = new Date(`${requestedDateStr}T19:00:00+02:00`).toISOString();

                const response = await calendar.events.list({
                    calendarId: CALENDAR_ID,
                    timeMin: timeMin,
                    timeMax: timeMax,
                    singleEvents: true,
                    orderBy: 'startTime',
                });

                const events = response.data.items;

                if (events.length === 0) {
                    return res.json({
                        results: [{ toolCallId: toolCall.id, result: "Il salone è libero tutto il giorno." }]
                    });
                } else {
                    let orariOccupati = events.map(e => new Date(e.start.dateTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })).join(', ');
                    return res.json({
                        results: [{ toolCallId: toolCall.id, result: `Orari occupati: ${orariOccupati}.` }]
                    });
                }
            }

            // TOOL: bookAppointment
            if (functionName === 'bookAppointment') {
                const { date, time, name, service } = args;

                const startDateTime = new Date(`${date}T${time}:00+02:00`);
                const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000); // 30 min default

                const event = {
                    summary: `${service} - ${name}`,
                    description: `Prenotato da Vapi`,
                    start: { dateTime: startDateTime.toISOString(), timeZone: 'Europe/Rome' },
                    end: { dateTime: endDateTime.toISOString(), timeZone: 'Europe/Rome' },
                };

                await calendar.events.insert({
                    calendarId: CALENDAR_ID,
                    resource: event,
                });

                return res.json({
                    results: [{ toolCallId: toolCall.id, result: `Appuntamento confermato per ${name} il ${date} alle ${time}.` }]
                });
            }
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error('Errore esecuzione tool:', error);
        res.status(500).json({ error: 'Internal Server Error: ' + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server stateless attivo sulla porta ${PORT}`));