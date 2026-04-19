import { spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { findBunBinary, getSampleRoot } from "./local-forks.mjs";

const sampleRoot = getSampleRoot();
const pocRoot = path.join(sampleRoot, "esm-migration-poc");
const defaultApps = ["ui5.v1.shopping.cart", "ui5.v2.shopping.cart"];
const defaultStrategies = ["bun-build-bridge", "esbuild-bridge", "rollup-preserve"];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scratchRoot = await mkdtemp(path.join(os.tmpdir(), "ui5-esm-bundlers-"));
  const allResults = [];

  try {
    for (const appName of options.apps) {
      const appRoot = path.join(pocRoot, appName);
      const overlayRoot = path.join(appRoot, "esm-overlay");

      await assertExists(appRoot, `ESM PoC app ${appName}`);
      await assertExists(overlayRoot, `ESM overlay for ${appName}`);

      const appScratchRoot = path.join(scratchRoot, appName);
      const overlayFiles = await listFiles(overlayRoot);
      const overlayJsFiles = overlayFiles.filter(filePath => filePath.endsWith(".js"));

      logSection(appName, [
        `overlay root: ${overlayRoot}`,
        `overlay JS modules: ${overlayJsFiles.length}`,
      ]);

      const appResults = [];
      for (const strategyName of options.strategies) {
        const strategy = strategies[strategyName];
        if (!strategy) {
          throw new Error(`Unknown strategy: ${strategyName}`);
        }

        const context = {
          appName,
          appRoot,
          overlayRoot,
          overlayFiles,
          overlayJsFiles,
          appScratchRoot,
        };

        const result = await runStrategy(strategyName, strategy, context);
        appResults.push(result);
        allResults.push(result);
      }

      printAppSummary(appName, appResults);
    }

    const summaryPath = path.join(scratchRoot, "comparison-summary.json");
    const reportPath = path.join(scratchRoot, "comparison-summary.md");

    await writeFile(summaryPath, JSON.stringify(allResults, null, 2));
    await writeFile(reportPath, buildMarkdownReport(allResults, summaryPath), "utf8");

    console.log(`\nSummary JSON: ${summaryPath}`);
    console.log(`Summary Markdown: ${reportPath}`);
    console.log(`Scratch root: ${scratchRoot}`);
  } catch (error) {
    console.error(`\nESM bundler comparison failed: ${error.message}`);
    console.error(`Scratch root preserved at: ${scratchRoot}`);
    process.exitCode = 1;
  }
}

const strategies = {
  "bun-build-bridge": {
    description: "Bun.build() against the overlay esm-bridge.js entrypoint",
    async run(context) {
      const outDir = path.join(context.appScratchRoot, "bun-build-bridge");
      const scriptPath = path.join(context.appScratchRoot, "bun-build-bridge.mjs");
      const entrypoint = path.join(context.overlayRoot, "resources", "esm-bridge.js");
      const bunBinary = await resolveBunBinary();

      await ensureCleanDir(outDir);
      await writeFile(scriptPath, buildBunScript(entrypoint, outDir), "utf8");

      const startedAt = process.hrtime.bigint();
      const execution = await runCommand(bunBinary, [scriptPath], {
        cwd: context.appRoot,
      });
      const durationMs = durationSince(startedAt);

      await copyHtmlShell(context.overlayRoot, outDir);

      const outputFiles = await listFiles(outDir);
      const jsFiles = outputFiles.filter(filePath => filePath.endsWith(".js"));
      const amdLeaks = await findAmdLeaks(jsFiles);
      const metrics = await collectOutputMetrics(outDir, outputFiles);
      const preservedBridge = outputFiles.some(filePath => filePath.endsWith("esm-bridge.js"));

      return {
        appName: context.appName,
        strategy: "bun-build-bridge",
        description: this.description,
        success: true,
        outDir,
        durationMs,
        outputFiles: outputFiles.length,
        jsFiles: jsFiles.length,
        htmlFiles: outputFiles.filter(filePath => filePath.endsWith(".html")).length,
        totalBytes: metrics.totalBytes,
        jsBytes: metrics.jsBytes,
        extraJsChunks: metrics.extraJsChunks,
        amdLeaks,
        sampleFiles: toRelativeList(outDir, outputFiles, 6),
        notes: [
          "Uses proper ESM overlay inputs directly via resources/esm-bridge.js.",
          preservedBridge ? "An esm-bridge.js output artifact is present." : "Bun.build emitted a bundled graph without a preserved esm-bridge.js path.",
          "HTML is copied through unchanged; Bun.build is only responsible for the ESM module graph here.",
          "This is a bundler boundary experiment, not a replacement for the full UI5 asset graph.",
        ],
        stdout: trimOutput(execution.stdout),
        stderr: trimOutput(execution.stderr),
      };
    },
  },
  "esbuild-bridge": {
    description: "esbuild bundle from esm-bridge.js with splitting",
    async run(context) {
      const outDir = path.join(context.appScratchRoot, "esbuild-bridge");
      const entrypoint = path.join(context.overlayRoot, "resources", "esm-bridge.js");

      await ensureCleanDir(outDir);

      const startedAt = process.hrtime.bigint();
      const execution = await runCommand("npm", [
        "exec",
        "--yes",
        "esbuild",
        "--",
        entrypoint,
        `--outdir=${outDir}`,
        `--outbase=${context.overlayRoot}`,
        "--bundle",
        "--format=esm",
        "--platform=browser",
        "--splitting",
        "--entry-names=[dir]/[name]",
        "--chunk-names=chunks/[name]-[hash]",
        "--sourcemap=external",
      ], {
        cwd: sampleRoot,
      });
      const durationMs = durationSince(startedAt);

      await copyHtmlShell(context.overlayRoot, outDir);

      const outputFiles = await listFiles(outDir);
      const jsFiles = outputFiles.filter(filePath => filePath.endsWith(".js"));
      const amdLeaks = await findAmdLeaks(jsFiles);
      const metrics = await collectOutputMetrics(outDir, outputFiles);
      const preservedBridge = await exists(path.join(outDir, "resources", "esm-bridge.js"));

      return {
        appName: context.appName,
        strategy: "esbuild-bridge",
        description: this.description,
        success: true,
        outDir,
        durationMs,
        outputFiles: outputFiles.length,
        jsFiles: jsFiles.length,
        htmlFiles: outputFiles.filter(filePath => filePath.endsWith(".html")).length,
        totalBytes: metrics.totalBytes,
        jsBytes: metrics.jsBytes,
        extraJsChunks: metrics.extraJsChunks,
        amdLeaks,
        sampleFiles: toRelativeList(outDir, outputFiles, 6),
        notes: [
          "Uses proper ESM overlay inputs directly via resources/esm-bridge.js.",
          preservedBridge ? "Preserved module path: resources/esm-bridge.js" : "esbuild did not preserve the expected resources/esm-bridge.js output path.",
          "HTML is copied through unchanged; esbuild is only responsible for the ESM module graph here.",
        ],
        stdout: trimOutput(execution.stdout),
        stderr: trimOutput(execution.stderr),
      };
    },
  },
  "rollup-preserve": {
    description: "Rollup preserveModules build from esm-bridge.js",
    async run(context) {
      const outDir = path.join(context.appScratchRoot, "rollup-preserve");
      const configPath = path.join(context.appScratchRoot, "rollup-preserve.config.mjs");
      const entrypoint = path.join(context.overlayRoot, "resources", "esm-bridge.js");

      await ensureCleanDir(outDir);
      await writeFile(configPath, buildRollupConfig(entrypoint, context.overlayRoot, outDir), "utf8");

      const startedAt = process.hrtime.bigint();
      const execution = await runCommand("npm", [
        "exec",
        "--yes",
        "rollup",
        "--",
        "--config",
        configPath,
        "--silent",
      ], {
        cwd: sampleRoot,
      });
      const durationMs = durationSince(startedAt);

      await copyHtmlShell(context.overlayRoot, outDir);

      const outputFiles = await listFiles(outDir);
      const jsFiles = outputFiles.filter(filePath => filePath.endsWith(".js"));
      const amdLeaks = await findAmdLeaks(jsFiles);
      const metrics = await collectOutputMetrics(outDir, outputFiles);
      const preservedBridge = await exists(path.join(outDir, "resources", "esm-bridge.js"));

      return {
        appName: context.appName,
        strategy: "rollup-preserve",
        description: this.description,
        success: true,
        outDir,
        durationMs,
        outputFiles: outputFiles.length,
        jsFiles: jsFiles.length,
        htmlFiles: outputFiles.filter(filePath => filePath.endsWith(".html")).length,
        totalBytes: metrics.totalBytes,
        jsBytes: metrics.jsBytes,
        extraJsChunks: metrics.extraJsChunks,
        amdLeaks,
        sampleFiles: toRelativeList(outDir, outputFiles, 6),
        notes: [
          "Uses proper ESM overlay inputs directly via resources/esm-bridge.js.",
          preservedBridge ? "Preserved module path: resources/esm-bridge.js" : "Expected preserved bridge path was not emitted.",
          "HTML is copied through unchanged; Rollup is only responsible for the ESM module graph here.",
        ],
        stdout: trimOutput(execution.stdout),
        stderr: trimOutput(execution.stderr),
      };
    },
  },
};

await main();

async function runStrategy(strategyName, strategy, context) {
  console.log(`\n- Running ${strategy.description}`);
  try {
    const result = await strategy.run(context);
    console.log(`  duration: ${formatDuration(result.durationMs)}`);
    console.log(`  outputs: ${result.outputFiles} files (${result.jsFiles} JS)`);
    console.log(`  size: ${formatBytes(result.totalBytes)} total, ${formatBytes(result.jsBytes)} JS, ${result.extraJsChunks} extra JS chunks`);
    console.log(`  amd leaks: ${result.amdLeaks.length === 0 ? "none" : result.amdLeaks.join(", ")}`);
    return result;
  } catch (error) {
    console.log(`  failed: ${error.message}`);
    return {
      appName: context.appName,
      strategy: strategyName,
      description: strategy.description,
      success: false,
      error: error.message,
      outDir: null,
      durationMs: 0,
      outputFiles: 0,
      jsFiles: 0,
      htmlFiles: 0,
      totalBytes: 0,
      jsBytes: 0,
      extraJsChunks: 0,
      amdLeaks: [],
      sampleFiles: [],
      notes: ["Strategy failed; see error field for details."],
      stdout: null,
      stderr: null,
    };
  }
}

function parseArgs(argv) {
  const apps = [];
  const strategies = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--app") {
      apps.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--strategy") {
      strategies.push(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return {
    apps: apps.length > 0 ? apps : defaultApps,
    strategies: strategies.length > 0 ? strategies : defaultStrategies,
  };
}

async function resolveBunBinary() {
  if (process.env.BUN_BINARY) {
    return process.env.BUN_BINARY;
  }

  try {
    return await findBunBinary();
  } catch {
    return "bun";
  }
}

function buildBunScript(entrypoint, outDir) {
  return `
const result = await Bun.build({
  entrypoints: [${JSON.stringify(toPosix(entrypoint))}],
  outdir: ${JSON.stringify(toPosix(outDir))},
  target: "browser",
  format: "esm",
  splitting: true,
  minify: false,
  sourcemap: "external",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log.message);
  }
  process.exit(1);
}

console.log(JSON.stringify(result.outputs.map(output => output.path), null, 2));
`.trimStart();
}

function buildRollupConfig(entrypoint, overlayRoot, outDir) {
  return `
export default {
  input: ${JSON.stringify(toPosix(entrypoint))},
  output: {
    dir: ${JSON.stringify(toPosix(outDir))},
    format: "es",
    preserveModules: true,
    preserveModulesRoot: ${JSON.stringify(toPosix(overlayRoot))},
    entryFileNames: "[name].js",
    chunkFileNames: "chunks/[name]-[hash].js",
    sourcemap: true,
  },
};
`.trimStart();
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

async function findAmdLeaks(jsFiles) {
  const amdLeaks = [];

  for (const filePath of jsFiles) {
    const contents = await readFile(filePath, "utf8");
    if (contents.includes("sap.ui.define")) {
      amdLeaks.push(filePath);
    }
  }

  return amdLeaks;
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
  await mkdirParent(path.join(dirPath, ".keep"));
  await rm(path.join(dirPath, ".keep"), { force: true });
}

async function mkdirParent(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function assertExists(targetPath, label) {
  try {
    await access(targetPath);
  } catch {
    throw new Error(`${label} not found at ${targetPath}`);
  }
}

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyHtmlShell(overlayRoot, outDir) {
  const htmlSource = path.join(overlayRoot, "index-esm.html");
  if (!(await exists(htmlSource))) {
    return false;
  }

  await cp(htmlSource, path.join(outDir, "index-esm.html"));
  return true;
}

async function collectOutputMetrics(outDir, outputFiles) {
  let totalBytes = 0;
  let jsBytes = 0;
  let extraJsChunks = 0;

  for (const filePath of outputFiles) {
    const fileStat = await stat(filePath);
    totalBytes += fileStat.size;

    if (!filePath.endsWith(".js")) {
      continue;
    }

    jsBytes += fileStat.size;

    const relativePath = path.relative(outDir, filePath).split(path.sep).join("/");
    if (relativePath !== "esm-bridge.js" && relativePath !== "resources/esm-bridge.js") {
      extraJsChunks += 1;
    }
  }

  return {
    totalBytes,
    jsBytes,
    extraJsChunks,
  };
}

function durationSince(startTime) {
  return Number(process.hrtime.bigint() - startTime) / 1_000_000;
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function trimOutput(text) {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > 2000 ? `${normalized.slice(0, 2000)}...` : normalized;
}

function toRelativeList(root, filePaths, limit) {
  return filePaths.slice(0, limit).map(filePath => path.relative(root, filePath).split(path.sep).join("/"));
}

function buildMarkdownReport(results, summaryPath) {
  const generatedAt = new Date().toISOString();
  const appNames = [...new Set(results.map(result => result.appName))];
  const lines = [
    "# ESM Bundler Comparison",
    "",
    `Generated: ${generatedAt}`,
    `Summary JSON: ${summaryPath}`,
    "",
    "This report compares direct ESM-overlay strategies only. It does not replace the runtime-shaped dist-esm assembly flow.",
  ];

  for (const appName of appNames) {
    const appResults = results.filter(result => result.appName === appName);
    const fastest = findFastestResult(appResults);

    lines.push("", `## ${appName}`, "");
    if (fastest) {
      lines.push(`Fastest successful strategy: ${fastest.strategy} (${formatDuration(fastest.durationMs)})`, "");
    }

    lines.push("| Strategy | Status | Duration | Outputs | JS | HTML | Total size | JS size | Extra JS chunks | AMD leaks |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
    for (const result of appResults) {
      lines.push(`| ${result.strategy} | ${result.success ? "success" : "failed"} | ${result.success ? formatDuration(result.durationMs) : "-"} | ${result.outputFiles} | ${result.jsFiles} | ${result.htmlFiles} | ${result.success ? formatBytes(result.totalBytes) : "-"} | ${result.success ? formatBytes(result.jsBytes) : "-"} | ${result.success ? result.extraJsChunks : "-"} | ${formatAmdLeakCell(result.amdLeaks)} |`);
    }

    for (const result of appResults) {
      lines.push("", `### ${result.strategy}`);
      lines.push("");
      lines.push(result.description);

      if (!result.success) {
        lines.push("", `Failure: ${result.error || "unknown error"}`);
        continue;
      }

      lines.push("");
      lines.push(`Output shape: ${result.outputFiles} files, ${result.jsFiles} JS, ${result.htmlFiles} HTML, ${result.extraJsChunks} extra JS chunks.`);
      lines.push(`Output size: ${formatBytes(result.totalBytes)} total, ${formatBytes(result.jsBytes)} JS.`);
      lines.push("");
      if (result.notes.length > 0) {
        lines.push("Notes:");
        for (const note of result.notes) {
          lines.push(`- ${note}`);
        }
      }

      if (result.sampleFiles.length > 0) {
        lines.push("", "Sample files:");
        for (const filePath of result.sampleFiles) {
          lines.push(`- ${filePath}`);
        }
      }

      if (result.stderr) {
        lines.push("", "stderr excerpt:", "", "```text", result.stderr, "```");
      }
    }
  }

  lines.push("", "Conclusion: these strategies are useful for direct ESM-overlay experiments, but they do not replace the full UI5 build graph or dist-esm assembly.");
  return `${lines.join("\n")}\n`;
}

function findFastestResult(results) {
  const successfulResults = results.filter(result => result.success);
  if (successfulResults.length === 0) {
    return null;
  }

  return successfulResults.reduce((fastest, result) => result.durationMs < fastest.durationMs ? result : fastest);
}

function formatAmdLeakCell(amdLeaks) {
  if (amdLeaks.length === 0) {
    return "none";
  }

  return amdLeaks.length === 1 ? "1 file" : `${amdLeaks.length} files`;
}

function findFirstLineContaining(source, needle) {
  return source.split(/\r?\n/u).find(line => line.includes(needle)) || null;
}

function logSection(title, lines) {
  console.log(`\n== ${title} ==`);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
}

function printAppSummary(appName, results) {
  console.log(`\nSummary for ${appName}:`);
  const fastest = findFastestResult(results);
  for (const result of results) {
    if (!result.success) {
      console.log(`- ${result.strategy}: failed`);
      console.log(`  ${result.error}`);
      continue;
    }
    console.log(`- ${result.strategy}: ${formatDuration(result.durationMs)}, ${result.outputFiles} outputs, amd leaks ${result.amdLeaks.length}`);
    console.log(`  output shape: ${result.jsFiles} JS, ${result.htmlFiles} HTML, ${result.extraJsChunks} extra JS chunks`);
    console.log(`  output size: ${formatBytes(result.totalBytes)} total, ${formatBytes(result.jsBytes)} JS`);
    for (const note of result.notes) {
      console.log(`  ${note}`);
    }
    if (result.sampleFiles.length > 0) {
      console.log(`  sample files: ${result.sampleFiles.join(", ")}`);
    }
  }
  if (fastest) {
    console.log(`  fastest successful strategy: ${fastest.strategy} (${formatDuration(fastest.durationMs)})`);
  }
  console.log("  conclusion: these strategies are useful for direct ESM-overlay experiments, but they do not replace the full UI5 build graph or dist-esm assembly.");
}

function toPosix(targetPath) {
  return targetPath.replaceAll("\\", "/");
}