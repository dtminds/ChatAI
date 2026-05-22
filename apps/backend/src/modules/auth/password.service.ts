import argon2 from "argon2";
import { AppError } from "../../shared/errors.js";

const DEFAULT_MAX_CONCURRENT_PASSWORD_VERIFICATIONS = 4;

export class PasswordVerificationBusyError extends AppError {
  constructor() {
    super("AUTH_BUSY", "登录请求过多，请稍后重试", 429);
  }
}

let activeVerifications = 0;

export async function verifyPassword(hash: string, password: string) {
  if (activeVerifications >= readMaxConcurrentPasswordVerifications()) {
    throw new PasswordVerificationBusyError();
  }

  activeVerifications += 1;

  try {
    return await argon2.verify(normalizeArgon2PhcHash(hash), password);
  } finally {
    activeVerifications -= 1;
  }
}

export async function hashPassword(password: string) {
  return argon2.hash(password, getArgon2HashOptions());
}

export function getArgon2HashOptions() {
  return {
    hashLength: readPositiveInteger("PASSWORD_ARGON2_HASH_LENGTH", 32),
    memoryCost: readPositiveInteger("PASSWORD_ARGON2_MEMORY_COST", 19456),
    parallelism: readPositiveInteger("PASSWORD_ARGON2_PARALLELISM", 1),
    timeCost: readPositiveInteger("PASSWORD_ARGON2_TIME_COST", 2),
    type: argon2.argon2id,
  };
}

function readMaxConcurrentPasswordVerifications() {
  return readPositiveInteger(
    "PASSWORD_VERIFY_MAX_CONCURRENCY",
    DEFAULT_MAX_CONCURRENT_PASSWORD_VERIFICATIONS,
  );
}

function readPositiveInteger(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);

  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function normalizeArgon2PhcHash(hash: string) {
  const fields = hash.split("$");

  if (
    fields[0] !== "" ||
    !["argon2d", "argon2i", "argon2id"].includes(fields[1] ?? "") ||
    (fields.length !== 5 && fields.length !== 6)
  ) {
    return hash;
  }

  const normalizedFields = [...fields];
  normalizedFields[normalizedFields.length - 2] = stripBase64Padding(
    normalizedFields[normalizedFields.length - 2],
  );
  normalizedFields[normalizedFields.length - 1] = stripBase64Padding(
    normalizedFields[normalizedFields.length - 1],
  );

  return normalizedFields.join("$");
}

function stripBase64Padding(value = "") {
  return value.replace(/=+$/, "");
}
