var fs = require("fs");
var shell = require("shelljs");

if (!shell.which("git")) {
  shell.echo("Sorry, this script requires git");
  shell.exit(1);
}

// Copy files to release dir
shell.rm("-rf", "prod");
shell.mkdir("-p", "prod");
shell.cp("-R", "./packages", "prod/packages");
shell.cp("package.json", "prod/");
shell.cp("yarn.lock", "prod/");
shell.cp("snowpack.config.mjs", "prod/");
shell.cd("prod");
shell.exec("yarn install --frozen-lock-file");
shell.exec("yarn clean");
shell.exec("yarn build");
shell.exec("yarn dist");

// Load all package.json files and change from src/index.ts to lib/index.js
const pkgJsons = ["packages/shared/package.json"];

for (const pkgJson of pkgJsons) {
  let rawdata = fs.readFileSync(pkgJson);
  let p = JSON.parse(rawdata);
  if (p.main === "src/index.ts") {
    p.main = "lib/index.js";
  }
  let data = JSON.stringify(p, undefined, 2);
  fs.writeFileSync(pkgJson, data);
}
