import { spawnSync } from "node:child_process";

// --test-isolation became stable in Node 23.6; Node 22 only knows the experimental flag.
const [major, minor] = process.versions.node.split(".").map(Number);
const isolation = major > 23 || (major === 23 && minor >= 6)
  ? "--test-isolation=none"
  : "--experimental-test-isolation=none";
const result = spawnSync(process.execPath, ["--test", isolation, "tests/*.test.mjs", ...process.argv.slice(2)], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
