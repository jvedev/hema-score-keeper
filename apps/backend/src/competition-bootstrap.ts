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

export function initializeCompetitionDatabase(database: NativeDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS Competition (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      date TEXT NOT NULL,
      rulesetJson TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS CompetitionParticipant (
      id TEXT PRIMARY KEY,
      competitionId TEXT NOT NULL,
      name TEXT NOT NULL,
      linkedUserEmail TEXT,
      FOREIGN KEY (competitionId) REFERENCES Competition(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS CompetitionBout (
      id TEXT PRIMARY KEY,
      competitionId TEXT NOT NULL,
      fighterAId TEXT NOT NULL,
      fighterBId TEXT NOT NULL,
      scoreA INTEGER NOT NULL,
      scoreB INTEGER NOT NULL,
      winnerParticipantId TEXT,
      date TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 1,
      details TEXT NOT NULL,
      FOREIGN KEY (competitionId) REFERENCES Competition(id) ON DELETE CASCADE,
      FOREIGN KEY (fighterAId) REFERENCES CompetitionParticipant(id) ON DELETE CASCADE,
      FOREIGN KEY (fighterBId) REFERENCES CompetitionParticipant(id) ON DELETE CASCADE,
      FOREIGN KEY (winnerParticipantId) REFERENCES CompetitionParticipant(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_competition_status ON Competition(status);
    CREATE INDEX IF NOT EXISTS idx_competition_date ON Competition(date);
    CREATE INDEX IF NOT EXISTS idx_competition_participant_competitionId ON CompetitionParticipant(competitionId);
    CREATE INDEX IF NOT EXISTS idx_competition_bout_competitionId ON CompetitionBout(competitionId);
  `);

  const competitionCount = database.prepare("SELECT COUNT(*) as count FROM Competition").get() as { count: number };
  if (competitionCount.count > 0) {
    return;
  }

  const insertCompetition = database.prepare(
    "INSERT INTO Competition (id, name, slug, status, date, rulesetJson) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertParticipant = database.prepare(
    "INSERT INTO CompetitionParticipant (id, competitionId, name, linkedUserEmail) VALUES (?, ?, ?, ?)",
  );
  const insertBout = database.prepare(
    "INSERT INTO CompetitionBout (id, competitionId, fighterAId, fighterBId, scoreA, scoreB, winnerParticipantId, date, published, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );

  const competitions = [
    {
      id: "competition-1",
      name: "Autumn Longsword Open",
      slug: "autumn-longsword-open",
      status: "ACTIVE",
      date: "2026-09-12",
      participants: [
        { id: "participant-1", name: "Alex Meyer", linkedUserEmail: null },
        { id: "participant-2", name: "Blake Novak", linkedUserEmail: null },
        { id: "participant-3", name: "Casey Silva", linkedUserEmail: null },
        { id: "participant-4", name: "Drew Fischer", linkedUserEmail: null },
      ],
      bouts: [
        {
          id: "bout-1",
          fighterAId: "participant-1",
          fighterBId: "participant-2",
          scoreA: 5,
          scoreB: 3,
          winnerParticipantId: "participant-1",
          date: "2026-09-12",
          details: { note: "Pool bout 1" },
        },
        {
          id: "bout-2",
          fighterAId: "participant-3",
          fighterBId: "participant-4",
          scoreA: 2,
          scoreB: 2,
          winnerParticipantId: null,
          date: "2026-09-12",
          details: { note: "Pool bout 2" },
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
        { id: "participant-5", name: "Emery Janssen", linkedUserEmail: null },
        { id: "participant-6", name: "Frankie Ruiz", linkedUserEmail: null },
      ],
      bouts: [
        {
          id: "bout-3",
          fighterAId: "participant-5",
          fighterBId: "participant-6",
          scoreA: 4,
          scoreB: 1,
          winnerParticipantId: "participant-5",
          date: "2026-12-05",
          details: { note: "Knockout bout" },
        },
      ],
    },
    {
      id: "competition-3",
      name: "Spring Rapier Challenge",
      slug: "spring-rapier-challenge",
      status: "PUBLIC",
      date: "2027-03-21",
      participants: [],
      bouts: [],
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
      );
    }

    for (const bout of competition.bouts) {
      insertBout.run(
        bout.id,
        competition.id,
        bout.fighterAId,
        bout.fighterBId,
        bout.scoreA,
        bout.scoreB,
        bout.winnerParticipantId,
        bout.date,
        1,
        JSON.stringify(bout.details),
      );
    }
  }
}
