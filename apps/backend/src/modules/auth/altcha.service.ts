import {
  createChallenge,
  randomInt,
  verifySolution,
  type Challenge,
  type Solution,
} from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/scrypt";
import { randomUUID } from "node:crypto";

const DEFAULT_ALTCHA_SECRET = "dev-only-altcha-secret";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_ALTCHA_COST = 4;
const DEFAULT_ALTCHA_MEMORY_COST = 8;
const DEFAULT_ALTCHA_PARALLELISM = 1;
const DEFAULT_COUNTER_MIN = 5000;
const DEFAULT_COUNTER_MAX = 10000;
const DEFAULT_USED_RECORD_PRUNE_INTERVAL_MS = 60 * 1000;
const DEFAULT_USED_RECORD_PRUNE_SIZE_THRESHOLD = 1000;

type StoreRecord = {
  expiresAt: number;
  used: boolean;
};

export class InMemoryAltchaStore {
  private readonly records = new Map<string, StoreRecord>();
  private lastPrunedAt = Date.now();

  constructor(
    private readonly options: {
      pruneIntervalMs?: number;
      pruneSizeThreshold?: number;
      ttlMs?: number;
    } = {},
  ) {}

  get size() {
    return this.records.size;
  }

  isUsed(key: string) {
    const record = this.records.get(key);

    return record?.used === true && record.expiresAt > Date.now();
  }

  markUsed(key: string) {
    this.pruneExpiredIfNeeded();
    this.records.set(key, {
      expiresAt: Date.now() + (this.options.ttlMs ?? CHALLENGE_TTL_MS),
      used: true,
    });
  }

  private pruneExpiredIfNeeded() {
    const now = Date.now();
    const intervalMs =
      this.options.pruneIntervalMs ?? DEFAULT_USED_RECORD_PRUNE_INTERVAL_MS;
    const sizeThreshold =
      this.options.pruneSizeThreshold ?? DEFAULT_USED_RECORD_PRUNE_SIZE_THRESHOLD;

    if (this.records.size < sizeThreshold && now - this.lastPrunedAt < intervalMs) {
      return;
    }

    this.lastPrunedAt = now;
    this.pruneExpired(now);
  }

  private pruneExpired(now: number) {
    for (const [key, record] of this.records) {
      if (record.expiresAt <= now) {
        this.records.delete(key);
      }
    }
  }
}

const usedChallengeStore = new InMemoryAltchaStore();

export type AltchaVerificationResult = {
  error: string | null;
  verified: boolean;
};

export async function createAltchaChallenge() {
  const counterRange = readCounterRange();

  return createChallenge({
    algorithm: "SCRYPT",
    cost: readScryptCost(),
    counter: randomInt(counterRange.min, counterRange.max),
    data: {
      challengeId: randomUUID(),
    },
    deriveKey,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    hmacSignatureSecret: getAltchaSecret(),
    memoryCost: readPositiveInteger("ALTCHA_MEMORY_COST", DEFAULT_ALTCHA_MEMORY_COST),
    parallelism: readPositiveInteger("ALTCHA_PARALLELISM", DEFAULT_ALTCHA_PARALLELISM),
  });
}

export async function verifyAltchaPayload(
  payload: unknown,
): Promise<AltchaVerificationResult> {
  const parsedPayload = parseAltchaPayload(payload);

  if (!parsedPayload) {
    return {
      error: "ALTCHA payload is invalid.",
      verified: false,
    };
  }

  const challengeId = getChallengeId(parsedPayload.challenge);

  if (usedChallengeStore.isUsed(challengeId)) {
    return {
      error: "ALTCHA payload has been already used.",
      verified: false,
    };
  }

  const verification = await verifySolution({
    challenge: parsedPayload.challenge,
    deriveKey,
    hmacSignatureSecret: getAltchaSecret(),
    solution: parsedPayload.solution,
  });

  if (!verification.verified) {
    return {
      error: "ALTCHA verification failed.",
      verified: false,
    };
  }

  usedChallengeStore.markUsed(challengeId);

  return {
    error: null,
    verified: true,
  };
}

function getAltchaSecret() {
  return process.env.ALTCHA_HMAC_SECRET ?? process.env.JWT_DEV_SECRET ?? DEFAULT_ALTCHA_SECRET;
}

function parseAltchaPayload(payload: unknown) {
  if (typeof payload !== "string") {
    return undefined;
  }

  try {
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as {
      challenge?: Challenge;
      solution?: Solution;
    };

    if (!parsed.challenge || !parsed.solution) {
      return undefined;
    }

    return {
      challenge: parsed.challenge,
      solution: parsed.solution,
    };
  } catch {
    return undefined;
  }
}

function getChallengeId(challenge: Challenge) {
  return String(challenge.parameters.data?.challengeId ?? challenge.parameters.nonce);
}

function readPositiveInteger(name: string, fallback: number) {
  const value = readNonNegativeInteger(name, fallback);

  return value > 0 ? value : fallback;
}

function readNonNegativeInteger(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);

  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function readCounterRange() {
  const min = readNonNegativeInteger("ALTCHA_COUNTER_MIN", DEFAULT_COUNTER_MIN);
  const max = readNonNegativeInteger("ALTCHA_COUNTER_MAX", DEFAULT_COUNTER_MAX);

  if (max > min) {
    return { max, min };
  }

  return {
    max: DEFAULT_COUNTER_MAX,
    min: DEFAULT_COUNTER_MIN,
  };
}

function readScryptCost() {
  const value = readPositiveInteger("ALTCHA_COST", DEFAULT_ALTCHA_COST);

  if (value >= 4 && isPowerOfTwo(value)) {
    return value;
  }

  return DEFAULT_ALTCHA_COST;
}

function isPowerOfTwo(value: number) {
  return (value & (value - 1)) === 0;
}
