"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.load = void 0;
const url_1 = require("url");
const esbuild_1 = require("esbuild");
const isWindows = process.platform === "win32";
async function load(url, context, defaultLoad) {
    console.log("LOAD: START");
    // Return transpiled source if typescript file
    if (isTypescriptFile(url)) {
        // Call defaultLoad to get the source
        const format = getTypescriptModuleFormat();
        const { source: rawSource } = await defaultLoad(url, { format }, defaultLoad);
        const source = transpileTypescript(url, rawSource, "esm");
        return { format, source };
    }
    console.log("LOAD: FORWARD");
    // Let Node.js load it
    return defaultLoad(url, context);
}
exports.load = load;
function isTypescriptFile(url) {
    const extensionsRegex = /\.ts$/;
    return extensionsRegex.test(url);
}
function transpileTypescript(url, source, outputFormat) {
    let filename = url;
    if (!isWindows)
        filename = (0, url_1.fileURLToPath)(url);
    const { code: js, warnings, map: jsSourceMap, } = (0, esbuild_1.transformSync)(source.toString(), {
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
