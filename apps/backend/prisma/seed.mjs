import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const defaultRulesetDefinition = {
    weaponClass: "",
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
      penalties: [],
    },
  };

  await prisma.exchange.deleteMany();
  await prisma.match.deleteMany();
  await prisma.scheduledAssignment.deleteMany();
  await prisma.scheduledPhase.deleteMany();
  await prisma.scheduleTimeSlot.deleteMany();
  await prisma.eventSchedule.deleteMany();
  await prisma.stageOfficial.deleteMany();
  await prisma.stageArena.deleteMany();
  await prisma.round.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.entry.deleteMany();
  await prisma.arena.deleteMany();
  await prisma.ruleset.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  const event = await prisma.event.create({
    data: { eventName: "HEMA Championship 2026", allFightersAreVolunteers: true },
  });
  const ruleset = await prisma.ruleset.create({
    data: {
      eventId: event.id,
      name: "Longsword Standard",
      version: 1,
      definition: defaultRulesetDefinition,
    },
  });
  await prisma.event.update({
    where: { id: event.id },
    data: { rulesetId: ruleset.id },
  });

  const tournament = await prisma.tournament.create({
    data: { eventId: event.id, name: "Open Steel Longsword", order: 0, rulesetId: ruleset.id },
  });

  const poolStage = await prisma.stage.create({
    data: {
      tournamentId: tournament.id,
      type: "POOL",
      name: "Pool Phase",
      rulesetId: ruleset.id,
      minPoolSize: 4,
      maxPoolSize: 6,
      preferredPoolSize: 4,
      timeBetweenMatchesMinutes: 2,
    },
  });
  await prisma.tournament.update({
    where: { id: tournament.id },
    data: { currentStageId: poolStage.id },
  });

  const arenaA = await prisma.arena.create({
    data: { eventId: event.id, name: "Arena A (Pool 1)", order: 0, leftColor: "#21c15b", rightColor: "#2f7dfa" },
  });
  const arenaB = await prisma.arena.create({
    data: { eventId: event.id, name: "Arena B (Pool 2)", order: 1, leftColor: "#e06c75", rightColor: "#e5c07b" },
  });

  const schedule = await prisma.eventSchedule.create({
    data: { eventId: event.id, startTimeMinutes: 540 },
  });
  const slot1 = await prisma.scheduleTimeSlot.create({
    data: { scheduleId: schedule.id, order: 0, durationMinutes: 60, label: "Ronde 1 - Pools" },
  });
  await prisma.eventSchedule.update({
    where: { id: schedule.id },
    data: { currentTimeSlotId: slot1.id },
  });

  const phase1 = await prisma.scheduledPhase.create({
    data: { stageId: poolStage.id, arenaId: arenaA.id, timeSlotId: slot1.id },
  });
  const phase2 = await prisma.scheduledPhase.create({
    data: { stageId: poolStage.id, arenaId: arenaB.id, timeSlotId: slot1.id },
  });

  const fighterData = [
    { username: "Alex 'The Blade' Visser", seed: 1 },
    { username: "Beatrix de Ruiter", seed: 2 },
    { username: "Casper van Dam", seed: 3 },
    { username: "Daan Bakker", seed: 4 },
    { username: "Elena 'Shield' Smit", seed: 5 },
    { username: "Floris de Jong", seed: 6 },
    { username: "Gijs Jansen", seed: 7 },
    { username: "Hanna Meijer", seed: 8 },
  ];

  const entries = [];
  for (const f of fighterData) {
    const user = await prisma.user.create({ data: { username: f.username } });
    const entry = await prisma.entry.create({
      data: { tournamentId: tournament.id, userId: user.id, kind: "BOTH", seed: f.seed },
    });
    entries.push({ user, entry });
  }

  for (let i = 0; i < 4; i++) {
    await prisma.scheduledAssignment.create({
      data: { scheduledPhaseId: phase1.id, userId: entries[i].user.id, role: "FIGHTER" },
    });
  }

  for (let i = 4; i < 8; i++) {
    await prisma.scheduledAssignment.create({
      data: { scheduledPhaseId: phase2.id, userId: entries[i].user.id, role: "FIGHTER" },
    });
  }

  const round = await prisma.round.create({
    data: { stageId: poolStage.id, roundNumber: slot1.order },
  });

  const pool1Fighters = entries.slice(0, 4);
  const pool1MatchResults = [
    { iA: 0, iB: 1, scoreA: 5, scoreB: 2, winner: 0, exchanges: [{ scoreA: 2, scoreB: 0 }, { scoreA: 5, scoreB: 2 }] },
    { iA: 2, iB: 3, scoreA: 3, scoreB: 4, winner: 3, exchanges: [{ scoreA: 1, scoreB: 2 }, { scoreA: 3, scoreB: 4 }] },
    { iA: 0, iB: 2, scoreA: 5, scoreB: 1, winner: 0, exchanges: [{ scoreA: 3, scoreB: 0 }, { scoreA: 5, scoreB: 1 }] },
    { iA: 1, iB: 3, scoreA: 4, scoreB: 2, winner: 1, exchanges: [{ scoreA: 2, scoreB: 1 }, { scoreA: 4, scoreB: 2 }] },
    { iA: 0, iB: 3, scoreA: 5, scoreB: 3, winner: 0, exchanges: [{ scoreA: 2, scoreB: 2 }, { scoreA: 5, scoreB: 3 }] },
    { iA: 1, iB: 2, scoreA: 3, scoreB: 3, winner: null, exchanges: [{ scoreA: 1, scoreB: 1 }, { scoreA: 3, scoreB: 3 }] },
  ];

  for (const res of pool1MatchResults) {
    const entryA = pool1Fighters[res.iA].entry;
    const entryB = pool1Fighters[res.iB].entry;
    const winnerEntry = res.winner !== null ? pool1Fighters[res.winner].entry : null;

    const match = await prisma.match.create({
      data: {
        roundId: round.id,
        arenaId: arenaA.id,
        entryAId: entryA.id,
        entryBId: entryB.id,
        scoreA: res.scoreA,
        scoreB: res.scoreB,
        winnerEntryId: winnerEntry?.id ?? null,
        rulesetId: ruleset.id,
      },
    });

    for (const ex of res.exchanges) {
      await prisma.exchange.create({
        data: {
          matchId: match.id,
          scoreA: ex.scoreA,
          scoreB: ex.scoreB,
          details: { note: `Exchange score ${ex.scoreA}-${ex.scoreB}` },
        },
      });
    }
  }

  const pool2Fighters = entries.slice(4, 8);
  const pool2MatchData = [
    { iA: 0, iB: 1, completed: true, scoreA: 4, scoreB: 1, winner: 0, exchanges: [{ scoreA: 2, scoreB: 0 }, { scoreA: 4, scoreB: 1 }] },
    { iA: 2, iB: 3, completed: false },
    { iA: 0, iB: 2, completed: false },
    { iA: 1, iB: 3, completed: false },
    { iA: 0, iB: 3, completed: false },
    { iA: 1, iB: 2, completed: false },
  ];

  for (const res of pool2MatchData) {
    const entryA = pool2Fighters[res.iA].entry;
    const entryB = pool2Fighters[res.iB].entry;

    if (res.completed) {
      const winnerEntry = res.winner !== null ? pool2Fighters[res.winner].entry : null;
      const match = await prisma.match.create({
        data: {
          roundId: round.id,
          arenaId: arenaB.id,
          entryAId: entryA.id,
          entryBId: entryB.id,
          scoreA: res.scoreA,
          scoreB: res.scoreB,
          winnerEntryId: winnerEntry?.id ?? null,
          rulesetId: ruleset.id,
        },
      });

      for (const ex of res.exchanges) {
        await prisma.exchange.create({
          data: {
            matchId: match.id,
            scoreA: ex.scoreA,
            scoreB: ex.scoreB,
            details: { note: `Exchange score ${ex.scoreA}-${ex.scoreB}` },
          },
        });
      }
    } else {
      await prisma.match.create({
        data: {
          roundId: round.id,
          arenaId: arenaB.id,
          entryAId: entryA.id,
          entryBId: entryB.id,
          scoreA: null,
          scoreB: null,
          winnerEntryId: null,
          rulesetId: ruleset.id,
        },
      });
    }
  }

  console.log("Database successfully seeded with 2 pools (Pool 1 100% finished, Pool 2 1/6 finished)!");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
