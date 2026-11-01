import { spawn } from "node:child_process";
import { bunExecutable } from "../bin/runtime.mjs";

const child = spawn(bunExecutable(), ["--no-env-file", ...process.argv.slice(2)], { stdio: "inherit", shell: false });
child.on("error", () => { console.error("Bun runtime unavailable. Install optional dependencies or provide Bun >=1.4.4 on PATH."); process.exitCode = 1; });
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 130 : 1); });
