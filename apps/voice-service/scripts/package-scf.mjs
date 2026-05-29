#!/usr/bin/env node

import { mkdir, rm, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(rootDir, "../../artifacts/voice-service");
const zipPath = join(outputDir, "voice-service-scf.zip");
const stagingDir = await mkdtemp(join(tmpdir(), "voice-service-scf-"));

try {
  await run("pnpm", ["--dir", rootDir, "build"]);

  await mkdir(stagingDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  await run("pnpm", [
    "exec",
    "esbuild",
    join(rootDir, "src/index.ts"),
    "--bundle",
    "--platform=node",
    "--target=node22",
    "--format=cjs",
    `--outfile=${join(stagingDir, "index.js")}`,
    "--external:@audio/decode-amr",
    "--external:cos-nodejs-sdk-v5",
    "--external:silk-wasm",
  ]);

  await writeFile(
    join(stagingDir, "package.json"),
    JSON.stringify(
      {
        name: "voice-service-scf",
        private: true,
        main: "index.js",
        dependencies: {
          "@audio/decode-amr": "^1.1.1",
          "cos-nodejs-sdk-v5": "^2.15.4",
          "silk-wasm": "^3.7.1",
        },
      },
      null,
      2,
    ),
  );
  await run(
    "pnpm",
    ["install", "--prod", "--ignore-scripts", "--no-lockfile", "--node-linker=hoisted"],
    stagingDir,
  );
  await rm(zipPath, { force: true });
  await run("zip", ["-q", "-r", zipPath, "."], stagingDir);
} finally {
  await rm(stagingDir, { force: true, recursive: true });
}

console.log(zipPath);

async function run(command, args, cwd = rootDir) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: "inherit", cwd });

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}
