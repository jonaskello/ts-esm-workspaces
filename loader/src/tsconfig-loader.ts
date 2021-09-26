import * as path from "path";
import * as fs from "fs";
// tslint:disable:no-require-imports
import JSON5 = require("json5");
import StripBom = require("strip-bom");
// tslint:enable:no-require-imports

/**
 * Typing for the parts of tsconfig that we care about
 */
export interface Tsconfig {
  extends?: string;
  references?: Array<{ path: string }>;
  include?: Array<string>;
  exclude?: Array<string>;
  files?: Array<string>;
  compilerOptions?: {
    rootDir?: string;
    outDir?: string;
    baseUrl?: string;
    paths?: { [key: string]: Array<string> };
    strict?: boolean;
  };
}

export interface TsConfigLoaderResult {
  tsConfigPath: string | undefined;
  baseUrl: string | undefined;
  paths: { [key: string]: Array<string> } | undefined;
}

export interface TsConfigLoaderParams {
  getEnv: (key: string) => string | undefined;
  cwd: string;
  loadSync?(cwd: string, filename?: string): TsConfigLoaderResult;
}

export function tsConfigLoader({
  getEnv,
  cwd,
  loadSync = loadSyncDefault,
}: TsConfigLoaderParams): TsConfigLoaderResult {
  const TS_NODE_PROJECT = getEnv("TS_NODE_PROJECT");

  // tsconfig.loadSync handles if TS_NODE_PROJECT is a file or directory
  const loadResult = loadSync(cwd, TS_NODE_PROJECT);
  return loadResult;
}

function loadSyncDefault(cwd: string, filename?: string): TsConfigLoaderResult {
  // Tsconfig.loadSync uses path.resolve. This is why we can use an absolute path as filename

  const configPath = resolveConfigPath(cwd, filename);

  if (!configPath) {
    return {
      tsConfigPath: undefined,
      baseUrl: undefined,
      paths: undefined,
    };
  }
  const config = loadTsconfig(configPath);

  return {
    tsConfigPath: configPath,
    baseUrl: config && config.compilerOptions && config.compilerOptions.baseUrl,
    paths: config && config.compilerOptions && config.compilerOptions.paths,
  };
}

export function resolveConfigPath(
  cwd: string,
  filename?: string
): string | undefined {
  if (filename) {
    const absolutePath = fs.lstatSync(filename).isDirectory()
      ? path.resolve(filename, "./tsconfig.json")
      : path.resolve(cwd, filename);

    return absolutePath;
  }

  if (fs.statSync(cwd).isFile()) {
    return path.resolve(cwd);
  }

  const configAbsolutePath = walkForTsConfig(cwd);
  return configAbsolutePath ? path.resolve(configAbsolutePath) : undefined;
}

export function walkForTsConfig(
  directory: string,
  existsSync: (path: string) => boolean = fs.existsSync
): string | undefined {
  const configPath = path.join(directory, "./tsconfig.json");
  if (existsSync(configPath)) {
    return configPath;
  }

  const parentDirectory = path.join(directory, "../");

  // If we reached the top
  if (directory === parentDirectory) {
    return undefined;
  }

  return walkForTsConfig(parentDirectory, existsSync);
}

export function loadTsconfig(
  configFilePath: string,
  existsSync: (path: string) => boolean = fs.existsSync,
  readFileSync: (filename: string) => string = (filename: string) =>
    fs.readFileSync(filename, "utf8")
): Tsconfig | undefined {
  if (!existsSync(configFilePath)) {
    return undefined;
  }

  const configString = readFileSync(configFilePath);
  const cleanedJson = StripBom(configString);
  const config: Tsconfig = JSON5.parse(cleanedJson);
  let extendedConfig = config.extends;

  if (extendedConfig) {
    if (
      typeof extendedConfig === "string" &&
      extendedConfig.indexOf(".json") === -1
    ) {
      extendedConfig += ".json";
    }
    const currentDir = path.dirname(configFilePath);
    let extendedConfigPath = path.join(currentDir, extendedConfig);
    if (
      extendedConfig.indexOf("/") !== -1 &&
      extendedConfig.indexOf(".") !== -1 &&
      !existsSync(extendedConfigPath)
    ) {
      extendedConfigPath = path.join(
        currentDir,
        "node_modules",
        extendedConfig
      );
    }

    const base =
      loadTsconfig(extendedConfigPath, existsSync, readFileSync) || {};

    // baseUrl should be interpreted as relative to the base tsconfig,
    // but we need to update it so it is relative to the original tsconfig being loaded
    if (base.compilerOptions && base.compilerOptions.baseUrl) {
      const extendsDir = path.dirname(extendedConfig);
      base.compilerOptions.baseUrl = path.join(
        extendsDir,
        base.compilerOptions.baseUrl
      );
    }

    return {
      ...base,
      ...config,
      compilerOptions: {
        ...base.compilerOptions,
        ...config.compilerOptions,
      },
    };
  }
  return config;
}

export function loadTsConfigAndResolveReferences(
  entryTsConfig: string
): Map<string, Tsconfig> {
  let cwd = process.cwd();
  const tsconfigMap = new Map();
  loadTsConfigAndResolveReferencesRecursive(
    cwd,
    [{ path: entryTsConfig }],
    tsconfigMap
  );
  return tsconfigMap;
}

function loadTsConfigAndResolveReferencesRecursive(
  cwd: string,
  refs: Array<{ path: string }>,
  tsconfigMap: Map<string, Tsconfig>
): Map<string, Tsconfig> {
  for (const ref of refs) {
    console.log("resolveConfigPath", cwd, ref.path);
    let fullPath = path.join(cwd, ref.path);
    if (fs.lstatSync(fullPath).isDirectory()) {
      fullPath = path.join(fullPath, "tsconfig.json");
    }
    const tsconfig = loadTsconfig(fullPath);
    if (!tsconfig) {
      throw new Error("Could not find tsconfig ref.");
    }
    tsconfigMap.set(fullPath, tsconfig);
    loadTsConfigAndResolveReferencesRecursive(
      path.dirname(fullPath),
      tsconfig?.references ?? [],
      tsconfigMap
    );
  }
  return tsconfigMap;
}
