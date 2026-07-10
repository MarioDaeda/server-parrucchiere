const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');

// --- 1. CONTROLLO AMBIENTE ---
const credentialsString = process.env.GOOGLE_SERVICE_ACCOUNT;
const CALENDAR_ID = process.env.CALENDAR_ID;

if (!credentialsString || !CALENDAR_ID) {
    console.error("ERRORE CRITICO: Variabili d'ambiente GOOGLE_SERVICE_ACCOUNT o CALENDAR_ID mancanti.");
    process.exit(1);
}

// --- 2. GENERATORE CLIENT GOOGLE CALENDAR ---
function getCalendarClient() {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    
    // Costruttore a oggetto: elimina gli errori di posizionamento argomenti
    const auth = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    return google.calendar({ version: 'v3', auth });
}

const app = express();
app.use(bodyParser.json());

// --- 3. ENDPOINT WEBHOOK ---
app.post('/webhook', async (req, res) => {
    try {
        const vapiPayload = req.body;

        if (vapiPayload.message && vapiPayload.message.type === 'tool-calls') {
            const toolCall = vapiPayload.message.toolCalls[0];
            const functionName = toolCall.function.name;
            const args = toolCall.function.arguments;

            console.log(`\n--- Esecuzione Tool: ${functionName} ---`);

            // Creazione di un'istanza pulita del client per ogni richiesta
            const calendar = getCalendarClient();

            // TOOL: checkAvailability
            if (functionName === 'checkAvailability') {
                const timeMin = new Date(`${args.date}T09:00:00+02:00`).toISOString();
                const timeMax = new Date(`${args.date}T19:00:00+02:00`).toISOString();

                const response = await calendar.events.list({
                    calendarId: CALENDAR_ID,
                    timeMin: timeMin,
                    timeMax: timeMax,
                    singleEvents: true,
                    orderBy: 'startTime',
                });

                const events = response.data.items;
                const result = events.length === 0 
                    ? "Il salone è libero tutto il giorno." 
                    : `Orari occupati: ${events.map(e => new Date(e.start.dateTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })).join(', ')}.`;
                
                return res.json({ results: [{ toolCallId: toolCall.id, result }] });
            }

            // TOOL: bookAppointment
            if (functionName === 'bookAppointment') {
                const startDateTime = new Date(`${args.date}T${args.time}:00+02:00`);
                const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000);

                await calendar.events.insert({
                    calendarId: CALENDAR_ID,
                    resource: {
                        summary: `${args.service} - ${args.name}`,
                        start: { dateTime: startDateTime.toISOString(), timeZone: 'Europe/Rome' },
                        end: { dateTime: endDateTime.toISOString(), timeZone: 'Europe/Rome' },
                    },
                });

                return res.json({ results: [{ toolCallId: toolCall.id, result: `Appuntamento confermato per ${args.name} il ${args.date} alle ${args.time}.` }] });
            }
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error('Errore API Google:', error.response?.data?.error || error.message);
        res.status(500).json({ error: 'Errore interno' });
    }
});

const PORT = process.env.PORT || 3000;

// --- 4. AVVIO E TEST DIAGNOSTICO ---
app.listen(PORT, () => {
    console.log(`Server attivo su porta ${PORT}`);
    
    // Esecuzione immediata del test diagnostico
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        const authTest = new google.auth.JWT({
            email: credentials.client_email,
            key: credentials.private_key.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/calendar']
        });

        authTest.authorize((err, tokens) => {
            if (err) {
                console.error('\n[!] TEST DIAGNOSTICO FALLITO: Errore di autenticazione:', err.message);
            } else {
                console.log('\n[✔] TEST DIAGNOSTICO SUPERATO: Token ottenuto:', tokens.access_token.substring(0, 25) + '...');
            }
        });
    } catch (e) {
        console.error('\n[!] TEST DIAGNOSTICO BLOCCATO: Impossibile fare il parse del JSON delle credenziali:', e.message);
    }
});