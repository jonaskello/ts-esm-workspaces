import { URL, pathToFileURL, fileURLToPath } from "url";
import { transformSync } from "esbuild";
import fs from "fs";
import { defaultGetFormat } from "./node-raw/api.js";

const baseURL = pathToFileURL(`${process.cwd()}/`).href;
const isWindows = process.platform === "win32";

const extensionsRegex = /\.ts$/;
const excludeRegex = /^\w+:/;

export function resolve(specifier, context, defaultResolve) {
  console.log("hejehej resolve!", specifier);
  const { parentURL = baseURL } = context;

  if (extensionsRegex.test(specifier)) {
    const url = new URL(specifier, parentURL).href;
    return { url };
  }

  // ignore `data:` and `node:` prefix etc.
  if (!excludeRegex.test(specifier)) {
    // Try to resolve `.ts` extension
    let url = new URL(specifier + ".ts", parentURL).href;
    const path = fileURLToPath(url);
    if (fs.existsSync(path)) {
      return { url };
    }
  }

  console.log("forwarding", specifier);

  // Let Node.js handle all other specifiers.
  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  // console.log("load: ", url, context);
  const format =
    context.format ?? getFormat(url, context) ?? defaultGetFormat(url, context);

  // console.log("format: ", format, url);
  // console.log("getFormat: ", getFormat(url, context, defaultGetFormat), url);
  // console.log("defaultGetFormat: ", defaultGetFormat(url, context), url);

  // Call defaultLoad() to get the source
  const { source: rawSource } = await defaultLoad(url, { format }, defaultLoad);

  // Call the old hook
  const { source } = await transformSource(rawSource, { url, format });

  return { format, source };
}

export function getFormat(url, context, defaultGetFormat) {
  if (extensionsRegex.test(url)) {
    return "module";
  }
  return undefined;
}

export function transformSource(source, context) {
  const { url, format } = context;

  if (extensionsRegex.test(url)) {
    let filename = url;
    if (!isWindows) filename = fileURLToPath(url);

    const {
      code: js,
      warnings,
      map: jsSourceMap,
    } = transformSync(source.toString(), {
      sourcefile: filename,
      sourcemap: "both",
      loader: "ts",
      target: "esnext",
      format: format === "module" ? "esm" : "cjs",
    });

    if (warnings && warnings.length > 0) {
      for (const warning of warnings) {
        console.log(warning.location);
        console.log(warning.text);
      }
    }

    return {
      source: js,
    };
  }

  // Return untransformed source
  return { source };
}
