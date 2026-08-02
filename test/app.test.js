"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createApplication,
} = require("../src/app");

const SALON_ID =
  "10000000-0000-4000-8000-000000000001";
const SECRET = "test-webhook-secret";

function createDependencies() {
  const calls = {
    calendar: [],
    ingestion: [],
  };

  return {
    calls,
    calendarService: {
      async bookAppointment(args) {
        calls.calendar.push([
          "bookAppointment",
          args,
        ]);
        return "PRENOTAZIONE_CREATA";
      },
      async checkAvailability(args) {
        calls.calendar.push([
          "checkAvailability",
          args,
        ]);
        return "Il salone è libero tutto il giorno.";
      },
    },
    config: {
      salonId: SALON_ID,
      vapiWebhookSecret: SECRET,
    },
    ingestionService: {
      async ingestVapiCall(call) {
        calls.ingestion.push(call);
        return {
          callId:
            "50000000-0000-4000-8000-000000000001",
          duplicateEvent: false,
        };
      },
    },
    logger: {
      error() {},
      info() {},
      warn() {},
    },
  };
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () =>
      resolve(instance),
    );
  });

  try {
    const address = server.address();
    await callback(
      `http://127.0.0.1:${address.port}`,
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) =>
        error ? reject(error) : resolve(),
      );
    });
  }
}

function post(url, body, token = SECRET) {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

test(
  "protegge il webhook con bearer token",
  async () => {
    const dependencies =
      createDependencies();
    const app =
      createApplication(dependencies);

    await withServer(app, async (baseUrl) => {
      const response = await post(
        `${baseUrl}/webhook`,
        {
          message: {
            type: "status-update",
          },
        },
        "token-errato",
      );

      assert.equal(response.status, 401);
    });
  },
);

test(
  "mantiene compatibile la tool call Google Calendar",
  async () => {
    const dependencies =
      createDependencies();
    const app =
      createApplication(dependencies);

    await withServer(app, async (baseUrl) => {
      const response = await post(
        `${baseUrl}/webhook`,
        {
          message: {
            toolCalls: [
              {
                function: {
                  arguments: {
                    date: "2026-08-03",
                  },
                  name: "checkAvailability",
                },
                id: "tool-1",
              },
            ],
            type: "tool-calls",
          },
        },
      );

      assert.equal(response.status, 200);
      const body = await response.json();

      assert.equal(
        body.results[0].toolCallId,
        "tool-1",
      );
      assert.deepEqual(
        dependencies.calls.calendar,
        [
          [
            "checkAvailability",
            {
              date: "2026-08-03",
            },
          ],
        ],
      );
    });
  },
);

test(
  "inoltra il report finale alla RPC Supabase",
  async () => {
    const dependencies =
      createDependencies();
    const app =
      createApplication(dependencies);

    await withServer(app, async (baseUrl) => {
      const response = await post(
        `${baseUrl}/webhook`,
        {
          message: {
            analysis: {
              structuredData: {
                informationProvided: true,
              },
              summary:
                "Il cliente ha chiesto gli orari.",
            },
            artifact: {
              transcript:
                "testo che non deve essere persistito",
            },
            call: {
              customer: {
                number: "+393331234567",
              },
              endedAt:
                "2026-08-02T14:01:00.000Z",
              id: "call-info-1",
              startedAt:
                "2026-08-02T14:00:00.000Z",
            },
            endedReason:
              "customer-ended-call",
            type: "end-of-call-report",
          },
        },
      );

      assert.equal(response.status, 200);
      const body = await response.json();

      assert.equal(body.status, "processed");
      assert.equal(
        dependencies.calls.ingestion.length,
        1,
      );
      assert.equal(
        dependencies.calls.ingestion[0].outcome,
        "information_provided",
      );
      assert.equal(
        Object.hasOwn(
          dependencies.calls.ingestion[0],
          "transcript",
        ),
        false,
      );
    });
  },
);

test(
  "restituisce 502 quando Supabase è temporaneamente indisponibile",
  async () => {
    const dependencies =
      createDependencies();

    dependencies.ingestionService.ingestVapiCall =
      async () => {
        throw new Error("database non disponibile");
      };

    const app =
      createApplication(dependencies);

    await withServer(app, async (baseUrl) => {
      const response = await post(
        `${baseUrl}/webhook`,
        {
          message: {
            call: {
              endedAt:
                "2026-08-02T14:01:00.000Z",
              id: "call-error-1",
              startedAt:
                "2026-08-02T14:00:00.000Z",
            },
            type: "end-of-call-report",
          },
        },
      );

      assert.equal(response.status, 502);
    });
  },
);

test(
  "ignora gli eventi informativi non gestiti",
  async () => {
    const dependencies =
      createDependencies();
    const app =
      createApplication(dependencies);

    await withServer(app, async (baseUrl) => {
      const response = await post(
        `${baseUrl}/webhook`,
        {
          message: {
            status: "in-progress",
            type: "status-update",
          },
        },
      );

      assert.equal(response.status, 200);
      const body = await response.json();

      assert.equal(body.status, "ignored");
    });
  },
);
