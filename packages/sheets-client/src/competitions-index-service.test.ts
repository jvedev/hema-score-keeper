import { describe, expect, it } from "vitest";
import { MockCompetitionsIndexService } from "./competitions-index-service";

describe("MockCompetitionsIndexService", () => {
  it("returns a defensive clone of the seeded competitions", async () => {
    const entries = [
      { name: "Autumn Open", startDate: "2026-09-12", endDate: "2026-09-13", spreadsheetId: "sheet-1" },
    ];
    const service = new MockCompetitionsIndexService(entries);

    const result = await service.listCompetitions();
    result[0]!.name = "Mutated";

    expect((await service.listCompetitions())[0]!.name).toBe("Autumn Open");
  });
});
