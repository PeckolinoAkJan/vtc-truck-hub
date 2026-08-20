import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(root, "node_modules", "vinext", "dist", "cli.js");
const child = spawn(process.execPath, [cli, "build"], {
  cwd: root,
  env: { ...process.env, PLESK_BUILD: "1" },
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 1));
