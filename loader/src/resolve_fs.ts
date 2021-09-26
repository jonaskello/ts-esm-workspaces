const {
  emitLegacyIndexDeprecation,
  getConditionsSet,
  getPackageConfig,
  getPackageScopeConfig,
  shouldBeTreatedAsRelativeOrAbsolutePath,
  resolveAsCommonJS,
  packageImportsResolve,
  packageExportsResolve,
  parsePackageName,
  getPackageType,
} = require("./resolve_nofs");

// "use strict";

export const foo = 42;

const {
  ArrayIsArray,
  ArrayPrototypeJoin,
  ArrayPrototypeShift,
  JSONParse,
  JSONStringify,
  ObjectFreeze,
  ObjectGetOwnPropertyNames,
  ObjectPrototypeHasOwnProperty,
  // RegExp,
  RegExpPrototypeSymbolReplace,
  RegExpPrototypeTest,
  SafeMap,
  SafeSet,
  // String,
  StringPrototypeEndsWith,
  StringPrototypeIncludes,
  StringPrototypeIndexOf,
  StringPrototypeLastIndexOf,
  StringPrototypeSlice,
  StringPrototypeSplit,
  StringPrototypeStartsWith,
} = require("../support/node-primordials");
// const internalFS = require("internal/fs/utils");
// const { NativeModule } = require("internal/bootstrap/loaders");
const Module = require("module");
const NativeModule = {
  canBeRequiredByUsers(specifier) {
    return Module.builtinModules.includes(specifier);
  },
};
const { realpathSync, statSync, Stats } = require("fs");
const { getOptionValue } = require("../support/node-options");
// Do not eagerly grab .manifest, it may be in TDZ
const policy = getOptionValue("--experimental-policy")
  ? require("internal/process/policy")
  : null;
const { sep, relative, resolve } = require("path");
const preserveSymlinks = getOptionValue("--preserve-symlinks");
const preserveSymlinksMain = getOptionValue("--preserve-symlinks-main");
const typeFlag = getOptionValue("--input-type");
const pendingDeprecation = getOptionValue("--pending-deprecation");
const { URL, pathToFileURL, fileURLToPath } = require("url");
const {
  ERR_INPUT_TYPE_NOT_ALLOWED,
  ERR_INVALID_ARG_VALUE,
  ERR_INVALID_MODULE_SPECIFIER,
  ERR_INVALID_PACKAGE_CONFIG,
  ERR_INVALID_PACKAGE_TARGET,
  ERR_MANIFEST_DEPENDENCY_MISSING,
  ERR_MODULE_NOT_FOUND,
  ERR_PACKAGE_IMPORT_NOT_DEFINED,
  ERR_PACKAGE_PATH_NOT_EXPORTED,
  ERR_UNSUPPORTED_DIR_IMPORT,
  ERR_UNSUPPORTED_ESM_URL_SCHEME,
} = require("../support/node-errors").codes;
// const { Module: CJSModule } = require("internal/modules/cjs/loader");
const CJSModule = Module;

const packageJsonReader = require("../support/node-package-json-reader.js");
const userConditions = getOptionValue("--conditions");
const noAddons = getOptionValue("--no-addons");
const addonConditions = noAddons ? [] : ["node-addons"];

const DEFAULT_CONDITIONS = ObjectFreeze([
  "node",
  "import",
  ...addonConditions,
  ...userConditions,
]);

/**
 * @typedef {string | string[] | Record<string, unknown>} Exports
 * @typedef {'module' | 'commonjs'} PackageType
 * @typedef {{
 *   exports?: ExportConfig;
 *   name?: string;
 *   main?: string;
 *   type?: PackageType;
 * }} PackageConfig
 */

/**
 * @param {string | URL} path
 * @returns {import('fs').Stats}
 */
const tryStatSync = (path) =>
  statSync(path, { throwIfNoEntry: false }) ?? new Stats();

/**
 * @param {string | URL} url
 * @returns {boolean}
 */
function fileExists(url) {
  return statSync(url, { throwIfNoEntry: false })?.isFile() ?? false;
}

/**
 * Legacy CommonJS main resolution:
 * 1. let M = pkg_url + (json main field)
 * 2. TRY(M, M.js, M.json, M.node)
 * 3. TRY(M/index.js, M/index.json, M/index.node)
 * 4. TRY(pkg_url/index.js, pkg_url/index.json, pkg_url/index.node)
 * 5. NOT_FOUND
 * @param {URL} packageJSONUrl
 * @param {PackageConfig} packageConfig
 * @param {string | URL | undefined} base
 * @returns {URL}
 */
function legacyMainResolve(packageJSONUrl, packageConfig, base) {
  let guess;
  if (packageConfig.main !== undefined) {
    // Note: fs check redundances will be handled by Descriptor cache here.
    if (
      fileExists((guess = new URL(`./${packageConfig.main}`, packageJSONUrl)))
    ) {
      return guess;
    } else if (
      fileExists(
        (guess = new URL(`./${packageConfig.main}.js`, packageJSONUrl))
      )
    ) {
    } else if (
      fileExists(
        (guess = new URL(`./${packageConfig.main}.json`, packageJSONUrl))
      )
    ) {
    } else if (
      fileExists(
        (guess = new URL(`./${packageConfig.main}.node`, packageJSONUrl))
      )
    ) {
    } else if (
      fileExists(
        (guess = new URL(`./${packageConfig.main}/index.js`, packageJSONUrl))
      )
    ) {
    } else if (
      fileExists(
        (guess = new URL(`./${packageConfig.main}/index.json`, packageJSONUrl))
      )
    ) {
    } else if (
      fileExists(
        (guess = new URL(`./${packageConfig.main}/index.node`, packageJSONUrl))
      )
    ) {
    } else guess = undefined;
    if (guess) {
      emitLegacyIndexDeprecation(
        guess,
        packageJSONUrl,
        base,
        packageConfig.main
      );
      return guess;
    }
    // Fallthrough.
  }
  if (fileExists((guess = new URL("./index.js", packageJSONUrl)))) {
  } else if (fileExists((guess = new URL("./index.json", packageJSONUrl)))) {
  } else if (fileExists((guess = new URL("./index.node", packageJSONUrl)))) {
  } else guess = undefined;
  if (guess) {
    emitLegacyIndexDeprecation(guess, packageJSONUrl, base, packageConfig.main);
    return guess;
  }
  // Not found.
  throw new ERR_MODULE_NOT_FOUND(
    fileURLToPath(new URL(".", packageJSONUrl)),
    fileURLToPath(base)
  );
}

/**
 * @param {URL} search
 * @returns {URL | undefined}
 */
function resolveExtensionsWithTryExactName(search) {
  if (fileExists(search)) return search;
  return resolveExtensions(search);
}

const extensions = [".js", ".json", ".node", ".mjs"];

/**
 * @param {URL} search
 * @returns {URL | undefined}
 */
function resolveExtensions(search) {
  for (let i = 0; i < extensions.length; i++) {
    const extension = extensions[i];
    const guess = new URL(`${search.pathname}${extension}`, search);
    if (fileExists(guess)) return guess;
  }
  return undefined;
}

/**
 * @param {URL} search
 * @returns {URL | undefined}
 */
function resolveDirectoryEntry(search) {
  const dirPath = fileURLToPath(search);
  const pkgJsonPath = resolve(dirPath, "package.json");
  if (fileExists(pkgJsonPath)) {
    const pkgJson = packageJsonReader.read(pkgJsonPath);
    if (pkgJson.containsKeys) {
      const { main } = JSONParse(pkgJson.string);
      if (main != null) {
        const mainUrl = pathToFileURL(resolve(dirPath, main));
        return resolveExtensionsWithTryExactName(mainUrl);
      }
    }
  }
  return resolveExtensions(new URL("index", search));
}

const encodedSepRegEx = /%2F|%2C/i;
/**
 * @param {URL} resolved
 * @param {string | URL | undefined} base
 * @returns {URL | undefined}
 */
function finalizeResolution(resolved, base) {
  console.log(
    "finalizeResolutionfinalizeResolutionfinalizeResolution-->",
    typeof resolved
  );
  if (RegExpPrototypeTest(encodedSepRegEx, resolved.pathname))
    throw new ERR_INVALID_MODULE_SPECIFIER(
      resolved.pathname,
      'must not include encoded "/" or "\\" characters',
      fileURLToPath(base)
    );

  const path = fileURLToPath(resolved);
  if (getOptionValue("--experimental-specifier-resolution") === "node") {
    let file = resolveExtensionsWithTryExactName(resolved);
    if (file !== undefined) return file;
    if (!StringPrototypeEndsWith(path, "/")) {
      file = resolveDirectoryEntry(new URL(`${resolved}/`));
      if (file !== undefined) return file;
    } else {
      return resolveDirectoryEntry(resolved) || resolved;
    }
    throw new ERR_MODULE_NOT_FOUND(
      resolved.pathname,
      fileURLToPath(base),
      "module"
    );
  }

  const stats = tryStatSync(
    StringPrototypeEndsWith(path, "/") ? StringPrototypeSlice(path, -1) : path
  );
  if (stats.isDirectory()) {
    const err = new ERR_UNSUPPORTED_DIR_IMPORT(path, fileURLToPath(base));
    err.url = String(resolved);
    throw err;
  } else if (!stats.isFile()) {
    throw new ERR_MODULE_NOT_FOUND(
      path || resolved.pathname,
      base && fileURLToPath(base),
      "module"
    );
  }

  return resolved;
}

/**
 * @param {string} specifier
 * @param {string | URL | undefined} base
 * @param {Set<string>} conditions
 * @returns {URL}
 */
function packageResolve(specifier, base, conditions) {
  const { packageName, packageSubpath, isScoped } = parsePackageName(
    specifier,
    base
  );

  // ResolveSelf
  const packageConfig = getPackageScopeConfig(base);
  if (packageConfig.exists) {
    const packageJSONUrl = pathToFileURL(packageConfig.pjsonPath);
    if (
      packageConfig.name === packageName &&
      packageConfig.exports !== undefined &&
      packageConfig.exports !== null
    ) {
      return packageExportsResolve(
        packageResolve,
        packageJSONUrl,
        packageSubpath,
        packageConfig,
        base,
        conditions
      ).resolved;
    }
  }

  let packageJSONUrl = new URL(
    "./node_modules/" + packageName + "/package.json",
    base
  );
  let packageJSONPath = fileURLToPath(packageJSONUrl);
  let lastPath;
  do {
    const stat = tryStatSync(
      StringPrototypeSlice(packageJSONPath, 0, packageJSONPath.length - 13)
    );
    if (!stat.isDirectory()) {
      lastPath = packageJSONPath;
      packageJSONUrl = new URL(
        (isScoped ? "../../../../node_modules/" : "../../../node_modules/") +
          packageName +
          "/package.json",
        packageJSONUrl
      );
      packageJSONPath = fileURLToPath(packageJSONUrl);
      continue;
    }

    // Package match.
    const packageConfig = getPackageConfig(packageJSONPath, specifier, base);
    if (packageConfig.exports !== undefined && packageConfig.exports !== null)
      return packageExportsResolve(
        packageResolve,
        packageJSONUrl,
        packageSubpath,
        packageConfig,
        base,
        conditions
      ).resolved;
    if (packageSubpath === ".")
      return legacyMainResolve(packageJSONUrl, packageConfig, base);
    return new URL(packageSubpath, packageJSONUrl);
    // Cross-platform root check.
  } while (packageJSONPath.length !== lastPath.length);

  // eslint can't handle the above code.
  // eslint-disable-next-line no-unreachable
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base));
}

/**
 * @param {string} specifier
 * @param {string | URL | undefined} base
 * @param {Set<string>} conditions
 * @returns {URL}
 */
function defaultModuleResolve(specifier, base, conditions) {
  // Order swapped from spec for minor perf gain.
  // Ok since relative URLs cannot parse as URLs.
  let resolved;
  if (shouldBeTreatedAsRelativeOrAbsolutePath(specifier)) {
    resolved = new URL(specifier, base);
  } else if (specifier[0] === "#") {
    ({ resolved } = packageImportsResolve(
      packageResolve,
      specifier,
      base,
      conditions
    )!);
  } else {
    try {
      resolved = new URL(specifier);
    } catch {
      resolved = packageResolve(specifier, base, conditions);
    }
  }
  return finalizeResolution(resolved, base);
}

function defaultResolveApi(
  specifier,
  context: any = {},
  moduleResolve = defaultModuleResolve
) {
  let { parentURL, conditions } = context;
  if (parentURL && policy?.manifest) {
    const redirects = policy.manifest.getDependencyMapper(parentURL);
    if (redirects) {
      const { resolve, reaction } = redirects;
      const destination = resolve(specifier, new SafeSet(conditions));
      let missing = true;
      if (destination === true) {
        missing = false;
      } else if (destination) {
        const href = destination.href;
        return { url: href };
      }
      if (missing) {
        reaction(
          new ERR_MANIFEST_DEPENDENCY_MISSING(
            parentURL,
            specifier,
            ArrayPrototypeJoin([...conditions], ", ")
          )
        );
      }
    }
  }
  let parsed;
  try {
    parsed = new URL(specifier);
    if (parsed.protocol === "data:") {
      return {
        url: specifier,
      };
    }
  } catch {}
  if (parsed && parsed.protocol === "node:") return { url: specifier };
  if (parsed && parsed.protocol !== "file:" && parsed.protocol !== "data:")
    throw new ERR_UNSUPPORTED_ESM_URL_SCHEME(parsed);
  if (NativeModule.canBeRequiredByUsers(specifier)) {
    return {
      url: "node:" + specifier,
    };
  }
  if (parentURL && StringPrototypeStartsWith(parentURL, "data:")) {
    // This is gonna blow up, we want the error
    new URL(specifier, parentURL);
  }

  const isMain = parentURL === undefined;
  if (isMain) {
    parentURL = pathToFileURL(`${process.cwd()}/`).href;

    // This is the initial entry point to the program, and --input-type has
    // been passed as an option; but --input-type can only be used with
    // --eval, --print or STDIN string input. It is not allowed with file
    // input, to avoid user confusion over how expansive the effect of the
    // flag should be (i.e. entry point only, package scope surrounding the
    // entry point, etc.).
    if (typeFlag) throw new ERR_INPUT_TYPE_NOT_ALLOWED();
  }

  conditions = getConditionsSet(conditions);
  let url;
  try {
    url = moduleResolve(specifier, parentURL, conditions);
  } catch (error: any) {
    // Try to give the user a hint of what would have been the
    // resolved CommonJS module
    if (
      error.code === "ERR_MODULE_NOT_FOUND" ||
      error.code === "ERR_UNSUPPORTED_DIR_IMPORT"
    ) {
      if (StringPrototypeStartsWith(specifier, "file://")) {
        specifier = fileURLToPath(specifier);
      }
      const found = resolveAsCommonJS(specifier, parentURL);
      if (found) {
        // Modify the stack and message string to include the hint
        const lines = StringPrototypeSplit(error.stack, "\n");
        const hint = `Did you mean to import ${found}?`;
        error.stack =
          ArrayPrototypeShift(lines) +
          "\n" +
          hint +
          "\n" +
          ArrayPrototypeJoin(lines, "\n");
        error.message += `\n${hint}`;
      }
    }
    throw error;
  }

  if (isMain ? !preserveSymlinksMain : !preserveSymlinks) {
    const urlPath = fileURLToPath(url);
    const real = realpathSync(urlPath, {
      //   [internalFS.realpathCacheKey]: realpathCache,
    });
    const old = url;
    url = pathToFileURL(
      real + (StringPrototypeEndsWith(urlPath, sep) ? "/" : "")
    );
    url.search = old.search;
    url.hash = old.hash;
  }

  return { url: `${url}` };
}

module.exports = {
  DEFAULT_CONDITIONS,
  defaultResolveApi,
  encodedSepRegEx,
  getPackageScopeConfig,
  getPackageType,
  // packageExportsResolve,
  // packageImportsResolve,
  finalizeResolution,
};

// cycle
const { defaultGetFormat } = require("../support/get_format");
