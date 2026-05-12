export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super("UNAUTHORIZED", "登录已失效", 401);
  }
}

export class BadRequestError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 403, details);
  }
}

export class BadGatewayError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 502, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 503, details);
  }
}
