import BetterSqlite3 from "better-sqlite3";

type NativeDatabase = InstanceType<typeof BetterSqlite3>;

const defaultRuleset = {
  weaponClass: "Longsword",
  matchParameters: {
    maxDurationSeconds: 180,
    stopOnTimeOut: true,
    maxPointsCap: 10,
    pointSpreadVictory: 5,
    scores: [1, 2, 3, 4],
    maxDoubles: 3,
    allowAfterBlow: true,
    countDoubles: true,
    useNetScore: true,
    penalties: [
      { description: "Late in ring", penalties: [0], disqualify: true },
      { description: "Unsportsmanlike conduct", penalties: [0, 1, 2, 3], disqualify: true },
      { description: "Illegal target", penalties: [0, 1, 2, 3], disqualify: false },
      { description: "Bull rushing", penalties: [0, 1], disqualify: false },
    ],
  },
};

/**
 * Adds the demo competitions (competition-1..3) when the database has no competitions yet. Only the dev seed
 * (`scripts/seed-database.mjs`) and tests call it; a real database starts without demo data.
 */
export function seedDemoCompetitionsIfEmpty(database: NativeDatabase): void {
  const competitionCount = database.prepare("SELECT COUNT(*) as count FROM Competition").get() as { count: number };
  if (competitionCount.count > 0) {
    return;
  }

  const insertCompetition = database.prepare(
    "INSERT INTO Competition (id, name, slug, status, date, rulesetJson) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertParticipant = database.prepare(
    "INSERT INTO CompetitionParticipant (id, competitionId, name, linkedUserEmail, kind) VALUES (?, ?, ?, ?, ?)",
  );
  const insertMatch = database.prepare(
    "INSERT INTO CompetitionBout (id, competitionId, fighterAId, fighterBId, scoreA, scoreB, winnerParticipantId, date, published, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );

  const competitions = [
    {
      id: "competition-1",
      name: "Autumn Longsword Open",
      slug: "autumn-longsword-open",
      status: "RUNNING",
      date: "2026-09-12",
      participants: [
        { id: "participant-1", name: "Alex Meyer", linkedUserEmail: null, kind: "MEMBER" },
        { id: "participant-2", name: "Blake Novak", linkedUserEmail: null, kind: "MEMBER" },
        { id: "participant-3", name: "Casey Silva", linkedUserEmail: null, kind: "MEMBER" },
        { id: "participant-4", name: "Drew Fischer", linkedUserEmail: null, kind: "MEMBER" },
      ],
      matches: [
        {
          id: "bout-1",
          fighterAId: "participant-1",
          fighterBId: "participant-2",
          scoreA: 5,
          scoreB: 3,
          winnerParticipantId: "participant-1",
          date: "2026-09-12",
          details: { note: "Pool match 1", events: [] },
        },
        {
          id: "bout-2",
          fighterAId: "participant-3",
          fighterBId: "participant-4",
          scoreA: 2,
          scoreB: 2,
          winnerParticipantId: null,
          date: "2026-09-12",
          details: { note: "Pool match 2", events: [] },
        },
      ],
    },
    {
      id: "competition-2",
      name: "Winter Sabre Cup",
      slug: "winter-sabre-cup",
      status: "ARCHIVED",
      date: "2026-12-05",
      participants: [
        { id: "participant-5", name: "Emery Janssen", linkedUserEmail: null, kind: "MEMBER" },
        { id: "participant-6", name: "Frankie Ruiz", linkedUserEmail: null, kind: "MEMBER" },
      ],
      matches: [
        {
          id: "bout-3",
          fighterAId: "participant-5",
          fighterBId: "participant-6",
          scoreA: 4,
          scoreB: 1,
          winnerParticipantId: "participant-5",
          date: "2026-12-05",
          details: { note: "Knockout match", events: [] },
        },
      ],
    },
    {
      id: "competition-3",
      name: "Spring Rapier Challenge",
      slug: "spring-rapier-challenge",
      status: "DRAFT",
      date: "2027-03-21",
      participants: [],
      matches: [],
    },
  ];

  for (const competition of competitions) {
    insertCompetition.run(
      competition.id,
      competition.name,
      competition.slug,
      competition.status,
      competition.date,
      JSON.stringify(defaultRuleset),
    );

    for (const participant of competition.participants) {
      insertParticipant.run(
        participant.id,
        competition.id,
        participant.name,
        participant.linkedUserEmail,
        participant.kind ?? "MEMBER",
      );
    }

    for (const match of competition.matches) {
      insertMatch.run(
        match.id,
        competition.id,
        match.fighterAId,
        match.fighterBId,
        match.scoreA,
        match.scoreB,
        match.winnerParticipantId,
        match.date,
        1,
        JSON.stringify(match.details),
      );
    }
  }
}
