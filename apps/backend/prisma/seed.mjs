import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.exchange.deleteMany();
  await prisma.match.deleteMany();
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
    data: { eventName: "Example tournament", allFightersAreVolunteers: true },
  });
  const ruleset = await prisma.ruleset.create({
    data: {
      eventId: event.id,
      name: "Round robin",
      version: 1,
    },
  });
  await prisma.event.update({
    where: { id: event.id },
    data: { rulesetId: ruleset.id },
  });
  const tournament = await prisma.tournament.create({
    data: { eventId: event.id, name: "Open steel", order: 0, rulesetId: ruleset.id },
  });
  const arena = await prisma.arena.create({
    data: { eventId: event.id, name: "Arena A", order: 0 },
  });
  const fighter = await prisma.user.create({ data: { username: "fighter-01" } });
  const volunteer = await prisma.user.create({ data: { username: "volunteer-01" } });
  const fighterEntry = await prisma.entry.create({
    data: { tournamentId: tournament.id, userId: fighter.id, kind: "BOTH", seed: 1 },
  });
  const volunteerEntry = await prisma.entry.create({
    data: { tournamentId: tournament.id, userId: volunteer.id, kind: "VOLUNTEER" },
  });
  await prisma.skill.createMany({
    data: [
      { userId: fighter.id, skillName: "JUDGE", skillLevel: 3 },
      { userId: volunteer.id, skillName: "JURY", skillLevel: 4 },
    ],
  });
  const stage = await prisma.stage.create({
    data: {
      tournamentId: tournament.id,
      type: "POOL",
      name: "Pool phase",
      rulesetId: ruleset.id,
      minPoolSize: 4,
      maxPoolSize: 6,
      preferredPoolSize: 5,
      timeBetweenMatchesMinutes: 2,
    },
  });
  await prisma.stageArena.create({ data: { stageId: stage.id, arenaId: arena.id } });
  await prisma.stageOfficial.createMany({
    data: [
      { stageId: stage.id, entryId: fighterEntry.id, role: "JUDGE" },
      { stageId: stage.id, entryId: volunteerEntry.id, role: "JURY" },
    ],
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
