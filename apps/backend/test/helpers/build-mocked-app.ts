import { buildApp } from "../../src/app";

export async function buildMockedApp() {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    return await buildApp();
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
}
