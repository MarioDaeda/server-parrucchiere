const express = require('express');
const crypto = require('crypto');
const { google } = require('googleapis');

// ======================================================
// 1. CONFIGURAZIONE E CONTROLLO VARIABILI D'AMBIENTE
// ======================================================

const {
    GOOGLE_SERVICE_ACCOUNT,
    CALENDAR_ID,
    VAPI_WEBHOOK_SECRET
} = process.env;

if (!GOOGLE_SERVICE_ACCOUNT || !CALENDAR_ID || !VAPI_WEBHOOK_SECRET) {
    console.error(
        'ERRORE CRITICO: mancano una o più variabili tra ' +
        'GOOGLE_SERVICE_ACCOUNT, CALENDAR_ID e VAPI_WEBHOOK_SECRET.'
    );

    process.exit(1);
}

let googleCredentials;

try {
    googleCredentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT);

    if (
        !googleCredentials.client_email ||
        !googleCredentials.private_key
    ) {
        throw new Error(
            'Le credenziali Google non contengono client_email o private_key.'
        );
    }
} catch (error) {
    console.error(
        'ERRORE CRITICO: GOOGLE_SERVICE_ACCOUNT non contiene un JSON valido:',
        error.message
    );

    process.exit(1);
}

// ======================================================
// 2. CLIENT GOOGLE CALENDAR
// ======================================================

function getCalendarClient() {
    const auth = new google.auth.JWT({
        email: googleCredentials.client_email,
        key: googleCredentials.private_key.replace(/\\n/g, '\n'),
        scopes: [
            'https://www.googleapis.com/auth/calendar'
        ]
    });

    return google.calendar({
        version: 'v3',
        auth
    });
}

// ======================================================
// 3. SERVER EXPRESS
// ======================================================

const app = express();

app.disable('x-powered-by');
app.use(express.json({
    limit: '1mb'
}));

// ======================================================
// 4. AUTENTICAZIONE WEBHOOK VAPI
// ======================================================

function authenticateWebhook(req, res, next) {
    const authorizationHeader = req.get('Authorization');

    if (
        !authorizationHeader ||
        !authorizationHeader.startsWith('Bearer ')
    ) {
        return res.status(401).json({
            error: 'Autenticazione richiesta'
        });
    }

    const receivedToken = authorizationHeader
        .slice('Bearer '.length)
        .trim();

    if (!receivedToken) {
        return res.status(401).json({
            error: 'Credenziali non valide'
        });
    }

    const expectedBuffer = Buffer.from(
        VAPI_WEBHOOK_SECRET,
        'utf8'
    );

    const receivedBuffer = Buffer.from(
        receivedToken,
        'utf8'
    );

    const tokenIsValid =
        expectedBuffer.length === receivedBuffer.length &&
        crypto.timingSafeEqual(
            expectedBuffer,
            receivedBuffer
        );

    if (!tokenIsValid) {
        return res.status(401).json({
            error: 'Credenziali non valide'
        });
    }

    next();
}

// ======================================================
// 5. HEALTH CHECK PUBBLICO
// ======================================================

app.get('/health', (req, res) => {
    return res.status(200).json({
        status: 'ok',
        service: 'server-parrucchiere'
    });
});

// ======================================================
// 6. WEBHOOK VAPI
// ======================================================

app.post(
    '/webhook',
    authenticateWebhook,
    async (req, res) => {
        try {
            const vapiPayload = req.body;

            if (
                !vapiPayload.message ||
                vapiPayload.message.type !== 'tool-calls'
            ) {
                return res.status(200).json({
                    status: 'ignored',
                    message: 'Evento Vapi ricevuto, ma non è una tool call.'
                });
            }

            const toolCalls = vapiPayload.message.toolCalls;

            if (
                !Array.isArray(toolCalls) ||
                toolCalls.length === 0
            ) {
                return res.status(400).json({
                    error: 'Nessuna tool call ricevuta'
                });
            }

            const toolCall = toolCalls[0];

            if (
                !toolCall ||
                !toolCall.id ||
                !toolCall.function ||
                !toolCall.function.name
            ) {
                return res.status(400).json({
                    error: 'Tool call non valida'
                });
            }

            const functionName = toolCall.function.name;
            const args = toolCall.function.arguments || {};

            console.log(
                `\n--- Esecuzione tool: ${functionName} ---`
            );

            const calendar = getCalendarClient();

            // ==================================================
            // TOOL: checkAvailability
            // ==================================================

            if (functionName === 'checkAvailability') {
                const timeMin = new Date(
                    `${args.date}T09:00:00+02:00`
                ).toISOString();

                const timeMax = new Date(
                    `${args.date}T19:00:00+02:00`
                ).toISOString();

                const response = await calendar.events.list({
                    calendarId: CALENDAR_ID,
                    timeMin,
                    timeMax,
                    singleEvents: true,
                    orderBy: 'startTime'
                });

                const events = response.data.items || [];

                const result = events.length === 0
                    ? 'Il salone è libero tutto il giorno.'
                    : `Orari occupati: ${events
                        .filter(event => event.start?.dateTime)
                        .map(event =>
                            new Date(
                                event.start.dateTime
                            ).toLocaleTimeString(
                                'it-IT',
                                {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    timeZone: 'Europe/Rome'
                                }
                            )
                        )
                        .join(', ')}.`;

                return res.status(200).json({
                    results: [
                        {
                            toolCallId: toolCall.id,
                            result
                        }
                    ]
                });
            }

            // ==================================================
            // TOOL: bookAppointment
            // ==================================================

            if (functionName === 'bookAppointment') {
                const startDateTime = new Date(
                    `${args.date}T${args.time}:00+02:00`
                );

                const endDateTime = new Date(
                    startDateTime.getTime() +
                    30 * 60 * 1000
                );

                await calendar.events.insert({
                    calendarId: CALENDAR_ID,
                    resource: {
                        summary: `${args.service} - ${args.name}`,
                        description: 'Prenotazione effettuata tramite Vapi',
                        start: {
                            dateTime: startDateTime.toISOString(),
                            timeZone: 'Europe/Rome'
                        },
                        end: {
                            dateTime: endDateTime.toISOString(),
                            timeZone: 'Europe/Rome'
                        }
                    }
                });

                const result =
                    `Appuntamento confermato per ${args.name} ` +
                    `il ${args.date} alle ${args.time}.`;

                return res.status(200).json({
                    results: [
                        {
                            toolCallId: toolCall.id,
                            result
                        }
                    ]
                });
            }

            return res.status(400).json({
                results: [
                    {
                        toolCallId: toolCall.id,
                        result: `Tool non riconosciuto: ${functionName}`
                    }
                ]
            });
        } catch (error) {
            console.error(
                'Errore durante la gestione del webhook:',
                error.response?.data?.error ||
                error.message
            );

            return res.status(500).json({
                error: 'Errore interno del server'
            });
        }
    }
);

// ======================================================
// 7. GESTIONE ENDPOINT INESISTENTI
// ======================================================

app.use((req, res) => {
    return res.status(404).json({
        error: 'Endpoint non trovato'
    });
});

// ======================================================
// 8. AVVIO DEL SERVER E TEST GOOGLE
// ======================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server attivo sulla porta ${PORT}`);

    try {
        const authTest = new google.auth.JWT({
            email: googleCredentials.client_email,
            key: googleCredentials.private_key.replace(
                /\\n/g,
                '\n'
            ),
            scopes: [
                'https://www.googleapis.com/auth/calendar'
            ]
        });

        authTest.authorize(error => {
            if (error) {
                console.error(
                    '\n[!] TEST DIAGNOSTICO FALLITO:',
                    error.message
                );

                return;
            }

            console.log(
                '\n[✔] TEST DIAGNOSTICO SUPERATO: ' +
                'autenticazione Google Calendar riuscita.'
            );
        });
    } catch (error) {
        console.error(
            '\n[!] TEST DIAGNOSTICO BLOCCATO:',
            error.message
        );
    }
});
