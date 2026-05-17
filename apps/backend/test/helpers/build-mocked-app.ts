import { buildApp } from "../../src/app";

export async function buildMockedApp() {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.NODE_ENV = "development";
  process.env.DATABASE_URL = "mysql://user:password@localhost:3306/chatai";

  try {
    return await buildApp();
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
}
