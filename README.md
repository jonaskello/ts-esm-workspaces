# esm-monorepo

Demo app for ES Modules monorepo using:

* Snowpack
* Yarn workspaces
* Typescript project references
* ts-node esm modules loading

There are three packages

* client (this is the browser code in react)
* server (this is the server-side code for nodejs)
* shared (this code is used by both client and server packages)

## How to run

```bash
yarn install
yarn start
``` 

## How it works

The commmand `yarn start` will start three scripts in parallel (using run-p from npm-run-all):

* dev-client: runs snowpack and watches changes, use HMR to directly update browser
* dev-server: runs nodemon to restart on server code changes (nodemon in turn runs node with ts-node/esm loader)
* typecheck: runs tsc --watch to check types

It is important to note that `dev-client` and `dev-server` directly consumes `*.ts` files but it does not typecheck them. They will only transpile by stripping the typescript type-annotations, nothing more. So the browser and node will get type-stripped files and continue to work as long as the resulting javascript is valid, even if there are type erors. For example, node server, and the browser code will continue to run if you enter something like `const x: string = 11`. Typechecking is run as a separate process for all packages. This means that when developing you get high speed in changes in both client and server but typechecking might lag behind a bit.

I've tried several other permutations of setups but the one above seems to work best when combining all these technolgies.

## Current issues

To have snowpack consume `.ts` files directly we give it an entry point which is a `.ts` file. Snowpack will follow any imports with relative-path specifiers and build a dependency tree of `.ts` files. However when snowpack encounters an import using a bare specifier to another package (eg. `@app/client` package importing from `"@app/shared"`) it will use standard node resultioh and look in `node_modules`. There it will find a file-system link created by yarn workspaces that points to the source code for the pacakge. It will look at the package.json file's main field and find `lib/index.js`. So it will load that and continue it's dependency tree using `.js` files in `lib` instead of `.ts` files in `src`. When we change a `src/*.ts` file in the `@app/shared` package snowpack will not react as in it's dependency tree it is watching `lib/*.js` files.

The import chain looks something like this:

`index.html -> packages/client/src/main.tsx -> ./app.tsx -> @app/shared -> node_modules/@app/shared/package.json -> main: "lib/index.js" -> packages/shared/lib/index.js -> more js files`

The exact same problem seems to exist in `ts-node/esm`.

The way we solve the above is to update `package.json`'s `main` field point to `src/index.ts` instead. Obviously this is not really a good idea becuase if we would publish the package it would not work. However for internal develpoment between packages using yarn workspaces and typescript project references it seems to work.

It is possible to workaround the problem above for snowpack but not for node with ts-node/esm. For snowpack we can put a config for `packageOptions.packageLookupFields: ["tsMain", "main"]` and then add an extra filed in `shared/package.json` for `tsMain: src/index.ts`. However this trick does not work for ts-node/esm as it does not have this kind of config option.

The best solution both for snowpack and ts-node/esm is probably to do the same thing as the typescript language server is doing. It looks at tsconfig.json to determnine the original ts file that corresponds to the js file in `package.json`'s `main` field.
