function getHostGlobal() {
  return globalThis.window ?? globalThis;
}

function getUi5Global() {
  const ui5Global = getHostGlobal();
  if (!ui5Global.sap?.ui) {
    throw new Error("UI5 runtime is not available on globalThis.sap.ui");
  }

  return ui5Global;
}

const ui5ModuleImportUrls = new Map();
const ui5ModuleImportExports = new Map();
const ui5ModuleImportPromises = new Map();
let ui5ModuleImportHookInstallation = null;
let ui5BootstrapResourceConfig = null;

export function isUi5CoreReady() {
  const ui5Global = getHostGlobal();
  return !!ui5Global.sap?.ui?.getCore?.().isInitialized?.();
}

export async function waitForUi5CoreReady() {
  if (isUi5CoreReady()) {
    return;
  }

  const ui5Global = getHostGlobal();
  const documentRef = ui5Global.document;
  if (!documentRef) {
    throw new Error("UI5 core is not ready and no document is available to await sap-ui-core-ready");
  }

  await new Promise((resolve) => {
    let isSettled = false;
    const complete = () => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      documentRef.removeEventListener("sap-ui-core-ready", onCoreReady);
      clearInterval(readinessPoll);
      resolve();
    };

    const onCoreReady = () => {
      complete();
    };

    documentRef.addEventListener("sap-ui-core-ready", onCoreReady, { once: true });

    const coreReadyPromise = ui5Global.__ui5CoreReady;
    if (coreReadyPromise && typeof coreReadyPromise.then === "function") {
      coreReadyPromise.then(complete, complete);
    }

    const readinessPoll = setInterval(() => {
      if (isUi5CoreReady()) {
        complete();
      }
    }, 10);

    if (isUi5CoreReady()) {
      complete();
    }
  });
}

export function resolveUi5ResourceUrl(resourceName) {
  const normalizedResourceName = normalizeUi5ModuleName(resourceName);
  if (!normalizedResourceName) {
    return resourceName;
  }

  const { resourceRoots, resourcesBaseUrl } = getUi5BootstrapResourceConfig();

  for (const [namespacePath, resourceRootUrl] of resourceRoots) {
    if (normalizedResourceName !== namespacePath && !normalizedResourceName.startsWith(`${namespacePath}/`)) {
      continue;
    }

    const relativePath = normalizedResourceName === namespacePath
      ? ""
      : normalizedResourceName.slice(namespacePath.length + 1);
    return new URL(relativePath, resourceRootUrl).href;
  }

  return new URL(normalizedResourceName, resourcesBaseUrl).href;
}

export function createUi5NamespaceFacade(moduleName) {
  const facadeTarget = function ui5NamespaceFacade(...args) {
    return Reflect.apply(resolveUi5GlobalExport(moduleName), this, args);
  };

  return new Proxy(facadeTarget, {
    apply(_target, thisArg, argArray) {
      return Reflect.apply(resolveUi5GlobalExport(moduleName), thisArg, argArray);
    },
    construct(_target, argArray, newTarget) {
      const actualExport = resolveUi5GlobalExport(moduleName);
      return Reflect.construct(actualExport, argArray, newTarget === facadeTarget ? actualExport : newTarget);
    },
    get(_target, propertyKey) {
      const actualExport = resolveUi5GlobalExport(moduleName);
      const propertyValue = Reflect.get(actualExport, propertyKey, actualExport);

      if (typeof propertyValue === "function" && propertyKey !== "prototype") {
        return propertyValue.bind(actualExport);
      }

      return propertyValue;
    },
    getOwnPropertyDescriptor(_target, propertyKey) {
      return Object.getOwnPropertyDescriptor(resolveUi5GlobalExport(moduleName), propertyKey);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(resolveUi5GlobalExport(moduleName));
    },
    has(_target, propertyKey) {
      return propertyKey in resolveUi5GlobalExport(moduleName);
    },
    ownKeys() {
      return Reflect.ownKeys(resolveUi5GlobalExport(moduleName));
    },
    set(_target, propertyKey, value) {
      return Reflect.set(resolveUi5GlobalExport(moduleName), propertyKey, value);
    },
  });
}

export async function loadUi5Module(moduleName) {
  await waitForUi5CoreReady();
  const ui5Global = getUi5Global();

  return await new Promise((resolve, reject) => {
    ui5Global.sap.ui.require([moduleName], resolve, reject);
  });
}

export async function loadUi5Modules(...moduleNames) {
  await waitForUi5CoreReady();
  const ui5Global = getUi5Global();

  return await new Promise((resolve, reject) => {
    ui5Global.sap.ui.require(moduleNames, (...modules) => resolve(modules), reject);
  });
}

export async function installUi5ModuleImportHook(moduleImportUrls) {
  for (const [moduleName, moduleUrl] of Object.entries(moduleImportUrls ?? {})) {
    const normalizedModuleName = normalizeUi5ModuleName(moduleName);
    if (normalizedModuleName && typeof moduleUrl === "string") {
      ui5ModuleImportUrls.set(normalizedModuleName, moduleUrl);
    }
  }

  if (ui5ModuleImportUrls.size === 0) {
    return;
  }

  if (!ui5ModuleImportHookInstallation) {
    ui5ModuleImportHookInstallation = patchUi5Require();
  }

  await ui5ModuleImportHookInstallation;
}

async function patchUi5Require() {
  await waitForUi5CoreReady();

  const sapUi = getUi5Global().sap.ui;
  if (sapUi.__esmModuleImportHookInstalled) {
    return sapUi.require;
  }

  const originalRequire = sapUi.require;
  const patchedRequire = function(dependencies, onSuccess, onError) {
    if (typeof dependencies === "string") {
      const normalizedModuleName = normalizeUi5ModuleName(dependencies);
      if (normalizedModuleName && ui5ModuleImportExports.has(normalizedModuleName)) {
        return ui5ModuleImportExports.get(normalizedModuleName);
      }

      return originalRequire.call(sapUi, dependencies);
    }

    if (!Array.isArray(dependencies) || dependencies.length === 0 || !dependencies.some(hasMappedUi5Module)) {
      return originalRequire.call(sapUi, dependencies, onSuccess, onError);
    }

    Promise.all(dependencies.map((moduleName) => loadMappedUi5Dependency(sapUi, originalRequire, moduleName))).then(
      (modules) => {
        if (typeof onSuccess === "function") {
          onSuccess(...modules);
        }
      },
      (error) => {
        if (typeof onError === "function") {
          onError(error);
          return;
        }

        getHostGlobal().console?.error?.(error);
      },
    );

    return undefined;
  };

  copyFunctionProperties(originalRequire, patchedRequire);
  sapUi.require = patchedRequire;

  Object.defineProperty(sapUi, "__esmModuleImportHookInstalled", {
    configurable: true,
    value: true,
  });

  return patchedRequire;
}

function hasMappedUi5Module(moduleName) {
  return !!resolveMappedUi5ModuleUrl(moduleName);
}

function resolveUi5GlobalExport(moduleName) {
  const normalizedModuleName = normalizeUi5ModuleName(moduleName);
  if (!normalizedModuleName) {
    throw new Error(`Cannot resolve invalid UI5 module name ${String(moduleName)}`);
  }

  let currentValue = getHostGlobal();
  for (const segment of normalizedModuleName.split("/")) {
    currentValue = currentValue?.[segment];
  }

  if (currentValue == null) {
    throw new Error(
      `UI5 namespace export ${normalizedModuleName} is not available on globalThis; preload the module before using the facade`,
    );
  }

  return currentValue;
}

function getUi5BootstrapResourceConfig() {
  if (ui5BootstrapResourceConfig) {
    return ui5BootstrapResourceConfig;
  }

  const ui5Global = getHostGlobal();
  const documentRef = ui5Global.document;
  const documentBaseUrl = documentRef?.baseURI ?? ui5Global.location?.href;
  if (!documentBaseUrl) {
    throw new Error("Cannot resolve UI5 resource URLs without a document base URL");
  }

  const bootstrapScript = documentRef?.getElementById?.("sap-ui-bootstrap");
  const bootstrapScriptUrl = bootstrapScript?.src ?? null;
  const resourcesBaseUrl = ensureTrailingSlashUrl(
    bootstrapScriptUrl ? new URL("./", bootstrapScriptUrl).href : documentBaseUrl,
  );
  const resourceRoots = [];
  const rawResourceRoots = bootstrapScript?.getAttribute?.("data-sap-ui-resource-roots");
  if (rawResourceRoots) {
    try {
      const parsedResourceRoots = JSON.parse(rawResourceRoots);
      for (const [namespace, rootPath] of Object.entries(parsedResourceRoots ?? {})) {
        if (typeof namespace !== "string" || typeof rootPath !== "string") {
          continue;
        }

        resourceRoots.push([
          namespace.replaceAll(".", "/"),
          ensureTrailingSlashUrl(new URL(rootPath, documentBaseUrl).href),
        ]);
      }

      resourceRoots.sort((left, right) => right[0].length - left[0].length);
    } catch (error) {
      ui5Global.console?.warn?.("[bridge-free-source] Failed to parse data-sap-ui-resource-roots", error);
    }
  }

  ui5BootstrapResourceConfig = {
    resourceRoots,
    resourcesBaseUrl,
  };
  return ui5BootstrapResourceConfig;
}

async function loadMappedUi5Dependency(sapUi, originalRequire, moduleName) {
  const normalizedModuleName = normalizeUi5ModuleName(moduleName);
  const moduleUrl = resolveMappedUi5ModuleUrl(moduleName);

  if (!normalizedModuleName || !moduleUrl) {
    return await new Promise((resolve, reject) => {
      originalRequire.call(sapUi, [moduleName], resolve, reject);
    });
  }

  if (ui5ModuleImportExports.has(normalizedModuleName)) {
    return ui5ModuleImportExports.get(normalizedModuleName);
  }

  let importPromise = ui5ModuleImportPromises.get(normalizedModuleName);
  if (!importPromise) {
    importPromise = import(moduleUrl).then((moduleNamespace) => {
      const moduleValue = moduleNamespace?.default ?? moduleNamespace;
      ui5ModuleImportExports.set(normalizedModuleName, moduleValue);
      return moduleValue;
    }).catch((error) => {
      ui5ModuleImportPromises.delete(normalizedModuleName);
      throw new Error(`Failed to import ESM UI5 module ${moduleName} from ${moduleUrl}: ${error instanceof Error ? error.message : String(error)}`);
    });

    ui5ModuleImportPromises.set(normalizedModuleName, importPromise);
  }

  return await importPromise;
}

function resolveMappedUi5ModuleUrl(moduleName) {
  const normalizedModuleName = normalizeUi5ModuleName(moduleName);
  if (!normalizedModuleName) {
    return null;
  }

  return ui5ModuleImportUrls.get(normalizedModuleName) ?? null;
}

function normalizeUi5ModuleName(moduleName) {
  if (typeof moduleName !== "string" || moduleName.length === 0) {
    return null;
  }

  return moduleName.startsWith("module:")
    ? moduleName.slice("module:".length)
    : moduleName;
}

function ensureTrailingSlashUrl(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function copyFunctionProperties(sourceFunction, targetFunction) {
  for (const propertyKey of Reflect.ownKeys(sourceFunction)) {
    if (propertyKey === "length" || propertyKey === "name" || propertyKey === "prototype") {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(sourceFunction, propertyKey);
    if (descriptor) {
      Object.defineProperty(targetFunction, propertyKey, descriptor);
    }
  }
}