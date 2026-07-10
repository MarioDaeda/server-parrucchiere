const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');

// Configurazione Stateless tramite Variabili d'Ambiente
let credentials;
try {
  // Render passerà l'intero JSON del Service Account come stringa
  credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (error) {
  console.error("Errore nel caricamento delle credenziali GOOGLE_SERVICE_ACCOUNT:", error.message);
}

const CALENDAR_ID = process.env.CALENDAR_ID;

// Configurazione del client JWT (Immune al reset del disco di Render)
const auth = new google.auth.JWT(
  credentials?.client_email,
  null,
  credentials?.private_key ? credentials.private_key.replace(/\\n/g, '\n') : null,
  ['https://www.googleapis.com/auth/calendar']
);
const calendar = google.calendar({ version: 'v3', auth });

const app = express();
app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  try {
    const vapiPayload = req.body;
    
    if (vapiPayload.message.type === 'tool-calls') {
      const toolCall = vapiPayload.message.toolCalls[0];
      const functionName = toolCall.function.name;
      const args = toolCall.function.arguments;

      console.log(`Tool intercettato: ${functionName}`, args);

      // TOOL: checkAvailability
      if (functionName === 'checkAvailability') {
        const requestedDateStr = args.date; // Formato previsto: YYYY-MM-DD
        
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
            results: [{
              toolCallId: toolCall.id,
              result: "Disponibilità totale. Il salone è libero dalle 9:00 alle 19:00."
            }]
          });
        } else {
          let orariOccupati = events.map(e => {
            return new Date(e.start.dateTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
          }).join(', ');
          
          return res.json({
            results: [{
              toolCallId: toolCall.id,
              result: `Orari occupati: ${orariOccupati}. Proponi alternative tra le 9:00 e le 19:00.`
            }]
          });
        }
      }

      // TOOL: bookAppointment
      if (functionName === 'bookAppointment') {
        const { date, time, name, service } = args;

        const startDateTime = new Date(`${date}T${time}:00+02:00`);
        const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000); // Slot standard 30 min

        const event = {
          summary: `${service} - ${name}`,
          description: `Prenotazione automatica Vapi`,
          start: { dateTime: startDateTime.toISOString(), timeZone: 'Europe/Rome' },
          end: { dateTime: endDateTime.toISOString(), timeZone: 'Europe/Rome' },
        };

        await calendar.events.insert({
          calendarId: CALENDAR_ID,
          resource: event,
        });

        return res.json({
          results: [{
            toolCallId: toolCall.id,
            result: `Appuntamento registrato per ${name} il ${date} alle ${time}.`
          }]
        });
      }
    }
    res.status(200).send('OK');
  } catch (error) {
    console.error('Errore esecuzione tool:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server stateless attivo sulla porta ${PORT}`));