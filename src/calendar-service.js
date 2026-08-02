"use strict";

const { google } = require("googleapis");

function createCalendarService({
  calendarId,
  googleServiceAccount,
}) {
  function getClient() {
    const auth = new google.auth.JWT({
      email: googleServiceAccount.client_email,
      key: googleServiceAccount.private_key.replace(
        /\\n/g,
        "\n",
      ),
      scopes: [
        "https://www.googleapis.com/auth/calendar",
      ],
    });

    return google.calendar({
      version: "v3",
      auth,
    });
  }

  return {
    async bookAppointment({
      date,
      name,
      service,
      time,
    }) {
      const startDateTime = new Date(
        `${date}T${time}:00+02:00`,
      );

      if (Number.isNaN(startDateTime.getTime())) {
        throw new Error(
          "Data o ora della prenotazione non valida.",
        );
      }

      const endDateTime = new Date(
        startDateTime.getTime() + 30 * 60 * 1000,
      );

      await getClient().events.insert({
        calendarId,
        resource: {
          summary: `${service} - ${name}`,
          description:
            "Prenotazione effettuata tramite Vapi",
          start: {
            dateTime: startDateTime.toISOString(),
            timeZone: "Europe/Rome",
          },
          end: {
            dateTime: endDateTime.toISOString(),
            timeZone: "Europe/Rome",
          },
        },
      });

      return "PRENOTAZIONE_CREATA";
    },

    async checkAvailability({ date }) {
      const timeMin = new Date(
        `${date}T09:00:00+02:00`,
      );
      const timeMax = new Date(
        `${date}T19:00:00+02:00`,
      );

      if (
        Number.isNaN(timeMin.getTime()) ||
        Number.isNaN(timeMax.getTime())
      ) {
        throw new Error(
          "Data richiesta per la disponibilità non valida.",
        );
      }

      const result = await getClient().events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = result.data.items || [];

      if (events.length === 0) {
        return "Il salone è libero tutto il giorno.";
      }

      const occupiedTimes = events
        .filter((event) => event.start?.dateTime)
        .map((event) =>
          new Date(event.start.dateTime).toLocaleTimeString(
            "it-IT",
            {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Rome",
            },
          ),
        );

      return `Orari occupati: ${occupiedTimes.join(", ")}.`;
    },

    async testConnection() {
      const auth = new google.auth.JWT({
        email: googleServiceAccount.client_email,
        key: googleServiceAccount.private_key.replace(
          /\\n/g,
          "\n",
        ),
        scopes: [
          "https://www.googleapis.com/auth/calendar",
        ],
      });

      await auth.authorize();
    },
  };
}

module.exports = {
  createCalendarService,
};
