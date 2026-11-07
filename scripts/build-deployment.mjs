import { spawn } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("Run this script through npm: npm run build:deployment");
}

const child = spawn(
  process.execPath,
  [npmCli, "run", "build", "--workspaces", "--if-present"],
  {
    stdio: "inherit",
    env: { ...process.env, VITE_USE_MOCK_API: "false" },
  },
);

child.on("error", (error) => {
  console.error("Could not start the deployment build.", error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Deployment build stopped by ${signal}.`);
    process.exitCode = 1;
  } else {
    if (code !== 0) {
      process.exitCode = code ?? 1;
      return;
    }
    const check = spawn(process.execPath, ["scripts/verify-deployment-build.mjs"], { stdio: "inherit" });
    check.on("error", (error) => {
      console.error("Could not start deployment route verification.", error);
      process.exitCode = 1;
    });
    check.on("exit", (checkCode, checkSignal) => {
      process.exitCode = checkSignal ? 1 : checkCode ?? 1;
    });
  }
});
