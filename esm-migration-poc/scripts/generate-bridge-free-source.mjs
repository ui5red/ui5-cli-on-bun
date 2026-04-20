import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const appRoot = process.cwd();
const overlayRoot = path.join(appRoot, "esm-overlay");
const webappRoot = path.join(appRoot, "webapp");
const frameworkRoot = path.join(appRoot, "..", "framework-esm");
const targetRoot = path.join(appRoot, "esm-source-bridge-free");
const esmModuleDirName = "_esm";
const esmModuleRoot = path.join(targetRoot, esmModuleDirName);

await main();

async function main() {
  await rebuildTargetRoot();
  await copyStaticAssets(webappRoot, targetRoot, shouldCopyWebappAsset);
  await copyStaticAssets(overlayRoot, targetRoot, shouldCopyOverlayAsset);

  await cp(frameworkRoot, path.join(targetRoot, "framework"), { recursive: true });

  const appModuleSources = await collectAppModuleSources();
  const manifestConfig = await readJson(path.join(targetRoot, "manifest.json"));
  const appNamespace = manifestConfig?.["sap.app"]?.id ?? null;
  const controllerModulePaths = await collectRuntimeControllerModulePaths(appModuleSources, appNamespace);
  const componentModuleImportPaths = buildComponentModuleImportPaths(appNamespace);
  const componentPreloadModulePaths = buildComponentPreloadModulePaths(appModuleSources);
  const componentPreloadResourcePaths = await collectComponentPreloadResourcePaths();
  const frameworkModuleNames = new Set();

  for (const [relativePath, sourcePath] of appModuleSources) {
    const targetPath = path.join(esmModuleRoot, relativePath);
    await ensureParentDir(targetPath);

    const sourceText = await readFile(sourcePath, "utf8");
    const transformed = await transformModuleSource(sourceText, targetPath);
    for (const moduleName of transformed.frameworkModuleNames) {
      frameworkModuleNames.add(moduleName);
    }

    await writeFile(targetPath, transformed.contents, "utf8");
  }

  await writeFile(
    path.join(targetRoot, "bootstrap.js"),
    buildBootstrapModule(
      appNamespace,
      collectBootstrapPreloadModules(manifestConfig, frameworkModuleNames),
      buildControllerModuleImportPaths(controllerModulePaths, appNamespace),
      componentModuleImportPaths,
    ),
    "utf8",
  );
  await writeFile(
    path.join(targetRoot, "Component-preload.js"),
    buildComponentPreloadModule(appNamespace, componentPreloadModulePaths, componentPreloadResourcePaths),
    "utf8",
  );
  await writeFile(path.join(targetRoot, "index-esm.html"), buildIndexHtml(), "utf8");

  log(`generated bridge-free source variant in ${targetRoot}`);
}

async function rebuildTargetRoot() {
  await rm(targetRoot, { force: true, recursive: true });
  await mkdir(targetRoot, { recursive: true });
}

async function transformModuleSource(sourceText, outputPath) {
  let contents = sourceText;
  const injectedImports = [];
  const facadeDeclarations = [];
  const frameworkModuleNames = new Set();

  contents = contents.replace(/^import\s*\{[^}]*requireUI5[^}]*\}\s*from\s*["'][^"']*esm-helpers\.js["'];\n?/m, "");

  contents = contents.replace(/const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s*requireUI5\("([^"]+)"\);\n?/g, (_match, variableName, moduleName) => {
    injectedImports.push(buildRuntimeImport(outputPath, "createUi5NamespaceFacade"));
    facadeDeclarations.push(`const ${variableName} = createUi5NamespaceFacade(${JSON.stringify(moduleName)});`);
    frameworkModuleNames.add(moduleName);
    return "";
  });

  contents = contents.replace(/const\s*\[([^\]]+)\]\s*=\s*await\s*requireUI5All\(([\s\S]*?)\);\n?/g, (_match, variableList, moduleList) => {
    const variables = variableList.split(",").map(item => item.trim()).filter(Boolean);
    const modules = [...moduleList.matchAll(/"([^"]+)"/g)].map(match => match[1]);

    if (variables.length !== modules.length) {
      throw new Error(`Could not transform requireUI5All() in ${outputPath}`);
    }

    for (let index = 0; index < variables.length; index += 1) {
      injectedImports.push(buildRuntimeImport(outputPath, "createUi5NamespaceFacade"));
      facadeDeclarations.push(`const ${variables[index]} = createUi5NamespaceFacade(${JSON.stringify(modules[index])});`);
      frameworkModuleNames.add(modules[index]);
    }

    return "";
  });

  if (contents.includes("sap.ui.require.toUrl(")) {
    contents = contents.replace(/sap\.ui\.require\.toUrl\(/g, "resolveUi5ResourceUrl(");
    injectedImports.push(buildRuntimeImport(outputPath, "resolveUi5ResourceUrl"));
  }

  contents = injectImports(contents, injectedImports);
  contents = injectDeclarations(contents, facadeDeclarations);
  contents = contents.replace(/\n{3,}/g, "\n\n").trimEnd();
  return {
    contents: `${contents}\n`,
    frameworkModuleNames: [...frameworkModuleNames].sort(),
  };
}

function buildRuntimeImport(outputPath, importName) {
  const runtimeFile = path.join(targetRoot, "framework", "_runtime.js");
  const relativeImport = toModuleImport(path.relative(path.dirname(outputPath), runtimeFile));
  return `import { ${importName} } from ${JSON.stringify(relativeImport)};`;
}

function injectImports(sourceText, frameworkImports) {
  if (frameworkImports.length === 0) {
    return sourceText;
  }

  const importBlock = [...new Set(frameworkImports)].join("\n");
  const importMatches = [...sourceText.matchAll(/^import .*;$/gm)];

  if (importMatches.length === 0) {
    return `${importBlock}\n\n${sourceText.trimStart()}`;
  }

  const lastImport = importMatches.at(-1);
  const insertionIndex = lastImport.index + lastImport[0].length;
  return `${sourceText.slice(0, insertionIndex)}\n${importBlock}${sourceText.slice(insertionIndex)}`;
}

function injectDeclarations(sourceText, declarations) {
  if (declarations.length === 0) {
    return sourceText;
  }

  const declarationBlock = [...new Set(declarations)].join("\n");
  const importMatches = [...sourceText.matchAll(/^import .*;$/gm)];

  if (importMatches.length === 0) {
    return `${declarationBlock}\n\n${sourceText.trimStart()}`;
  }

  const lastImport = importMatches.at(-1);
  const insertionIndex = lastImport.index + lastImport[0].length;
  return `${sourceText.slice(0, insertionIndex)}\n\n${declarationBlock}${sourceText.slice(insertionIndex)}`;
}

function buildBootstrapModule(appNamespace, manifestPreloadModules, controllerModuleImportPaths, componentModuleImportPaths) {
  const appNamespaceLiteral = JSON.stringify(appNamespace);
  const preloadModulesLiteral = JSON.stringify(manifestPreloadModules, null, 2);
  const controllerImportPathsLiteral = JSON.stringify(controllerModuleImportPaths, null, 2);
  const componentImportPathsLiteral = JSON.stringify(componentModuleImportPaths, null, 2);

  return `
import { createUi5NamespaceFacade, installUi5ModuleImportHook, loadUi5Modules, waitForUi5CoreReady } from "./framework/_runtime.js";
import mockserver from "./${esmModuleDirName}/localService/mockserver.js";

const appNamespace = ${appNamespaceLiteral};
const manifestPreloadModules = ${preloadModulesLiteral};
const MessageBox = createUi5NamespaceFacade("sap/m/MessageBox");
const ComponentContainer = createUi5NamespaceFacade("sap/ui/core/ComponentContainer");
const controllerModuleImportPaths = ${controllerImportPathsLiteral};
const controllerModuleImportUrls = Object.fromEntries(
  Object.entries(controllerModuleImportPaths).map(([controllerName, modulePath]) => [
    controllerName,
    new URL(modulePath, import.meta.url).href,
  ]),
);
const componentModuleImportPaths = ${componentImportPathsLiteral};
const componentModuleImportUrls = Object.fromEntries(
  Object.entries(componentModuleImportPaths).map(([moduleName, modulePath]) => [
    moduleName,
    new URL(modulePath, import.meta.url).href,
  ]),
);

function reportError(error) {
  const errorBox = document.getElementById("esm-errors");
  const message = error instanceof Error ? (error.stack || error.message) : String(error);

  if (errorBox) {
    errorBox.textContent = (errorBox.textContent + "\\n" + message).trim();
  }

  console.error(error);
}

window.addEventListener("error", event => {
  reportError(event.error || event.message);
});

window.addEventListener("unhandledrejection", event => {
  reportError(event.reason);
});

await waitForUi5CoreReady();

await installUi5ModuleImportHook(controllerModuleImportUrls);
await installUi5ModuleImportHook(componentModuleImportUrls);

if (manifestPreloadModules.length > 0) {
  // Source-native component startup still relies on loader-resolved manifest routing/model/view classes.
  await loadUi5Modules(...manifestPreloadModules);
}

try {
  await mockserver.init();
} catch (error) {
  MessageBox.error(error.message);
  reportError(error);
}

let container;

try {
  container = new ComponentContainer("container", {
    async: true,
    height: "100%",
    manifest: true,
    name: appNamespace,
    settings: {
      id: "cart",
    },
    width: "100%",
  });

  const componentCreated = new Promise((resolve, reject) => {
    container.attachComponentCreated(event => resolve(event.getParameter("component")));
    container.attachComponentFailed(event => reject(event.getParameter("reason")));
  });

  container.placeAt("content");
  await componentCreated;
} catch (error) {
  container?.destroy();
  MessageBox.error(error.message);
  reportError(error);
}
`.trimStart();
}

function buildComponentPreloadModule(appNamespace, moduleImportPaths, resourcePaths) {
  const bundleName = appNamespace
    ? `${appNamespace.replaceAll(".", "/")}/Component-preload.js`
    : "Component-preload.js";
  const moduleImportPathsLiteral = JSON.stringify(moduleImportPaths, null, 2);
  const resourcePathsLiteral = JSON.stringify(resourcePaths, null, 2);

  return `
//@ui5-bundle ${bundleName}
(function() {
  const host = globalThis.window ?? globalThis;
  const documentRef = host.document;
  const scriptUrl = documentRef?.currentScript?.src ?? host.location?.href;
  if (!scriptUrl) {
    return;
  }

  const moduleImportPaths = ${moduleImportPathsLiteral};
  const resourcePaths = ${resourcePathsLiteral};
  const baseUrl = new URL("./", scriptUrl);
  const moduleUrls = [...new Set(moduleImportPaths.map(modulePath => new URL(modulePath, baseUrl).href))];
  const resourceUrls = [...new Set(resourcePaths.map(resourcePath => new URL(resourcePath, baseUrl).href))];

  const logError = (label, error) => {
    const message = error instanceof Error ? error.message : String(error);
    host.console?.warn?.("[bridge-free-source] " + label + ": " + message);
  };

  const link = documentRef?.createElement?.("link");
  const supportsModulePreload = !!link?.relList?.supports?.("modulepreload");
  if (supportsModulePreload && documentRef?.head) {
    for (const href of moduleUrls) {
      const preloadLink = documentRef.createElement("link");
      preloadLink.rel = "modulepreload";
      preloadLink.href = href;
      preloadLink.addEventListener("error", () => {
        logError("Failed to preload module " + href, href);
      }, { once: true });
      documentRef.head.append(preloadLink);
    }
  } else {
    Promise.allSettled(moduleUrls.map(href => import(href))).then(results => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          logError("Failed to import fallback preload module " + moduleUrls[index], result.reason);
        }
      });
    });
  }

  for (const href of resourceUrls) {
    fetch(href, { credentials: "same-origin" }).catch(error => {
      logError("Failed to preload resource " + href, error);
    });
  }
})();
`.trimStart();
}

function buildIndexHtml() {
  return `
<!DOCTYPE html>
<html>
<head>

  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Shopping Cart (Bridge-Free ESM Exploration)</title>

  <script
    id="sap-ui-bootstrap"
    src="../dist/resources/sap-ui-core.js"
    data-sap-ui-theme="sap_horizon"
    data-sap-ui-compat-version="edge"
    data-sap-ui-async="true"
    data-sap-ui-resource-roots='{
      "sap.ui.demo.cart" : "./",
      "sap.ui.demo.mock": "./localService/mockdata"
    }'>
  </script>

  <script>
    window.__ui5CoreReady = window.__ui5CoreReady || new Promise(resolve => {
      document.addEventListener("sap-ui-core-ready", resolve, { once: true });
    });
  </script>

  <style>
    #esm-errors {
      white-space: pre-wrap;
      color: #8a1313;
      font: 12px/1.5 monospace;
      margin: 0;
      padding: 12px;
      border-top: 1px solid #e0e0e0;
      background: #fff8f8;
    }
  </style>

</head>
<body class="sapUiBody">
  <div id="content"></div>
  <pre id="esm-errors"></pre>
  <script type="module" src="./bootstrap.js"></script>
</body>
</html>
`.trimStart();
}

function collectManifestPreloadModules(manifestConfig) {
  const preloadModules = new Set();
  const appConfig = manifestConfig?.["sap.app"];
  const ui5Config = manifestConfig?.["sap.ui5"];
  const modelConfigs = ui5Config?.models ?? {};
  const dataSources = appConfig?.dataSources ?? {};
  const routingConfig = ui5Config?.routing?.config;

  for (const modelConfig of Object.values(modelConfigs)) {
    const moduleName = inferManifestModelModule(modelConfig, dataSources);
    if (moduleName) {
      preloadModules.add(moduleName);
    }
  }

  addViewModule(preloadModules, ui5Config?.rootView?.type);
  addViewModule(preloadModules, routingConfig?.viewType);
  addClassModule(preloadModules, ui5Config?.routing?.config?.routerClass);

  return [...preloadModules].sort();
}

function collectBootstrapPreloadModules(manifestConfig, frameworkModuleNames) {
  const preloadModules = new Set(collectManifestPreloadModules(manifestConfig));

  preloadModules.add("sap/m/MessageBox");
  preloadModules.add("sap/ui/core/ComponentContainer");

  for (const moduleName of frameworkModuleNames ?? []) {
    preloadModules.add(moduleName);
  }

  return [...preloadModules].sort();
}

function inferManifestModelModule(modelConfig, dataSources) {
  if (typeof modelConfig === "string") {
    return inferManifestModelModule({ dataSource: modelConfig }, dataSources);
  }

  const explicitTypeModule = classNameToModuleName(modelConfig?.type);
  if (explicitTypeModule) {
    return explicitTypeModule;
  }

  if (!modelConfig?.dataSource) {
    return null;
  }

  const dataSource = dataSources?.[modelConfig.dataSource];
  if (!dataSource || typeof dataSource !== "object") {
    return null;
  }

  const dataSourceType = dataSource.type ?? "OData";
  if (dataSourceType === "OData") {
    const odataVersion = String(dataSource.settings?.odataVersion ?? modelConfig.settings?.odataVersion ?? "2.0");
    return odataVersion.startsWith("4")
      ? "sap/ui/model/odata/v4/ODataModel"
      : "sap/ui/model/odata/v2/ODataModel";
  }

  if (dataSourceType === "JSON") {
    return "sap/ui/model/json/JSONModel";
  }

  if (dataSourceType === "XML") {
    return "sap/ui/model/xml/XMLModel";
  }

  return null;
}

function addClassModule(target, className) {
  const moduleName = classNameToModuleName(className);
  if (moduleName) {
    target.add(moduleName);
  }
}

function addViewModule(target, viewType) {
  const moduleName = viewTypeToModuleName(viewType);
  if (moduleName) {
    target.add(moduleName);
  }
}

function classNameToModuleName(className) {
  if (typeof className !== "string" || !className.startsWith("sap.")) {
    return null;
  }

  return className.replaceAll(".", "/");
}

function viewTypeToModuleName(viewType) {
  switch (String(viewType ?? "").toUpperCase()) {
    case "HTML":
      return "sap/ui/core/mvc/HTMLView";
    case "JS":
      return "sap/ui/core/mvc/JSView";
    case "JSON":
      return "sap/ui/core/mvc/JSONView";
    case "TEMPLATE":
      return "sap/ui/core/mvc/TemplateView";
    case "XML":
      return "sap/ui/core/mvc/XMLView";
    default:
      return null;
  }
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

async function collectAppModuleSources() {
  const moduleSources = new Map();

  await addAppModuleSources(moduleSources, webappRoot);
  await addAppModuleSources(moduleSources, overlayRoot);

  return moduleSources;
}

async function collectRuntimeControllerModulePaths(appModuleSources, appNamespace) {
  const controllerModulePaths = new Set();

  for (const relativePath of await collectXmlControllerModulePaths(appNamespace)) {
    addControllerModulePath(controllerModulePaths, appModuleSources, relativePath);
  }

  for (const sourcePath of appModuleSources.values()) {
    const sourceText = await readFile(sourcePath, "utf8");
    for (const relativePath of collectExplicitRuntimeModulePaths(sourceText, appNamespace)) {
      addControllerModulePath(controllerModulePaths, appModuleSources, relativePath);
    }
  }

  return [...controllerModulePaths].sort();
}

async function collectXmlControllerModulePaths(appNamespace) {
  const modulePaths = new Set();

  for (const sourcePath of await listFiles(targetRoot)) {
    if (!sourcePath.endsWith(".xml")) {
      continue;
    }

    const xmlText = await readFile(sourcePath, "utf8");
    for (const controllerName of collectXmlAttributeValues(xmlText, "controllerName")) {
      const relativePath = controllerNameToRelativePath(controllerName, appNamespace);
      if (relativePath) {
        modulePaths.add(relativePath);
      }
    }
  }

  return [...modulePaths].sort();
}

function collectExplicitRuntimeModulePaths(sourceText, appNamespace) {
  const modulePaths = new Set();

  for (const pattern of [
    /Controller\.create\(\s*\{[\s\S]*?name\s*:\s*["']([^"']+)["']/g,
    /sap\.ui\.controller\(\s*["']([^"']+)["']/g,
  ]) {
    for (const match of sourceText.matchAll(pattern)) {
      const relativePath = controllerNameToRelativePath(match[1], appNamespace);
      if (relativePath) {
        modulePaths.add(relativePath);
      }
    }
  }

  return [...modulePaths].sort();
}

function collectXmlAttributeValues(sourceText, attributeName) {
  const attributeValues = [];
  const pattern = new RegExp(`${attributeName}\\s*=\\s*["']([^"']+)["']`, "g");

  for (const match of sourceText.matchAll(pattern)) {
    attributeValues.push(match[1]);
  }

  return attributeValues;
}

function addControllerModulePath(controllerModulePaths, appModuleSources, relativePath) {
  if (appModuleSources.has(relativePath)) {
    controllerModulePaths.add(relativePath);
  }
}

function buildControllerModuleImportPaths(controllerModulePaths, appNamespace) {
  const controllerModuleImportPaths = {};

  for (const relativePath of controllerModulePaths) {
    const importPath = toModuleImport(path.join(esmModuleDirName, relativePath));
    for (const controllerName of controllerRelativePathToNames(relativePath, appNamespace)) {
      controllerModuleImportPaths[controllerName] = importPath;
    }
  }

  return controllerModuleImportPaths;
}

function buildComponentModuleImportPaths(appNamespace) {
  if (!appNamespace) {
    return {};
  }

  const componentModuleName = `${appNamespace.replaceAll(".", "/")}/Component`;
  const componentImportPath = toModuleImport(path.join(esmModuleDirName, "Component.js"));

  return {
    [componentModuleName]: componentImportPath,
    [`module:${componentModuleName}`]: componentImportPath,
  };
}

function buildComponentPreloadModulePaths(appModuleSources) {
  return [...appModuleSources.keys()]
    .sort()
    .map(relativePath => toModuleImport(path.join(esmModuleDirName, relativePath)));
}

async function collectComponentPreloadResourcePaths() {
  const resourcePaths = [];

  for (const sourcePath of await listFiles(targetRoot)) {
    const relativePath = toPosixRelative(targetRoot, sourcePath);
    if (shouldIncludeComponentPreloadResource(relativePath)) {
      resourcePaths.push(toModuleImport(relativePath));
    }
  }

  return resourcePaths.sort();
}

function shouldIncludeComponentPreloadResource(relativePath) {
  if (relativePath.startsWith(`${esmModuleDirName}/`) || relativePath.startsWith("framework/") || relativePath.startsWith("test/")) {
    return false;
  }

  if (relativePath === "Component-preload.js" || relativePath === "index-esm.html") {
    return false;
  }

  if (relativePath === "manifest.json" || relativePath === "localService/metadata.xml") {
    return true;
  }

  if (relativePath.startsWith("i18n/") && relativePath.endsWith(".properties")) {
    return true;
  }

  if (relativePath.startsWith("view/") && relativePath.endsWith(".xml")) {
    return true;
  }

  return false;
}

function controllerRelativePathToNames(relativePath, appNamespace) {
  if (typeof relativePath !== "string" || !relativePath.startsWith("controller/") || !relativePath.endsWith(".controller.js")) {
    return [];
  }

  if (!appNamespace) {
    return [];
  }

  const controllerSuffix = relativePath
    .slice("controller/".length, -".controller.js".length)
    .replaceAll("/", ".");
  const dottedName = `${appNamespace}.controller.${controllerSuffix}`;
  const moduleName = `${appNamespace.replaceAll(".", "/")}/controller/${controllerSuffix.replaceAll(".", "/")}.controller`;

  return [dottedName, moduleName, `module:${moduleName}`];
}

function controllerNameToRelativePath(controllerName, appNamespace) {
  if (typeof controllerName !== "string") {
    return null;
  }

  if (controllerName.startsWith("module:")) {
    const modulePath = trimAppNamespaceFromModulePath(controllerName.slice("module:".length), appNamespace);
    if (!modulePath) {
      return null;
    }

    return modulePath.endsWith(".js") ? modulePath : `${modulePath}.js`;
  }

  const namespacePrefix = appNamespace ? `${appNamespace}.` : "";
  if (namespacePrefix && !controllerName.startsWith(namespacePrefix)) {
    return null;
  }

  const localControllerName = namespacePrefix
    ? controllerName.slice(namespacePrefix.length)
    : controllerName;

  if (!localControllerName.startsWith("controller.")) {
    return null;
  }

  const controllerPath = localControllerName.slice("controller.".length).replaceAll(".", "/");
  return `controller/${controllerPath}.controller.js`;
}

function trimAppNamespaceFromModulePath(modulePath, appNamespace) {
  if (!appNamespace) {
    return modulePath;
  }

  const namespacePath = appNamespace.replaceAll(".", "/");
  if (modulePath.startsWith(`${namespacePath}/`)) {
    return modulePath.slice(namespacePath.length + 1);
  }

  return null;
}

async function addAppModuleSources(moduleSources, rootDir) {
  const files = await listFiles(rootDir);

  for (const sourcePath of files) {
    const relativePath = toPosixRelative(rootDir, sourcePath);
    if (!shouldIncludeAppModule(relativePath)) {
      continue;
    }

    moduleSources.set(relativePath, sourcePath);
  }
}

async function copyStaticAssets(fromDir, toDir, includeFile) {
  const files = await listFiles(fromDir);

  for (const sourcePath of files) {
    const relativePath = toPosixRelative(fromDir, sourcePath);
    if (!includeFile(relativePath)) {
      continue;
    }

    const targetPath = path.join(toDir, relativePath);
    await ensureParentDir(targetPath);
    await cp(sourcePath, targetPath);
  }
}

async function ensureParentDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function safeRemove(filePath) {
  await rm(filePath, { force: true, recursive: true });
}

function shouldCopyWebappAsset(relativePath) {
  if (relativePath === "index.html" || relativePath === "test.html") {
    return false;
  }

  return !relativePath.endsWith(".js");
}

function shouldCopyOverlayAsset(relativePath) {
  if (relativePath === "index-esm.html") {
    return false;
  }

  return !relativePath.endsWith(".js");
}

function shouldIncludeAppModule(relativePath) {
  if (!relativePath.endsWith(".js")) {
    return false;
  }

  if (relativePath.startsWith("test/")) {
    return false;
  }

  return relativePath !== "esm-helpers.js"
    && relativePath !== "initMockServer.js"
    && relativePath !== "resources/esm-bridge.js";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function toModuleImport(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function toPosixRelative(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

function log(message) {
  console.log(`[bridge-free-source] ${message}`);
}