import { describe, expect, it } from "vitest";
import { MockCompetitionSheetService } from "./competition-sheet-service";
import type { BoutRow, CompetitionSettings, RankingRow } from "./types";

const settings: CompetitionSettings = {
  name: "Autumn Longsword Open",
  startDate: "2026-09-12",
  endDate: "2026-09-13",
  rulesetJson: { weaponClass: "Longsword" },
};

describe("MockCompetitionSheetService", () => {
  it("adds a participant without linking it to a user", async () => {
    const service = new MockCompetitionSheetService({ "sheet-1": { settings } });

    const participant = await service.addParticipant("sheet-1", "New Fighter");

    expect(participant.linkedUserEmail).toBeNull();
    expect(await service.getParticipants("sheet-1")).toContainEqual(participant);
  });

  it("links a self-registered participant to the configured current user", async () => {
    const service = new MockCompetitionSheetService(
      { "sheet-1": { settings } },
      { currentUserEmail: "me@example.com" },
    );

    const participant = await service.registerSelf("sheet-1", "Me");

    expect(participant.linkedUserEmail).toBe("me@example.com");
  });

  it("stays dumb: publishBout stores the bout and overwrites ranking with exactly what it is given", async () => {
    const service = new MockCompetitionSheetService({ "sheet-1": { settings } });
    const bout: BoutRow = {
      id: "bout-1",
      fighterAId: "participant-1",
      fighterBId: "participant-2",
      scoreA: 5,
      scoreB: 3,
      winnerParticipantId: "participant-1",
      date: "2026-09-12",
      details: { exchanges: [] },
    };
    const ranking: RankingRow[] = [{ participantId: "participant-1", position: 1, name: "Alex", rating: 1012 }];

    await service.publishBout("sheet-1", bout, ranking);

    expect(await service.getBouts("sheet-1")).toEqual([bout]);
    expect(await service.getRanking("sheet-1")).toEqual(ranking);
  });

  it("rejects an unknown spreadsheet id", async () => {
    const service = new MockCompetitionSheetService({ "sheet-1": { settings } });

    await expect(service.getSettings("missing")).rejects.toThrow(
      'Mock competition sheet "missing" does not exist.',
    );
  });
});
