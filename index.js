"use strict";

const {
  createApplication,
} = require("./src/app");
const {
  createCalendarService,
} = require("./src/calendar-service");
const {
  loadConfig,
} = require("./src/config");
const {
  createSupabaseIngestionService,
} = require("./src/supabase-ingestion");

function startServer() {
  let config;

  try {
    config = loadConfig();
  } catch (error) {
    console.error(
      `ERRORE CRITICO: ${error.message}`,
    );
    process.exit(1);
  }

  const calendarService =
    createCalendarService({
      calendarId: config.calendarId,
      googleServiceAccount:
        config.googleServiceAccount,
    });

  const ingestionService =
    createSupabaseIngestionService({
      secretKey: config.supabaseSecretKey,
      supabaseUrl: config.supabaseUrl,
    });

  const app = createApplication({
    calendarService,
    config,
    ingestionService,
  });

  const server = app.listen(
    config.port,
    () => {
      console.log(
        `Server attivo sulla porta ${config.port}`,
      );

      calendarService
        .testConnection()
        .then(() => {
          console.log(
            "[OK] Autenticazione Google Calendar riuscita.",
          );
        })
        .catch((error) => {
          console.error(
            "[ERRORE] Test Google Calendar fallito:",
            error.message,
          );
        });
    },
  );

  function shutdown(signal) {
    console.log(
      `Ricevuto ${signal}; arresto del server.`,
    );

    server.close((error) => {
      if (error) {
        console.error(
          "Errore durante l'arresto:",
          error.message,
        );
        process.exit(1);
      }

      process.exit(0);
    });
  }

  process.once("SIGTERM", () =>
    shutdown("SIGTERM"),
  );
  process.once("SIGINT", () =>
    shutdown("SIGINT"),
  );
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer,
};
