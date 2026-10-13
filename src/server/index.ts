/**
 * Process entry point. Everything that can fail at boot (Node too old, DATA_DIR
 * unwritable, port taken, database unreadable) is turned into one readable line
 * and a non-zero exit; the app modules are imported only after those checks.
 */
import { serve } from "@hono/node-server";

const MIN_NODE = { major: 22, minor: 13 } as const;

function nodeIsSupported(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map((n) => Number.parseInt(n, 10));
  return major > MIN_NODE.major || (major === MIN_NODE.major && minor >= MIN_NODE.minor);
}

if (!nodeIsSupported(process.versions.node)) {
  console.error(
    `open-higgsfield needs Node >= ${MIN_NODE.major}.${MIN_NODE.minor} (found ${process.versions.node}); the built-in node:sqlite ships from 22.13.`,
  );
  process.exit(1);
}

// Config is safe to import first (no DB); fail fast on an unwritable DATA_DIR before db.ts opens SQLite.
const { config, ensureDataDirs, DataDirError } = await import("./config.ts");
const { errorMessage, log } = await import("./log.ts");

try {
  ensureDataDirs();
} catch (err) {
  console.error(err instanceof DataDirError ? err.message : `DATA_DIR ${config.dataDir} is not usable: ${errorMessage(err)}`);
  process.exit(1);
}

let createApp: typeof import("./app.ts").createApp;
let closeDatabase: typeof import("./db.ts").closeDatabase;
let closeAllStreams: typeof import("./events.ts").closeAllStreams;
let resumePendingJobs: typeof import("./jobs.ts").resumePendingJobs;
let stopPoller: typeof import("./jobs.ts").stopPoller;
let resolveApiKey: typeof import("./settings.ts").resolveApiKey;
try {
  ({ createApp } = await import("./app.ts"));
  ({ closeDatabase } = await import("./db.ts"));
  ({ closeAllStreams } = await import("./events.ts"));
  ({ resumePendingJobs, stopPoller } = await import("./jobs.ts"));
  ({ resolveApiKey } = await import("./settings.ts"));
} catch (err) {
  console.error(`open-higgsfield failed to start: ${errorMessage(err)}`);
  process.exit(1);
}

const app = createApp();

// Loopback unless HOST says otherwise: there is no login, so binding every interface is opt-in.
const wildcard = config.host === "0.0.0.0" || config.host === "::";
const displayHost = config.host.includes(":") ? `[${config.host}]` : config.host;

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  const { source } = resolveApiKey();
  log.info(
    `open-higgsfield v${config.version} listening on http://${displayHost}:${info.port} (${config.nodeEnv}${wildcard ? ", all interfaces" : ""})`,
  );
  log.info(`data dir ${config.dataDir} · api key: ${source ?? "none"} · max active jobs: ${config.maxActiveJobs}`);
  log.info(`allowed hosts: ${config.allowedHosts === "*" ? "* (host check disabled)" : [...config.allowedHosts].join(", ")}`);
  resumePendingJobs();
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") log.error(`port ${config.port} is already in use; set PORT to a free port`);
  else if (err.code === "EADDRNOTAVAIL") log.error(`HOST ${config.host} is not an address of this machine; use 127.0.0.1, 0.0.0.0 or an interface IP`);
  else log.error(`server error: ${errorMessage(err)}`);
  closeDatabase();
  process.exit(1);
});

let shuttingDown = false;
function shutdown(signal: string, exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`${signal} received, shutting down`);
  stopPoller();
  closeAllStreams();
  server.close(() => {
    closeDatabase();
    process.exit(exitCode);
  });
  setTimeout(() => {
    closeDatabase();
    process.exit(exitCode);
  }, 3000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => log.error(`unhandled rejection: ${errorMessage(reason)}`));
process.on("uncaughtException", (err) => {
  log.error(`uncaught exception: ${errorMessage(err)}`);
  shutdown("uncaughtException", 1);
});
