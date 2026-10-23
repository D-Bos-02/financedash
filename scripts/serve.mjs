// Starts Next (`dev` or `start`) on HOST and PORT from .env. Next itself defaults to every network
// interface; this defaults to 127.0.0.1 so the app is only reachable from this computer.
// Usage: node scripts/serve.mjs dev|start

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { isLocalHost } from "./host.mjs";

const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") {
  console.error("Usage: node scripts/serve.mjs dev|start");
  process.exit(1);
}

// Only HOST and PORT are read here; Next loads the rest of .env itself, and in dev reloads it when the
// file changes (so new keys work without a restart). Values already in the environment win, as with Next.
const fileEnv = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};
const host = (process.env.HOST ?? fileEnv.HOST)?.trim() || "127.0.0.1";
const port = (process.env.PORT ?? fileEnv.PORT)?.trim() || "3000";

if (isLocalHost(host)) {
  console.log(`\n  Only reachable from this computer: http://${host.includes(":") ? `[${host}]` : host}:${port}\n`);
} else {
  const line = "=".repeat(72);
  console.warn(`
${line}
  WARNING: HOST=${host} makes this app reachable from other devices.

  There is no login. Anyone who can reach this address can see and change
  all of your financial data, and use your Plaid and AI keys.

  Only do this on a network you trust (never public Wi-Fi), and set HOST
  back to 127.0.0.1 in .env when you no longer need it.
${line}
`);
}

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, mode, "-H", host, "-p", port], { stdio: "inherit" });
child.on("exit", (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
