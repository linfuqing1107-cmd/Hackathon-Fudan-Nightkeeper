import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];
if (!["build", "start"].includes(mode)) {
  console.error("Usage: node scripts/demo.mjs build|start");
  process.exit(1);
}
if (mode === "start" && !existsSync(path.join(root, ".next-demo/BUILD_ID"))) {
  console.error("Demo build missing. Run npm run demo:build first.");
  process.exit(1);
}
const args = [path.join(root, "node_modules/next/dist/bin/next"), mode];
if (mode === "start")
  args.push(
    "--hostname",
    "127.0.0.1",
    "--port",
    process.env.DEMO_PORT || "3101",
  );
const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NIGHTKEEPER_DEMO: "true",
    DEMO_MODE: "true",
    DATA_DIR: path.join(root, ".data/demo-production"),
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
