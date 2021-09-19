import { URL, pathToFileURL, fileURLToPath } from "url";
import fs from "fs";
const { statSync, Stats } = require("fs");

const {
  emitLegacyIndexDeprecation,
  getPackageConfig,
  getPackageScopeConfig,
  shouldBeTreatedAsRelativeOrAbsolutePath,
  packageImportsResolve,
  packageExportsResolve,
  parsePackageName,
  getConditionsSet,
} = require("./resolve_nofs");

const { finalizeResolution, ERR_MODULE_NOT_FOUND } = require("./resolve_fs");

export function resolve(specifier, context, defaultResolve) {
  console.log("RESOLVE: START");

  // Let node handle `data:` and `node:` prefix etc.
  const excludeRegex = /^\w+:/;
  if (excludeRegex.test(specifier)) {
    return defaultResolve(specifier, context, defaultResolve);
  }

  // If file ends in .ts then just return it
  // This can only happen for the entry file as typescript does not allow
  // import of .ts files
  let { parentURL, conditions } = context;
  if (isTypescriptFile(specifier)) {
    const url = new URL(specifier, parentURL).href;
    return { url };
  }

  conditions = getConditionsSet(conditions);
  const url = myModuleResolve(specifier, parentURL, conditions);

  return { url: `${url}` };
}

/**
 * @param {string} specifier
 * @param {string | URL | undefined} base
 * @param {Set<string>} conditions
 * @returns {URL}
 */
function myModuleResolve(specifier, base, conditions) {
  console.log("myModuleResolve: START");

  // Order swapped from spec for minor perf gain.
  // Ok since relative URLs cannot parse as URLs.
  let resolved;
  if (shouldBeTreatedAsRelativeOrAbsolutePath(specifier)) {
    console.log("myModuleResolve: resolveFilePath");
    resolved = new URL(specifier, base);
    // resolved = resolveFilePath(specifier, base);
  } else if (specifier[0] === "#") {
    console.log("myModuleResolve: packageImportsResolve");
    ({ resolved } = packageImportsResolve(
      packageResolve,
      specifier,
      base,
      conditions
    )!);
  } else {
    console.log("myModuleResolve: else");
    try {
      resolved = new URL(specifier);
    } catch {
      console.log("myModuleResolve: packageResolve");
      resolved = packageResolve(specifier, base, conditions)[0];
      console.log("myModuleResolve: packageResolve RETURN", resolved);
    }
  }
  console.log("myModuleResolve: END", resolved.href);

  // Now we should have resolved to an URL with file-path (eg. foo.js),
  // It could also be to resolved to an extensionless file at this point...
  // We should check if
  // the resolved file is in the output space of the tsconfig used.
  // If it is we need to map it back to the typescript file that will compile to the resolved file
  // and resolve to that file instead

  // Cannot be a .ts file since that case only exists for the entry file and is handled directly in resolve()
  // Do we want to support extensionless files? In that case we need to check if it is
  // a directory or file... Typescript always outputs .js files so we could just add that?
  resolved = translateJsUrlBackToTypescriptUrl(resolved);

  // finalizeResolution checks for old file endings if getOptionValue("--experimental-specifier-resolution") === "node"
  return finalizeResolution(resolved, base);
}

/**
 * We get an url to a javascript file and should try to back-track
 * to the typescript file that would compile to that javascript file.
 * @param url
 * @returns url
 */
function translateJsUrlBackToTypescriptUrl(url) {
  // Try to add `.ts` extension and resolve
  const path = fileURLToPath(url) + ".ts";
  console.log("translateJsUrlBackToTypescriptUrl pathpathpath", path);
  if (fs.existsSync(path)) {
    console.log("RESOLVE: RETURN", url.href);
    return pathToFileURL(path);
  }

  return url;
}

/**
 * This function resolves bare specifiers that refers to packages (not node:, data: bare specifiers)
 * @param {string} specifier
 * @param {string | URL | undefined} base
 * @param {Set<string>} conditions
 * @returns {URL}
 */
function packageResolve(specifier, base, conditions) {
  // Parse the specifier as a package name (package or @org/package) and separate out the sub-path
  const { packageName, packageSubpath, isScoped } = parsePackageName(
    specifier,
    base
  );

  // ResolveSelf
  // Check if the specifier resolves to the same package we are resolving from
  const selfResolved = resolveSelf(
    base,
    packageName,
    packageSubpath,
    conditions
  );
  if (selfResolved) return [selfResolved];

  // Find package.json by ascending the file system
  const packageJsonMatch = findPackageJson(packageName, base, isScoped);

  // If package.json was found, resolve from it's exports or main field
  if (packageJsonMatch) {
    const [packageJSONUrl, packageJSONPath] = packageJsonMatch;
    const packageConfig = getPackageConfig(packageJSONPath, specifier, base);
    if (packageConfig.exports !== undefined && packageConfig.exports !== null)
      return [
        packageExportsResolve(
          packageResolve,
          packageJSONUrl,
          packageSubpath,
          packageConfig,
          base,
          conditions
        ).resolved,
      ];
    if (packageSubpath === ".")
      return [legacyMainResolve(packageJSONUrl, packageConfig, base)];
    return [new URL(packageSubpath, packageJSONUrl)];
  }

  // eslint can't handle the above code.
  // eslint-disable-next-line no-unreachable
  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base));
}

// This could probably be moved to a built-in API
function findPackageJson(packageName, base, isScoped) {
  let packageJSONUrl = new URL(
    "./node_modules/" + packageName + "/package.json",
    base
  );
  let packageJSONPath = fileURLToPath(packageJSONUrl);
  let lastPath;
  do {
    const stat = tryStatSync(
      // StringPrototypeSlice(packageJSONPath, 0, packageJSONPath.length - 13)
      packageJSONPath.slice(0, packageJSONPath.length - 13)
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
    return [packageJSONUrl, packageJSONPath];
    // Cross-platform root check.
  } while (packageJSONPath.length !== lastPath.length);
  return undefined;
}

// This could probably be moved to a built-in API
// However it needs packageResolve since it calls into packageExportsResolve()
function resolveSelf(base, packageName, packageSubpath, conditions) {
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
  return undefined;
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

function isTypescriptFile(url) {
  const extensionsRegex = /\.ts$/;
  return extensionsRegex.test(url);
}
