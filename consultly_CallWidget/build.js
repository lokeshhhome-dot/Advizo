// Builds dist/consultly-call-widget.js — a single, dependency-free <script>
// the Theme Extension loads. Bundles this package's own files PLUS the
// React app's callSlice.js / SokectConfig.js / ringingTune.js by importing
// them directly from ../consultly_Frontend (see engine.js) — the same
// Agora/Socket.IO engine the dashboard uses, not a reimplementation.
//
// process.env.REACT_APP_* values are read from consultly_Frontend/.env at
// BUILD time and inlined as string literals (esbuild `define`, the same
// mechanism CRA's webpack config uses) — this bundle has no bundler-level
// env support of its own, and reading the same .env file the React app
// already uses keeps the two from drifting out of sync.
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

esbuild
  .build({
    entryPoints: [path.join(__dirname, "src", "index.js")],
    bundle: true,
    minify: true,
    sourcemap: false,
    format: "iife",
    target: ["es2018"],
    // Output straight into consultly_Frontend/public — same origin the React
    // app (and its /sounds/ringing_tone.mp3 asset engine.js reuses) is
    // already served from, and it ships automatically with every frontend
    // deploy with no separate hosting step for this bundle.
    outfile: path.join(
      __dirname,
      "..",
      "consultly_Frontend",
      "public",
      "consultly-call-widget.js",
    ),
    define,
    loader: { ".css": "text" },
    logLevel: "info",
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
