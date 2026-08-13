import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "cmd.exe" : "npm";
const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm.cmd run build"] : ["run", "build"];
const result = spawnSync(command, args, {
  env: { ...process.env, VITE_MINIMUM_EDITION: "community" },
  stdio: "inherit",
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
