#!/usr/bin/env node

import { constants } from "node:fs";
import { access, cp, mkdir, readdir, readFile, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
const repoRoot = resolve(backendRoot, "../..");
const pnpmStoreDir = join(repoRoot, "node_modules/.pnpm");

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function materializePackage(name, sourceDir, options = {}) {
  const { dependencyNames = [] } = options;
  const targetDir = join(backendRoot, "node_modules/@chatai", name);

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(join(backendRoot, "node_modules/@chatai"), { recursive: true });
  await mkdir(targetDir, { recursive: true });

  await cp(join(sourceDir, "package.json"), join(targetDir, "package.json"));
  await cp(join(sourceDir, "dist"), join(targetDir, "dist"), { recursive: true });

  if (dependencyNames.length === 0) {
    return;
  }

  const targetNodeModules = join(targetDir, "node_modules");
  await mkdir(targetNodeModules, { recursive: true });

  await materializeDependencyClosure(
    dependencyNames.map((name) => ({ name, requestedFrom: targetDir })),
    targetNodeModules,
  );
}

async function materializeDependencyClosure(initialQueue, targetNodeModules) {
  const queue = [...initialQueue];
  const visited = new Set();

  while (queue.length > 0) {
    const { name: packageName, requestedFrom } = queue.shift();
    const visitKey = `${requestedFrom}::${packageName}`;

    if (!packageName || visited.has(visitKey)) {
      continue;
    }

    visited.add(visitKey);

    const targetPackagePath = join(targetNodeModules, packageName);
    const sourcePackagePath = await findPackagePath(packageName, requestedFrom);

    if (!sourcePackagePath && !(await exists(targetPackagePath))) {
      throw new Error(`Missing dependency ${packageName}`);
    }

    if (sourcePackagePath && !(await exists(targetPackagePath))) {
      await mergePnpmDirectoryIntoTarget(
        findPnpmPeerModulesDir(sourcePackagePath),
        targetNodeModules,
      );
    }

    const packageJsonPath = join(
      (await exists(targetPackagePath) ? targetPackagePath : sourcePackagePath),
      "package.json",
    );
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    const resolvedPackageDir = await exists(targetPackagePath)
      ? targetPackagePath
      : sourcePackagePath;

    for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
      queue.push({
        name: dependencyName,
        requestedFrom: resolvedPackageDir,
      });
    }
  }
}

async function findPackagePath(packageName, requestedFromPath) {
  for (const root of collectSearchRoots(requestedFromPath)) {
    const candidate = join(root, "node_modules", packageName);

    if (await exists(candidate)) {
      return realpath(candidate);
    }
  }

  const encodedName = packageName.replace("/", "+");
  const storeEntries = await readdir(pnpmStoreDir);
  const matchingEntries = storeEntries
    .filter((entry) => entry === encodedName || entry.startsWith(`${encodedName}@`))
    .sort();

  for (const entry of matchingEntries) {
    const candidate = join(pnpmStoreDir, entry, "node_modules", packageName);

    if (await exists(candidate)) {
      return realpath(candidate);
    }
  }

  return null;
}

function collectSearchRoots(requestedFromPath) {
  const roots = [];
  let current = requestedFromPath;

  while (current && current.startsWith(repoRoot)) {
    roots.push(current);

    if (basename(current) === "node_modules") {
      current = dirname(dirname(current));
      continue;
    }

    current = dirname(current);
  }

  roots.push(repoRoot, join(repoRoot, "apps/voice-service"));

  return roots;
}

async function mergePnpmDirectoryIntoTarget(pnpmPeerModulesDir, targetNodeModules) {
  for (const entry of await readdir(pnpmPeerModulesDir)) {
    if (entry === ".bin") {
      continue;
    }

    const sourceEntry = join(pnpmPeerModulesDir, entry);
    const targetEntry = join(targetNodeModules, entry);

    if (entry.startsWith("@")) {
      await mkdir(targetEntry, { recursive: true });

      for (const scopedEntry of await readdir(sourceEntry)) {
        const scopedSource = join(sourceEntry, scopedEntry);
        const scopedTarget = join(targetEntry, scopedEntry);

        if (await exists(scopedTarget)) {
          continue;
        }

        await cp(scopedSource, scopedTarget, { recursive: true, dereference: true });
      }

      continue;
    }

    if (await exists(targetEntry)) {
      continue;
    }

    await cp(sourceEntry, targetEntry, { recursive: true, dereference: true });
  }
}

function findPnpmPeerModulesDir(resolvedPackagePath) {
  let currentDir = dirname(resolvedPackagePath);

  while (currentDir !== dirname(currentDir)) {
    if (basename(currentDir) === "node_modules" && currentDir.includes(`${sep}.pnpm${sep}`)) {
      return currentDir;
    }

    currentDir = dirname(currentDir);
  }

  throw new Error(`Unable to locate pnpm node_modules for ${resolvedPackagePath}`);
}

const voiceServicePackageJson = JSON.parse(
  await readFile(join(repoRoot, "apps/voice-service/package.json"), "utf8"),
);

await materializePackage("contracts", join(repoRoot, "packages/contracts"));
await materializePackage("voice-service", join(repoRoot, "apps/voice-service"), {
  dependencyNames: Object.keys(voiceServicePackageJson.dependencies ?? {}),
});
