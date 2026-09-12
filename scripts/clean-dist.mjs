import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { USERWARD_PORT } from "./userward-port.mjs";

const workspace = process.cwd();
const dist = resolve(workspace, "dist");

if (dist !== resolve(workspace, "dist")) {
  throw new Error("Refusing to clean an unexpected build path.");
}

function listeningPids(port) {
  let out = "";
  try {
    out = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
  } catch {
    return [];
  }
  const pids = new Set();
  const needle = `127.0.0.1:${port}`;
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING") || !line.includes(needle)) continue;
    const pid = line.trim().split(/\s+/).at(-1);
    if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(Number(pid));
  }
  return [...pids];
}

async function waitUntilPortFree(port, ms = 12000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (listeningPids(port).length === 0) return true;
    await new Promise(resolveWait => setTimeout(resolveWait, 400));
  }
  return listeningPids(port).length === 0;
}

const pids = listeningPids(USERWARD_PORT);
if (pids.length) {
  console.warn(
    `Rebuild only: stopping Userward on 127.0.0.1:${USERWARD_PORT} (pid ${pids.join(", ")}) so dist can be replaced without corrupting the live UI. Everyday use does not need this kill.`,
  );
  for (const pid of pids) {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // Process may have already exited.
    }
  }
  if (!(await waitUntilPortFree(USERWARD_PORT))) {
    throw new Error(
      `Port ${USERWARD_PORT} is still in use after stopping Userward. Close that process, then build again.`,
    );
  }
}

rmSync(dist, { recursive: true, force: true });
