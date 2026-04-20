import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

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

async function ensureSapUiVersionInfo(resourcesDir, ui5YamlPath) {
  const versionInfoPath = path.join(resourcesDir, "sap-ui-version.json");

  try {
    await readFile(versionInfoPath, "utf8");
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const frameworkConfig = await readFrameworkConfig(ui5YamlPath);
  const versionInfo = {
    name: frameworkConfig.name ?? "OpenUI5",
    version: frameworkConfig.version ?? "0.0.0-bridge-free-source",
    buildTimestamp: null,
    scmRevision: null,
    libraries: frameworkConfig.libraries.map(name => ({ name })),
  };

  await mkdir(resourcesDir, { recursive: true });
  await writeFile(versionInfoPath, `${JSON.stringify(versionInfo, null, 2)}\n`, "utf8");
  log(`generated ${versionInfoPath}`);
}

async function readFrameworkConfig(ui5YamlPath) {
  const yamlText = await readFile(ui5YamlPath, "utf8");
  const frameworkConfig = {
    name: null,
    version: null,
    libraries: [],
  };

  let inFramework = false;
  let inLibraries = false;

  for (const line of yamlText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const indent = line.match(/^\s*/)[0].length;
    if (indent === 0) {
      inFramework = trimmed === "framework:";
      inLibraries = false;
      continue;
    }

    if (!inFramework) {
      continue;
    }

    if (indent === 2 && trimmed.startsWith("name:")) {
      frameworkConfig.name = parseYamlScalar(trimmed);
      continue;
    }

    if (indent === 2 && trimmed.startsWith("version:")) {
      frameworkConfig.version = parseYamlScalar(trimmed);
      continue;
    }

    if (indent === 2 && trimmed === "libraries:") {
      inLibraries = true;
      continue;
    }

    if (indent === 4 && inLibraries && trimmed.startsWith("- name:")) {
      frameworkConfig.libraries.push(parseYamlScalar(trimmed.replace(/^-\s*/, "")));
      continue;
    }

    if (indent <= 2) {
      inLibraries = false;
    }
  }

  return frameworkConfig;
}

function parseYamlScalar(line) {
  const quotedMatch = line.match(/:\s*"([^"]+)"/);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  const singleQuotedMatch = line.match(/:\s*'([^']+)'/);
  if (singleQuotedMatch) {
    return singleQuotedMatch[1];
  }

  return line.split(":").slice(1).join(":").split("#")[0].trim();
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