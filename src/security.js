"use strict";

const crypto = require("crypto");

function tokensMatch(received, expected) {
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function createBearerAuthenticator(expectedToken) {
  return function authenticateWebhook(request, response, next) {
    const authorizationHeader =
      request.get("Authorization") || "";

    if (!authorizationHeader.startsWith("Bearer ")) {
      return response.status(401).json({
        error: "Autenticazione richiesta",
      });
    }

    const receivedToken = authorizationHeader
      .slice("Bearer ".length)
      .trim();

    if (
      !receivedToken ||
      !tokensMatch(receivedToken, expectedToken)
    ) {
      return response.status(401).json({
        error: "Credenziali non valide",
      });
    }

    return next();
  };
}

module.exports = {
  createBearerAuthenticator,
  tokensMatch,
};
