import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { ensureSapUiVersionInfo } from "./ensure-sap-ui-version-info.mjs";

const appRoot = process.cwd();
const sourceRoot = path.join(appRoot, "esm-source-bridge-free");
const debugOutDir = path.join(appRoot, "dist-esm-source-debug");
const releaseOutDir = path.join(appRoot, "dist-esm-source-release");
const generatorScript = path.join(appRoot, "..", "scripts", "generate-bridge-free-source.mjs");
const esmModuleDirName = "_esm";

await main();

async function main() {
  await runCommand(process.execPath, [generatorScript], { cwd: appRoot });
  await ensureSapUiVersionInfo(path.join(appRoot, "dist", "resources"), path.join(appRoot, "ui5.yaml"));
  const entryFiles = await listBuildEntrypoints(sourceRoot);

  await ensureCleanDir(debugOutDir);
  await ensureCleanDir(releaseOutDir);

  await copyNonJsAssets(sourceRoot, debugOutDir);
  await copyNonJsAssets(sourceRoot, releaseOutDir);

  const scratchRoot = await mkdtemp(path.join(os.tmpdir(), "ui5-bridge-free-build-"));
  const debugConfigPath = path.join(scratchRoot, "rollup-debug.config.mjs");

  await writeFile(debugConfigPath, buildRollupConfig(entryFiles, sourceRoot, debugOutDir), "utf8");

  await runCommand("npm", [
    "exec",
    "--yes",
    "rollup",
    "--",
    "--config",
    debugConfigPath,
    "--silent",
  ], {
    cwd: path.resolve(appRoot, "..", ".."),
  });

  await runCommand("npm", [
    "exec",
    "--yes",
    "esbuild",
    "--",
    ...entryFiles,
    `--outdir=${releaseOutDir}`,
    `--outbase=${sourceRoot}`,
    "--bundle",
    "--format=esm",
    "--platform=browser",
    "--splitting",
    "--minify",
    "--entry-names=[dir]/[name]",
    "--chunk-names=chunks/[name]-[hash]",
    "--sourcemap=external",
  ], {
    cwd: path.resolve(appRoot, "..", ".."),
  });

  log(`debug output: ${debugOutDir}`);
  log(`release output: ${releaseOutDir}`);
}

function buildRollupConfig(entryFiles, sourceDir, outDir) {
  return `
export default {
  input: ${JSON.stringify(entryFiles.map(toPosix), null, 2)},
  output: {
    dir: ${JSON.stringify(toPosix(outDir))},
    format: "es",
    preserveModules: true,
    preserveModulesRoot: ${JSON.stringify(toPosix(sourceDir))},
    entryFileNames: "[name].js",
    chunkFileNames: "chunks/[name]-[hash].js",
    sourcemap: true,
  },
};
`.trimStart();
}

async function listBuildEntrypoints(sourceDir) {
  const files = await listFiles(sourceDir);

  return files
    .filter(filePath => filePath.endsWith(".js"))
    .filter(filePath => {
      const relativePath = path.relative(sourceDir, filePath);
      return !relativePath.startsWith(`framework${path.sep}`) && !isStaticBuildScript(relativePath);
    })
    .map(toPosix)
    .sort();
}

async function copyNonJsAssets(fromDir, toDir) {
  const files = await listFiles(fromDir);

  for (const sourcePath of files) {
    const relativePath = path.relative(fromDir, sourcePath);
    if (sourcePath.endsWith(".js.map")) {
      continue;
    }

    if (sourcePath.endsWith(".js") && !isStaticBuildScript(relativePath)) {
      continue;
    }

    const targetPath = path.join(toDir, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath);
  }
}

function isStaticBuildScript(relativePath) {
  return relativePath === "Component-preload.js";
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

async function ensureCleanDir(dirPath) {
  await rm(dirPath, { force: true, recursive: true });
  await mkdir(dirPath, { recursive: true });
}

async function runCommand(command, args, options) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function toPosix(targetPath) {
  return targetPath.replaceAll("\\", "/");
}

function log(message) {
  console.log(`[bridge-free-build] ${message}`);
}