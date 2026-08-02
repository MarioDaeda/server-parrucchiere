"use strict";

const express = require("express");

const {
  createBearerAuthenticator,
} = require("./security");
const {
  VapiPayloadError,
  normalizeVapiEndOfCallReport,
} = require("./vapi-normalizer");

function parseToolArguments(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      return parsed && typeof parsed === "object"
        ? parsed
        : {};
    } catch {
      throw new VapiPayloadError(
        "Gli argomenti della tool call non sono JSON validi.",
      );
    }
  }

  return {};
}

function createApplication({
  calendarService,
  config,
  ingestionService,
  logger = console,
}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    express.json({
      limit: "1mb",
    }),
  );

  const authenticateWebhook =
    createBearerAuthenticator(
      config.vapiWebhookSecret,
    );

  app.get("/health", (request, response) =>
    response.status(200).json({
      integrations: {
        calendar: "configured",
        supabase: "configured",
      },
      service: "server-parrucchiere",
      status: "ok",
    }),
  );

  app.post(
    "/webhook",
    authenticateWebhook,
    async (request, response) => {
      const message = request.body?.message;
      const messageType = message?.type;

      if (!messageType) {
        return response.status(400).json({
          error: "Payload Vapi privo di message.type",
        });
      }

      if (messageType === "end-of-call-report") {
        try {
          const normalized =
            normalizeVapiEndOfCallReport(
              request.body,
              {
                salonId: config.salonId,
              },
            );

          const result =
            await ingestionService.ingestVapiCall(
              normalized,
            );

          logger.info(
            "Report Vapi acquisito.",
            {
              callId: normalized.externalCallId,
              duplicateEvent:
                result.duplicateEvent === true,
              eventId: normalized.externalEventId,
            },
          );

          return response.status(200).json({
            callId: result.callId || null,
            duplicateEvent:
              result.duplicateEvent === true,
            status: "processed",
          });
        } catch (error) {
          if (error instanceof VapiPayloadError) {
            logger.warn(
              "Report Vapi non valido.",
              {
                message: error.message,
              },
            );

            return response.status(400).json({
              error: error.message,
            });
          }

          logger.error(
            "Errore durante l'ingestione del report Vapi.",
            {
              message: error.message,
            },
          );

          return response.status(502).json({
            error:
              "Ingestione temporaneamente non disponibile",
          });
        }
      }

      if (messageType !== "tool-calls") {
        return response.status(200).json({
          message:
            "Evento Vapi ricevuto, ma non richiede elaborazione.",
          status: "ignored",
        });
      }

      try {
        const toolCalls = message.toolCalls;

        if (
          !Array.isArray(toolCalls) ||
          toolCalls.length === 0
        ) {
          return response.status(400).json({
            error: "Nessuna tool call ricevuta",
          });
        }

        const toolCall = toolCalls[0];

        if (
          !toolCall?.id ||
          !toolCall.function?.name
        ) {
          return response.status(400).json({
            error: "Tool call non valida",
          });
        }

        const functionName =
          toolCall.function.name;
        const args = parseToolArguments(
          toolCall.function.arguments,
        );

        let result;

        if (functionName === "checkAvailability") {
          result =
            await calendarService.checkAvailability(
              args,
            );
        } else if (
          functionName === "bookAppointment"
        ) {
          result =
            await calendarService.bookAppointment(
              args,
            );
        } else {
          return response.status(400).json({
            results: [
              {
                result: `Tool non riconosciuto: ${functionName}`,
                toolCallId: toolCall.id,
              },
            ],
          });
        }

        return response.status(200).json({
          results: [
            {
              result,
              toolCallId: toolCall.id,
            },
          ],
        });
      } catch (error) {
        const status =
          error instanceof VapiPayloadError
            ? 400
            : 500;

        logger.error(
          "Errore durante la gestione della tool call.",
          {
            message: error.message,
          },
        );

        return response.status(status).json({
          error:
            status === 400
              ? error.message
              : "Errore interno del server",
        });
      }
    },
  );

  app.use((request, response) =>
    response.status(404).json({
      error: "Endpoint non trovato",
    }),
  );

  return app;
}

module.exports = {
  createApplication,
  parseToolArguments,
};
