import { buildApp } from "./app.js";
import { getPort, loadBackendEnv } from "./config/env.js";

loadBackendEnv();
const app = await buildApp();
const port = getPort();

try {
  await app.listen({
    host: "0.0.0.0",
    port,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
