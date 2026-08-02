"use strict";

const { createClient } = require(
  "@supabase/supabase-js",
);

class SupabaseIngestionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "SupabaseIngestionError";
    this.cause = cause;
  }
}

function createSupabaseIngestionService({
  secretKey,
  supabaseUrl,
}) {
  const client = createClient(
    supabaseUrl,
    secretKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );

  return {
    async ingestVapiCall(call) {
      const { data, error } = await client.rpc(
        "ingest_vapi_call",
        {
          p_customer_name: call.customerName,
          p_customer_phone: call.customerPhone,
          p_duration_seconds: call.durationSeconds,
          p_ended_at: call.endedAt,
          p_external_call_id: call.externalCallId,
          p_external_event_id: call.externalEventId,
          p_outcome: call.outcome,
          p_processing_status:
            call.processingStatus,
          p_requested_service:
            call.requestedService,
          p_salon_id: call.salonId,
          p_started_at: call.startedAt,
          p_summary: call.summary,
        },
      );

      if (error) {
        throw new SupabaseIngestionError(
          `RPC ingest_vapi_call fallita: ${error.message}`,
          error,
        );
      }

      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
      ) {
        throw new SupabaseIngestionError(
          "RPC ingest_vapi_call ha restituito un risultato non valido.",
        );
      }

      return data;
    },
  };
}

module.exports = {
  SupabaseIngestionError,
  createSupabaseIngestionService,
};
