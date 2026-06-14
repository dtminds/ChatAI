import { apiError } from "@chatai/contracts";
import type { FastifyError, FastifyInstance } from "fastify";
import { AppError } from "../shared/errors.js";
import { formatValidationErrorMessage } from "../shared/format-validation-error.js";

export async function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      const message = formatValidationErrorMessage(error);

      request.log.warn(
        {
          error: error.message,
          message,
          requestId: request.id,
          url: request.url,
        },
        "请求校验失败",
      );

      return reply
        .code(400)
        .send(apiError("BAD_REQUEST", message, { validation: error.validation }));
    }

    if (error instanceof AppError) {
      request.log.warn(
        {
          code: error.code,
          details: error.details,
          requestId: request.id,
          statusCode: error.statusCode,
          url: request.url,
        },
        "业务请求失败",
      );

      return reply
        .code(error.statusCode)
        .send(apiError(error.code, error.message, error.details));
    }

    request.log.error(
      {
        err: error,
        requestId: request.id,
        url: request.url,
      },
      "未处理错误",
    );

    return reply
      .code(500)
      .send(apiError("INTERNAL_SERVER_ERROR", "服务暂时不可用"));
  });
}
