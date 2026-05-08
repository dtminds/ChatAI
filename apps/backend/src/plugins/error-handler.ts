import { apiError } from "@chatai/contracts";
import type { FastifyError, FastifyInstance } from "fastify";
import { AppError } from "../shared/errors.js";

export async function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.validation) {
      return reply
        .code(400)
        .send(apiError("BAD_REQUEST", error.message, { validation: error.validation }));
    }

    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send(apiError(error.code, error.message, error.details));
    }

    app.log.error(error);

    return reply
      .code(500)
      .send(apiError("INTERNAL_SERVER_ERROR", "服务暂时不可用"));
  });
}
