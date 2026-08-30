// Builds TWO separate <script> files instead of one 1.4MB bundle:
//
//   consultly-call-widget.js  — bootstrap (index.js + ui.js). Loaded on
//                               every consultant-card page view. Contains
//                               no Agora/Socket.IO/Redux — just enough to
//                               open the modal shell and its skeleton state.
//   consultly-call-engine.js  — the actual call engine (engine.js, which
//                               imports callSlice.js/SokectConfig.js from
//                               consultly_Frontend + Agora + Socket.IO +
//                               Redux). Loaded on demand, only once the
//                               customer clicks Call/Video (see
//                               ensureEngineLoaded in src/index.js).
//
// Both are still bundled into consultly_Frontend/public/ (same origin the
// bootstrap's own sibling-file lookup for the engine chunk relies on, and
// the same origin /sounds/ringing_tone.mp3 is served from).
//
// process.env.REACT_APP_* values are read from consultly_Frontend/.env at
// BUILD time and inlined as string literals (esbuild `define`) — see the
// original single-bundle build's own comment for why.
const path = require("path");
const esbuild = require("esbuild");
const dotenv = require("dotenv");

const frontendEnvPath = path.join(__dirname, "..", "consultly_Frontend", ".env");
const parsedEnv = dotenv.config({ path: frontendEnvPath }).parsed || {};

const define = {
  "process.env.NODE_ENV": '"production"',
  "process.env.REACT_APP_BACKEND_HOST": JSON.stringify(
    parsedEnv.REACT_APP_BACKEND_HOST || "",
  ),
  "process.env.REACT_APP_SOCKET_URL": JSON.stringify(
    parsedEnv.REACT_APP_SOCKET_URL || "",
  ),
  "process.env.REACT_APP_AGORA_APP_ID": JSON.stringify(
    parsedEnv.REACT_APP_AGORA_APP_ID || "",
  ),
};

const outDir = path.join(__dirname, "..", "consultly_Frontend", "public");

// store.js imports @reduxjs/toolkit directly (its own devDependency here);
// callSlice.js — imported from consultly_Frontend — imports its OWN copy
// from consultly_Frontend/node_modules. Without this alias esbuild treats
// those as two unrelated files and bundles BOTH full copies (toolkit +
// its immer dependency, ~115KB combined, twice) into the engine chunk.
// Pointing this package's own import at the SAME copy callSlice.js already
// resolves keeps exactly one in the bundle. This is an existing coupling,
// not a new one — engine.js already only works because consultly_Frontend's
// node_modules has agora-rtc-sdk-ng/socket.io-client installed; this just
// extends the same assumption to @reduxjs/toolkit.
const sharedOptions = {
  bundle: true,
  minify: true,
  treeShaking: true,
  legalComments: "none",
  sourcemap: false,
  format: "iife",
  target: ["es2018"],
  define,
  alias: {
    "@reduxjs/toolkit": path.join(
      __dirname,
      "..",
      "consultly_Frontend",
      "node_modules",
      "@reduxjs",
      "toolkit",
    ),
  },
  loader: { ".css": "text" },
  logLevel: "info",
};

Promise.all([
  esbuild.build({
    ...sharedOptions,
    entryPoints: [path.join(__dirname, "src", "index.js")],
    outfile: path.join(outDir, "consultly-call-widget.js"),
  }),
  esbuild.build({
    ...sharedOptions,
    entryPoints: [path.join(__dirname, "src", "engine-entry.js")],
    outfile: path.join(outDir, "consultly-call-engine.js"),
  }),
])
  .then(() => {
    console.log("consultly_CallWidget: built bootstrap + engine chunk.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
