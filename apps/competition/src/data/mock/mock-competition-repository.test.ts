import { describe, expect, it } from "vitest";
import { MockCompetitionRepository } from "./mock-competition-repository";
import { setSession } from "../../identity/session";

describe("MockCompetitionRepository", () => {
  it("lists the seeded competitions", async () => {
    const competitions = await new MockCompetitionRepository().listCompetitions();
    expect(competitions.map((competition) => competition.id)).toEqual([
      "competition-1",
      "competition-2",
    ]);
  });

  it("ranks participants by rating after published bouts", async () => {
    const repository = new MockCompetitionRepository();
    const ranking = await repository.getRanking("competition-1");

    expect(ranking.map((entry) => entry.participantId)).toEqual([
      "participant-1",
      "participant-3",
      "participant-4",
      "participant-2",
    ]);
    expect(ranking.map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
  });

  it("publishing a bout makes it appear in both fighters' history immediately", async () => {
    const repository = new MockCompetitionRepository();
    const draft = await repository.createBout("competition-1", {
      fighterAId: "participant-1",
      fighterBId: "participant-2",
      scoreA: 0,
      scoreB: 0,
      winnerParticipantId: null,
      date: "2026-09-14",
      details: { exchanges: [] },
    });
    const bout = await repository.publishBout("competition-1", draft.id, {
      fighterAId: "participant-1",
      fighterBId: "participant-2",
      scoreA: 5,
      scoreB: 2,
      winnerParticipantId: "participant-1",
      date: "2026-09-14",
      details: { exchanges: [] },
    });

    const fighterAHistory = await repository.getBoutsForParticipant("competition-1", "participant-1");
    const fighterBHistory = await repository.getBoutsForParticipant("competition-1", "participant-2");
    expect(fighterAHistory.map((candidate) => candidate.id)).toContain(bout.id);
    expect(fighterBHistory.map((candidate) => candidate.id)).toContain(bout.id);
  });

  it("adds a participant and lets a user register themselves once", async () => {
    setSession("mock-id-token", { email: "you@example.com", displayName: "You" });
    const repository = new MockCompetitionRepository();
    await repository.addParticipant("competition-1", "New Fighter");
    const registered = await repository.registerSelf("competition-1", "Me");

    const participants = await repository.getParticipants("competition-1");
    expect(participants.map((participant) => participant.name)).toContain("New Fighter");
    expect(registered.linkedUserEmail).toBe("you@example.com");
  });
});
