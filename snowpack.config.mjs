/** @type {import("snowpack").SnowpackUserConfig } */
export default {
  workspaceRoot: "packages",
  mount: {
    // directory name: 'build directory'
    "packages/client/src": { url: "/" },
  },
  plugins: ["@snowpack/plugin-react-refresh"],
  routes: [
    /* Enable an SPA Fallback in development: */
    // {"match": "routes", "src": ".*", "dest": "/index.html"},
  ],
  optimize: {
    /* Example: Bundle your final build: */
    // "bundle": true,
    bundle: true,
    minify: true,
    splitting: true,
  },
  packageOptions: {
    // packageLookupFields: ["tsMain", "main"],
  },
  devOptions: {
    // hmr: false
    /* ... */
    open: "none",
  },
  buildOptions: {
    sourcemap: "inline",
    clean: true, // Delete the build outputfolder
    out: "./dist/", // Path for build output
  },
};
