import path from "node:path";
import { describe, expect, it } from "vitest";
import { appDataDir } from "../src/app-root.js";
import { resolveDatabasePath } from "../src/db.js";
import { liveDataDir } from "../src/live/data-dir.js";

describe("persistent application data paths", () => {
  it("uses APP_DATA_DIR for default database and live files", () => {
    const dataDir = path.resolve("test-data", "portable-app");
    const env = { APP_DATA_DIR: dataDir } as NodeJS.ProcessEnv;
    expect(appDataDir(env)).toBe(dataDir);
    expect(resolveDatabasePath("file:./venue.db", env)).toBe(path.join(dataDir, "venue.db"));
    expect(liveDataDir(env)).toBe(path.join(dataDir, "live"));
  });

  it("keeps memory and explicit database paths intact", () => {
    const env = { APP_DATA_DIR: path.resolve("test-data", "portable-app") } as NodeJS.ProcessEnv;
    expect(resolveDatabasePath("file::memory:", env)).toBe(":memory:");
    expect(resolveDatabasePath("file:C:\\hema\\data\\venue.db", env)).toBe("C:\\hema\\data\\venue.db");
  });
});
