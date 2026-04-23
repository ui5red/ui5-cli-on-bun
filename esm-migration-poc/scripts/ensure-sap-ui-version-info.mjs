import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export async function ensureSapUiVersionInfo({
  appRoot = process.cwd(),
  resourcesDir = path.join(appRoot, "dist", "resources"),
  ui5YamlPath = path.join(appRoot, "ui5.yaml"),
  force = false,
  logger = defaultLogger,
} = {}) {
  const versionInfoPath = path.join(resourcesDir, "sap-ui-version.json");

  if (!force) {
    try {
      await readFile(versionInfoPath, "utf8");
      return {
        created: false,
        versionInfoPath,
      };
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
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
  logger(`generated ${versionInfoPath}`);

  return {
    created: true,
    versionInfo,
    versionInfoPath,
  };
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
      frameworkConfig.libraries.push(parseYamlScalar(trimmed.replace(/^\-\s*/, "")));
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

function defaultLogger(message) {
  console.log(`[sap-ui-version] ${message}`);
}

function parseArguments(args) {
  const options = {};

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === "--app-root" && args[index + 1]) {
      options.appRoot = path.resolve(args[++index]);
      continue;
    }

    if (arg === "--resources-dir" && args[index + 1]) {
      options.resourcesDir = path.resolve(args[++index]);
      continue;
    }

    if (arg === "--ui5-yaml" && args[index + 1]) {
      options.ui5YamlPath = path.resolve(args[++index]);
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }
  }

  return options;
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  await ensureSapUiVersionInfo(parseArguments(process.argv.slice(2)));
}