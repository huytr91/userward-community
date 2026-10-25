/**
 * Local companion for the Self-upgrade window. Binds 127.0.0.1:3003 only.
 * The browser talks here so Userward can run asi:improve / pick / promote
 * without putting child_process inside the web runtime.
 *
 *   npm run asi:companion
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHIVE_PATH, PROJECT_ROOT, STATE_DIR, ensureProjectRoot, readArchive, latestEvent } from "./core.mjs";

const PORT = Number(process.env.ASI_COMPANION_PORT || 3003);
const HOST = "127.0.0.1";
if ([3000, 3001].includes(PORT)) throw new Error("Companion refuses ports 3000 and 3001.");

ensureProjectRoot();

/** @type {Map<string, { id: string, status: string, goal: string, log: string[], startedAt: number, finishedAt?: number, exitCode?: number, reportPath?: string, bestId?: string }>} */
const jobs = new Map();

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function runNode(args, envExtra = {}) {
  return spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...envExtra, FORCE_COLOR: "0", NO_COLOR: "1" },
    windowsHide: true,
  });
}

function modelEnv(body = {}) {
  const env = {};
  if (body.apiKey) {
    env.ASI_API_KEY = String(body.apiKey);
    if (body.baseUrl) env.ASI_BASE_URL = String(body.baseUrl);
    if (body.model) env.ASI_MODEL = String(body.model);
    if (body.provider) env.ASI_PROVIDER = String(body.provider);
  }
  return env;
}

function listCandidates() {
  // Hide dead ends the user cannot act on (blocked drafts with no sandbox left).
  return [...readArchive().values()].slice(-40).map(c => {
    const event = latestEvent(c, ["pick", "promote", "rollback"]);
    const decision = !event ? "pending" : event.event === "pick" ? event.choice : event.event;
    const hasSandbox = Boolean(c.sandbox && existsSync(c.sandbox));
    return {
      id: c.id,
      tier: c.tier,
      round: c.round,
      verdict: c.verdict,
      score: c.score,
      summary: c.summary,
      gains: c.gains || [],
      regressions: c.regressions || [],
      errors: c.errors || [],
      decision,
      hasSandbox,
      actionable: hasSandbox || decision === "keep" || decision === "promote",
      reportPath: c.diffPath ? join(STATE_DIR, "runs", c.runId || "", "report.md") : null,
    };
  }).filter(c => c.actionable || c.decision === "rollback");
}

function latestReport(runId) {
  if (!runId) return null;
  const path = join(STATE_DIR, "runs", runId, "report.md");
  return existsSync(path) ? readFileSync(path, "utf8").slice(0, 12_000) : null;
}

function startImprove(body) {
  const goal = String(body.goal || "").trim().slice(0, 800);
  if (!goal) throw new Error("goal required");
  if (String(body.goal || "").trim().length > 800) {
    // Keep going with the truncated goal; UI should already have warned.
  }
  const id = `job-${Date.now().toString(36)}`;
  const job = { id, status: "running", goal, log: [], startedAt: Date.now() };
  jobs.set(id, job);
  const args = ["--experimental-strip-types", "scripts/asi/improve.mjs", "--goal", goal, "--rounds", String(body.rounds || 2), "--candidates", String(body.candidates || 2)];
  if (body.noBuild) args.push("--no-build");
  const child = runNode(args, modelEnv(body));
  job.pid = child.pid;
  const push = (chunk) => {
    const text = String(chunk || "");
    if (!text) return;
    job.log.push(text);
    if (job.log.join("").length > 200_000) job.log = [job.log.join("").slice(-80_000)];
  };
  child.stdout.on("data", push);
  child.stderr.on("data", push);
  child.on("close", code => {
    job.status = code === 0 ? "done" : code === 3 ? "need_criteria" : "failed";
    job.exitCode = code;
    job.finishedAt = Date.now();
    const output = job.log.join("");
    const best = output.match(/Best candidate:\s+(cand-[\w-]+)/);
    const run = output.match(/Self-upgrade (run-[\w-]+)/) || output.match(/Userward self-upgrade (run-[\w-]+)/);
    if (best) job.bestId = best[1];
    if (run) { job.runId = run[1]; job.reportPath = join(STATE_DIR, "runs", run[1], "report.md"); }
  });
  return job;
}

function manage(subcommand, args, body) {
  return new Promise((resolve, reject) => {
    const child = runNode(["scripts/asi/manage.mjs", subcommand, ...args], modelEnv(body));
    let out = "";
    child.stdout.on("data", chunk => { out += chunk; });
    child.stderr.on("data", chunk => { out += chunk; });
    child.on("close", code => {
      if (code === 0) resolve({ ok: true, output: out.slice(-4000) });
      else reject(new Error(out.trim().slice(-1500) || `${subcommand} failed`));
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, service: "userward-asi-companion", port: PORT, root: PROJECT_ROOT });
    }
    if (req.method === "GET" && url.pathname === "/status") {
      return json(res, 200, { ok: true, candidates: listCandidates(), jobs: [...jobs.values()].slice(-10).map(({ log, ...rest }) => ({ ...rest, logTail: log.join("").slice(-2000) })) });
    }
    if (req.method === "GET" && url.pathname.startsWith("/jobs/")) {
      const job = jobs.get(url.pathname.slice(6));
      if (!job) return json(res, 404, { error: "job not found" });
      return json(res, 200, { ...job, log: job.log.join(""), report: latestReport(job.runId) });
    }
    if (req.method === "POST" && url.pathname === "/run") {
      const body = await readBody(req);
      const job = startImprove(body);
      return json(res, 202, { ok: true, jobId: job.id });
    }
    if (req.method === "POST" && url.pathname === "/pick") {
      const body = await readBody(req);
      if (!body.id || !["keep", "reject"].includes(body.choice)) return json(res, 400, { error: "id and choice keep|reject required" });
      const result = await manage("pick", [body.id, body.choice, ...(body.note ? ["--note", String(body.note).slice(0, 200)] : [])], body);
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/promote") {
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: "id required" });
      const result = await manage("promote", [body.id, "--yes"], body);
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/rollback") {
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: "id required" });
      const result = await manage("rollback", [body.id, "--yes"], body);
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/clear-history") {
      if (existsSync(ARCHIVE_PATH)) writeFileSync(ARCHIVE_PATH, "");
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/preview") {
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: "id required" });
      // Detach preview so the HTTP call returns; user opens http://127.0.0.1:3002
      const child = runNode(["scripts/asi/manage.mjs", "preview", body.id, "--port", "3002"], modelEnv(body));
      child.unref();
      return json(res, 202, { ok: true, url: "http://127.0.0.1:3002", message: "Preview starting; open beside http://127.0.0.1:3001" });
    }
    if (req.method === "GET" && url.pathname === "/zones") {
      const child = runNode(["scripts/asi/manage.mjs", "zones"]);
      let out = "";
      child.stdout.on("data", chunk => { out += chunk; });
      child.on("close", () => json(res, 200, { ok: true, text: out }));
      return;
    }
    json(res, 404, { error: "not found" });
  } catch (error) {
    json(res, 500, { error: error.message || "companion error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Userward self-upgrade companion on http://${HOST}:${PORT}`);
  console.log(`Project: ${PROJECT_ROOT}`);
});
