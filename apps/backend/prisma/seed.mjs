import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.exchange.deleteMany();
  await prisma.match.deleteMany();
  await prisma.stageArena.deleteMany();
  await prisma.round.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.arena.deleteMany();
  await prisma.entry.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  const event = await prisma.event.create({
    data: { eventName: "Voorbeeldtoernooi", ruleset: "Round robin" },
  });

  const arenaA = await prisma.arena.create({
    data: { eventId: event.id, name: "Arena A", order: 1 },
  });
  const arenaB = await prisma.arena.create({
    data: { eventId: event.id, name: "Arena B", order: 2 },
  });

  const fighters = [];
  for (let index = 1; index <= 20; index += 1) {
    const user = await prisma.user.create({
      data: {
        username: `fighter-${String(index).padStart(2, "0")}`,
      },
    });
    fighters.push(user);
  }

  const officials = [];
  for (const username of ["judge-01", "jury-01", "teller-01"]) {
    officials.push(
      await prisma.user.create({
        data: { username },
      }),
    );
  }

  const stage = await prisma.stage.create({
    data: {
      eventId: event.id,
      type: "POOL",
      name: "Poolfase",
      ruleset: "Round robin",
    },
  });

  await prisma.stageArena.createMany({
    data: [
      { stageId: stage.id, arenaId: arenaA.id },
      { stageId: stage.id, arenaId: arenaB.id },
    ],
  });

  await prisma.entry.createMany({
    data: fighters.map((user, index) => ({
      eventId: event.id,
      userId: user.id,
      kind: "FIGHTER",
      seed: index + 1,
    })),
  });

  const officialEntries = [];
  for (const user of officials) {
    officialEntries.push(
      await prisma.entry.create({
        data: {
          eventId: event.id,
          userId: user.id,
          kind: "OFFICIAL",
        },
      }),
    );
  }

  await prisma.stageOfficial.createMany({
    data: officialEntries.map((entry, index) => ({
      stageId: stage.id,
      entryId: entry.id,
      role: ["JUDGE", "JURY", "TELLER"][index],
    })),
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
