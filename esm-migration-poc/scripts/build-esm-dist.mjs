import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const appRoot = process.cwd();
const distDir = path.join(appRoot, "dist");
const distEsmDir = path.join(appRoot, "dist-esm");
const overlayDir = path.join(appRoot, "esm-overlay");

const preloadArtifacts = ["Component-preload.js", "Component-preload.js.map"];
const unusedAppModules = ["initMockServer.js"];
const verificationExclusions = ["resources/", "test/", "localService/mockdata/"];

await main();

async function main() {
  log(`assembling dist-esm in ${appRoot}`);
  if (process.env.UI5_BUILD_ESM_SKIP_BUILD === "1") {
    log("skipping bun run build (UI5_BUILD_ESM_SKIP_BUILD=1)");
  } else {
    await runBuild();
  }
  await rebuildDistEsm();

  const overlayFiles = await listFiles(overlayDir);
  const overlayJsFiles = overlayFiles.filter(filePath => filePath.endsWith(".js"));

  await overlayEsmFiles(overlayFiles);
  await removeUnusedAppModules();
  await validateDistEsm(overlayJsFiles);

  log(`done (${overlayJsFiles.length} ESM modules mirrored into dist-esm)`);
}

async function runBuild() {
  log("running bun run build");

  const result = Bun.spawnSync({
    cmd: [process.execPath, "run", "build"],
    cwd: appRoot,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    process.exit(result.exitCode ?? 1);
  }
}

async function rebuildDistEsm() {
  log("copying dist -> dist-esm");
  await rm(distEsmDir, { force: true, recursive: true });
  await cp(distDir, distEsmDir, { recursive: true });

  for (const artifact of preloadArtifacts) {
    await safeRemove(path.join(distEsmDir, artifact));
  }
}

async function overlayEsmFiles(overlayFiles) {
  log("overlaying ESM sources and debug variants");

  for (const sourcePath of overlayFiles) {
    const relativePath = toPosixRelative(overlayDir, sourcePath);
    const targetPath = path.join(distEsmDir, relativePath);

    await ensureParentDir(targetPath);
    await Bun.write(targetPath, Bun.file(sourcePath));

    if (!relativePath.endsWith(".js")) {
      continue;
    }

    const debugRelativePath = await resolveDebugArtifactPath(relativePath);
    const debugTargetPath = path.join(distEsmDir, debugRelativePath);

    await ensureParentDir(debugTargetPath);
    await Bun.write(debugTargetPath, Bun.file(sourcePath));

    await safeRemove(`${targetPath}.map`);
    await safeRemove(`${debugTargetPath}.map`);
  }
}

async function removeUnusedAppModules() {
  for (const relativePath of unusedAppModules) {
    const debugRelativePath = await resolveDebugArtifactPath(relativePath);

    await safeRemove(path.join(distEsmDir, relativePath));
    await safeRemove(path.join(distEsmDir, `${relativePath}.map`));
    await safeRemove(path.join(distEsmDir, debugRelativePath));
    await safeRemove(path.join(distEsmDir, `${debugRelativePath}.map`));
  }
}

async function validateDistEsm(overlayJsFiles) {
  const missingArtifacts = [];
  const amdOverlayArtifacts = [];

  for (const sourcePath of overlayJsFiles) {
    const relativePath = toPosixRelative(overlayDir, sourcePath);
    const debugRelativePath = await resolveDebugArtifactPath(relativePath);

    for (const outputRelativePath of [relativePath, debugRelativePath]) {
      const outputPath = path.join(distEsmDir, outputRelativePath);

      if (!(await exists(outputPath))) {
        missingArtifacts.push(outputRelativePath);
        continue;
      }

      const contents = await Bun.file(outputPath).text();
      if (contents.includes("sap.ui.define")) {
        amdOverlayArtifacts.push(outputRelativePath);
      }
    }
  }

  if (missingArtifacts.length > 0) {
    throw new Error(`Missing ESM output artifacts: ${missingArtifacts.join(", ")}`);
  }

  if (amdOverlayArtifacts.length > 0) {
    throw new Error(`Generated overlay artifacts still contain sap.ui.define: ${amdOverlayArtifacts.join(", ")}`);
  }

  if (!(await exists(path.join(distEsmDir, "index-esm.html")))) {
    throw new Error("Missing dist-esm/index-esm.html");
  }

  for (const artifact of preloadArtifacts) {
    if (await exists(path.join(distEsmDir, artifact))) {
      throw new Error(`Unexpected preload artifact in dist-esm: ${artifact}`);
    }
  }

  const amdLeaks = [];
  for (const filePath of await listFiles(distEsmDir)) {
    const relativePath = toPosixRelative(distEsmDir, filePath);
    if (!shouldVerifyJsFile(relativePath)) {
      continue;
    }

    const contents = await Bun.file(filePath).text();
    if (contents.includes("sap.ui.define")) {
      amdLeaks.push(relativePath);
    }
  }

  if (amdLeaks.length > 0) {
    throw new Error(`Leftover AMD app modules in dist-esm: ${amdLeaks.join(", ")}`);
  }
}

async function resolveDebugArtifactPath(relativePath) {
  const candidates = [];

  if (relativePath.endsWith(".controller.js")) {
    candidates.push(relativePath.replace(/\.controller\.js$/, "-dbg.controller.js"));
    candidates.push(relativePath.replace(/\.controller\.js$/, ".controller-dbg.js"));
  }

  candidates.push(relativePath.replace(/\.js$/, "-dbg.js"));

  for (const candidate of [...new Set(candidates)]) {
    if (await exists(path.join(distDir, candidate))) {
      return candidate;
    }
  }

  return candidates[0];
}

function shouldVerifyJsFile(relativePath) {
  if (!relativePath.endsWith(".js")) {
    return false;
  }

  if (relativePath.endsWith("-preload.js")) {
    return false;
  }

  return !verificationExclusions.some(prefix => relativePath.startsWith(prefix));
}

async function listFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath));
      continue;
    }

    files.push(entryPath);
  }

  return files.sort();
}

async function ensureParentDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function safeRemove(filePath) {
  await rm(filePath, { force: true });
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function log(message) {
  console.log(`[build:esm] ${message}`);
}

function toPosixRelative(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}