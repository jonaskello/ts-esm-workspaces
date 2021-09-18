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
  // Determine format of the file
  const initialFormat =
    context.format ?? getFormat(url, context) ?? defaultGetFormat(url, context);

  // Call defaultLoad to get the source
  const { source: rawSource, format } = await defaultLoad(
    url,
    { format: initialFormat },
    defaultLoad
  );

  // Return transpiled source if typescript
  if (extensionsRegex.test(url)) {
    const source = transpileTypescript(url, format, rawSource);
    return { format, source };
  }

  // Return untransformed source
  return { format, source: rawSource };
}

function getFormat(url) {
  if (extensionsRegex.test(url)) {
    return "module";
  }
  return undefined;
}

function transpileTypescript(url, format, source) {
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

  return js;
}
