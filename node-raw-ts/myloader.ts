import { URL, pathToFileURL, fileURLToPath } from "url";
import { transformSync } from "esbuild";
import fs from "fs";

const { defaultResolveApi } = require("./resolve_fs");

const baseURL = pathToFileURL(`${process.cwd()}/`).href;
const isWindows = process.platform === "win32";

export function resolve(specifier, context) {
  console.log("RESOLVE: START");

  const { parentURL = baseURL } = context;

  // If file ends in .ts
  if (isTypescriptFile(specifier)) {
    const url = new URL(specifier, parentURL).href;
    return { url };
  }

  // ignore `data:` and `node:` prefix etc.
  const excludeRegex = /^\w+:/;
  if (!excludeRegex.test(specifier)) {
    // Try to add `.ts` extension and resolve
    let url = new URL(specifier + ".ts", parentURL).href;
    const path = fileURLToPath(url);
    if (fs.existsSync(path)) {
      console.log("RESOLVE: RETURN");
      return { url };
    }
  }

  console.log("RESOLVE: FORWARD", specifier);

  // Let Node.js handle all other specifiers.
  return defaultResolveApi(specifier, context);
}

export async function load(url, context, defaultLoad) {
  console.log("LOAD: START");

  // Return transpiled source if typescript file
  if (isTypescriptFile(url)) {
    // Call defaultLoad to get the source
    const format = getTypescriptModuleFormat();
    const { source: rawSource } = await defaultLoad(
      url,
      { format },
      defaultLoad
    );
    const source = transpileTypescript(url, rawSource, "esm");
    return { format, source };
  }

  console.log("LOAD: FORWARD");

  // Let Node.js load it
  return defaultLoad(url, context);
}

function isTypescriptFile(url) {
  const extensionsRegex = /\.ts$/;
  return extensionsRegex.test(url);
}

function transpileTypescript(url, source, outputFormat) {
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
    format: outputFormat,
  });

  if (warnings && warnings.length > 0) {
    for (const warning of warnings) {
      console.log(warning.location);
      console.log(warning.text);
    }
  }

  return js;
}

function getTypescriptModuleFormat() {
  // The format of typescript file could be ESM or CJS
  // Since typescript always generates .js files, it can be a module if type: module is set in package.json
  // However it can also be a module otherwise......
  // Is it even important to know this, the source is loaded in the same way regardless.......
  // Perhaps we cannot transpile CJS into ESM with esbuild? Then we need to know...
  // An ECMAScript module in JS cannot use require
  // A typescript module can use require but can it in the same module use ESM import/export?

  return "module";
}

/*

We always start with a typescript file (foo.ts) and a tsconfig.json.

We only need to handle imports with relative or bare specifiers.

* The relative specifier can be extensionless or have a .js extension
* The bare specifier could resolve to an extensionless or a .js file

When something resolves to a .js file, we need to determine if that .js file is part of the current compilation.
The .js may not exist in the filesystem becuase tsc may have not been run yet.
If a .js file is part of the current compilation, we need to backtrack to find the .ts file that generated it and load that instead

So instead of just chaning the extension from .js to .ts, or just adding .ts to the exensionless specifier

*/
