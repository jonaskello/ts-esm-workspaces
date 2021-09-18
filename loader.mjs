import { URL, pathToFileURL, fileURLToPath } from "url";
import { transformSync } from "esbuild";
import fs from "fs";

const baseURL = pathToFileURL(`${process.cwd()}/`).href;
const isWindows = process.platform === "win32";

const extensionsRegex = /\.ts$/;
const excludeRegex = /^\w+:/;

export function resolve(specifier, context, defaultResolve) {
  const { parentURL = baseURL } = context;

  // If file ends in .ts
  if (extensionsRegex.test(specifier)) {
    const url = new URL(specifier, parentURL).href;
    return { url };
  }

  // ignore `data:` and `node:` prefix etc.
  if (!excludeRegex.test(specifier)) {
    // Try to add `.ts` extension and resolve
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
  // Return transpiled source if typescript file
  if (extensionsRegex.test(url)) {
    // Call defaultLoad to get the source (the format of typescript files is always module)
    const { source: rawSource } = await defaultLoad(
      url,
      { format: "module" },
      defaultLoad
    );
    const source = transpileTypescript(url, rawSource);
    return { format: "module", source };
  }

  // Let Node.js load it
  return defaultLoad(url, context);
}

function transpileTypescript(url, source) {
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
    // This sets the output format for the generated JavaScript files
    // format: format === "module" ? "esm" : "cjs",
    format: "esm",
  });

  if (warnings && warnings.length > 0) {
    for (const warning of warnings) {
      console.log(warning.location);
      console.log(warning.text);
    }
  }

  return js;
}
