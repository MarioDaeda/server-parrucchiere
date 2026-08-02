"use strict";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireString(environment, name) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`Variabile d'ambiente mancante: ${name}`);
  }

  return value;
}

function parseGoogleCredentials(rawValue) {
  let credentials;

  try {
    credentials = JSON.parse(rawValue);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT non contiene un JSON valido.",
    );
  }

  if (
    typeof credentials.client_email !== "string" ||
    typeof credentials.private_key !== "string"
  ) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT non contiene client_email o private_key.",
    );
  }

  return credentials;
}

function loadConfig(environment = process.env) {
  const supabaseUrl = requireString(
    environment,
    "SUPABASE_URL",
  );
  const salonId = requireString(
    environment,
    "BETTERCALLQ_SALON_ID",
  );

  let parsedSupabaseUrl;

  try {
    parsedSupabaseUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("SUPABASE_URL non è un URL valido.");
  }

  if (
    parsedSupabaseUrl.protocol !== "https:" ||
    !parsedSupabaseUrl.hostname.endsWith(".supabase.co")
  ) {
    throw new Error(
      "SUPABASE_URL deve essere un URL HTTPS di Supabase.",
    );
  }

  if (!UUID_PATTERN.test(salonId)) {
    throw new Error(
      "BETTERCALLQ_SALON_ID deve essere un UUID valido.",
    );
  }

  const googleServiceAccount = parseGoogleCredentials(
    requireString(environment, "GOOGLE_SERVICE_ACCOUNT"),
  );

  return {
    calendarId: requireString(environment, "CALENDAR_ID"),
    googleServiceAccount,
    port: Number(environment.PORT || 3000),
    salonId,
    supabaseSecretKey: requireString(
      environment,
      "SUPABASE_SECRET_KEY",
    ),
    supabaseUrl,
    vapiWebhookSecret: requireString(
      environment,
      "VAPI_WEBHOOK_SECRET",
    ),
  };
}

module.exports = {
  loadConfig,
};
