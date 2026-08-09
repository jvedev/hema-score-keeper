import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  ensureJsonValue,
  ensureObject,
  HttpError,
  optionalString,
  readJsonBody,
  requirePositiveInteger,
  requireString,
  sendError,
  sendJson,
} from "./http.js";

type Handler = (request: IncomingMessage, params: Record<string, string>) => Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

const routes: Route[] = [
  { method: "GET", pattern: /^\/health$/, handler: health },
  { method: "GET", pattern: /^\/api\/v1\/users$/, handler: listUsers },
  { method: "POST", pattern: /^\/api\/v1\/users$/, handler: createUser },
  { method: "GET", pattern: /^\/api\/v1\/users\/([^/]+)$/, handler: getUser },
  { method: "PATCH", pattern: /^\/api\/v1\/users\/([^/]+)$/, handler: updateUser },
  { method: "DELETE", pattern: /^\/api\/v1\/users\/([^/]+)$/, handler: deleteUser },
  { method: "GET", pattern: /^\/api\/v1\/skills$/, handler: listSkills },
  { method: "POST", pattern: /^\/api\/v1\/skills$/, handler: createSkill },
  { method: "GET", pattern: /^\/api\/v1\/skills\/([^/]+)$/, handler: getSkill },
  { method: "PATCH", pattern: /^\/api\/v1\/skills\/([^/]+)$/, handler: updateSkill },
  { method: "DELETE", pattern: /^\/api\/v1\/skills\/([^/]+)$/, handler: deleteSkill },
  { method: "GET", pattern: /^\/api\/v1\/events$/, handler: listEvents },
  { method: "POST", pattern: /^\/api\/v1\/events$/, handler: createEvent },
  { method: "GET", pattern: /^\/api\/v1\/events\/([^/]+)$/, handler: getEvent },
  { method: "PATCH", pattern: /^\/api\/v1\/events\/([^/]+)$/, handler: updateEvent },
  { method: "DELETE", pattern: /^\/api\/v1\/events\/([^/]+)$/, handler: deleteEvent },
  { method: "GET", pattern: /^\/api\/v1\/arenas$/, handler: listArenas },
  { method: "POST", pattern: /^\/api\/v1\/arenas$/, handler: createArena },
  { method: "GET", pattern: /^\/api\/v1\/arenas\/([^/]+)$/, handler: getArena },
  { method: "PATCH", pattern: /^\/api\/v1\/arenas\/([^/]+)$/, handler: updateArena },
  { method: "DELETE", pattern: /^\/api\/v1\/arenas\/([^/]+)$/, handler: deleteArena },
  { method: "GET", pattern: /^\/api\/v1\/entries$/, handler: listEntries },
  { method: "POST", pattern: /^\/api\/v1\/entries$/, handler: createEntry },
  { method: "GET", pattern: /^\/api\/v1\/entries\/([^/]+)$/, handler: getEntry },
  { method: "PATCH", pattern: /^\/api\/v1\/entries\/([^/]+)$/, handler: updateEntry },
  { method: "DELETE", pattern: /^\/api\/v1\/entries\/([^/]+)$/, handler: deleteEntry },
  { method: "GET", pattern: /^\/api\/v1\/stages$/, handler: listStages },
  { method: "POST", pattern: /^\/api\/v1\/stages$/, handler: createStage },
  { method: "GET", pattern: /^\/api\/v1\/stages\/([^/]+)$/, handler: getStage },
  { method: "PATCH", pattern: /^\/api\/v1\/stages\/([^/]+)$/, handler: updateStage },
  { method: "DELETE", pattern: /^\/api\/v1\/stages\/([^/]+)$/, handler: deleteStage },
  { method: "GET", pattern: /^\/api\/v1\/stages\/([^/]+)\/arenas$/, handler: listStageArenas },
  { method: "POST", pattern: /^\/api\/v1\/stages\/([^/]+)\/arenas$/, handler: createStageArena },
  { method: "DELETE", pattern: /^\/api\/v1\/stages\/([^/]+)\/arenas\/([^/]+)$/, handler: deleteStageArena },
  { method: "GET", pattern: /^\/api\/v1\/stages\/([^/]+)\/officials$/, handler: listStageOfficials },
  { method: "POST", pattern: /^\/api\/v1\/stages\/([^/]+)\/officials$/, handler: createStageOfficial },
  { method: "DELETE", pattern: /^\/api\/v1\/stage-officials\/([^/]+)$/, handler: deleteStageOfficial },
  { method: "GET", pattern: /^\/api\/v1\/rounds$/, handler: listRounds },
  { method: "POST", pattern: /^\/api\/v1\/rounds$/, handler: createRound },
  { method: "GET", pattern: /^\/api\/v1\/rounds\/([^/]+)$/, handler: getRound },
  { method: "PATCH", pattern: /^\/api\/v1\/rounds\/([^/]+)$/, handler: updateRound },
  { method: "DELETE", pattern: /^\/api\/v1\/rounds\/([^/]+)$/, handler: deleteRound },
  { method: "GET", pattern: /^\/api\/v1\/matches$/, handler: listMatches },
  { method: "POST", pattern: /^\/api\/v1\/matches$/, handler: createMatch },
  { method: "GET", pattern: /^\/api\/v1\/matches\/([^/]+)$/, handler: getMatch },
  { method: "PATCH", pattern: /^\/api\/v1\/matches\/([^/]+)$/, handler: updateMatch },
  { method: "DELETE", pattern: /^\/api\/v1\/matches\/([^/]+)$/, handler: deleteMatch },
  { method: "GET", pattern: /^\/api\/v1\/exchanges$/, handler: listExchanges },
  { method: "POST", pattern: /^\/api\/v1\/exchanges$/, handler: createExchange },
  { method: "GET", pattern: /^\/api\/v1\/exchanges\/([^/]+)$/, handler: getExchange },
  { method: "PATCH", pattern: /^\/api\/v1\/exchanges\/([^/]+)$/, handler: updateExchange },
  { method: "DELETE", pattern: /^\/api\/v1\/exchanges\/([^/]+)$/, handler: deleteExchange },
];

const server = createServer(async (request, response) => {
  try {
    await handleRequest(request, response);
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(3001, () => {
  console.log("HEMA backend listening on http://localhost:3001");
});

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const route = routes.find((item) => item.method === request.method && item.pattern.test(url.pathname));
  if (!route) {
    sendJson(response, 404, { error: "Not Found" });
    return;
  }

  const match = route.pattern.exec(url.pathname);
  if (!match) {
    throw new HttpError(404, "Not Found");
  }

  const params: Record<string, string> = {};
  match.slice(1).forEach((value, index) => {
    params[`p${index}`] = value;
  });

  const result = await route.handler(request, params);
  if (result === undefined) {
    response.statusCode = 204;
    response.end();
    return;
  }

  sendJson(response, 200, result);
}

function routeId(params: Record<string, string>): string {
  const value = params.p0;
  if (!value) {
    throw new HttpError(500, "Missing route parameter.");
  }

  return value;
}

function param(params: Record<string, string>, index: number, label: string): string {
  const value = params[`p${index}`];
  if (!value) {
    throw new HttpError(500, `Missing route parameter: ${label}.`);
  }

  return value;
}

async function health(): Promise<unknown> {
  return { ok: true };
}

async function listUsers(): Promise<unknown> {
  return prisma.user.findMany({
    orderBy: { username: "asc" },
    include: { skills: true, entries: true },
  });
}

async function createUser(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "User");
  const username = requireString(body.username, "Username");

  return prisma.user.create({
    data: { username },
  });
}

async function getUser(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireUser(routeId(params));
}

async function updateUser(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "User");
  const data: { username?: string } = {};

  if (body.username !== undefined) {
    data.username = requireString(body.username, "Username");
  }

  return prisma.user.update({
    where: { id: routeId(params) },
    data,
  });
}

async function deleteUser(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.user.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listSkills(): Promise<unknown> {
  return prisma.skill.findMany({
    orderBy: [{ skillName: "asc" }, { skillLevel: "asc" }],
    include: { user: true },
  });
}

async function createSkill(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Skill");
  const userId = requireString(body.userId, "User ID");
  const skillName = requireString(body.skillName, "Skill name");
  const skillLevel = requirePositiveInteger(body.skillLevel, "Skill level");

  await requireUser(userId);

  return prisma.skill.create({
    data: { userId, skillName, skillLevel },
    include: { user: true },
  });
}

async function getSkill(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireSkill(routeId(params));
}

async function updateSkill(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Skill");
  const data: { userId?: string; skillName?: string; skillLevel?: number } = {};

  if (body.userId !== undefined) {
    const userId = requireString(body.userId, "User ID");
    await requireUser(userId);
    data.userId = userId;
  }
  if (body.skillName !== undefined) {
    data.skillName = requireString(body.skillName, "Skill name");
  }
  if (body.skillLevel !== undefined) {
    data.skillLevel = requirePositiveInteger(body.skillLevel, "Skill level");
  }

  return prisma.skill.update({
    where: { id: routeId(params) },
    data,
    include: { user: true },
  });
}

async function deleteSkill(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.skill.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listEvents(): Promise<unknown> {
  return prisma.event.findMany({
    orderBy: { eventName: "asc" },
    include: {
      entries: { include: { user: true } },
      stages: { include: { rounds: true, arenas: true, officials: { include: { entry: { include: { user: true } } } } } },
      arenas: true,
    },
  });
}

async function createEvent(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Event");
  const eventName = requireString(body.eventName, "Event name");
  const ruleset = body.ruleset === undefined ? undefined : optionalString(body.ruleset);

  return prisma.event.create({
    data: {
      eventName,
      ...(ruleset !== undefined ? { ruleset } : {}),
    },
  });
}

async function getEvent(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireEvent(routeId(params));
}

async function updateEvent(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Event");
  const data: { eventName?: string; ruleset?: string | null } = {};

  if (body.eventName !== undefined) {
    data.eventName = requireString(body.eventName, "Event name");
  }
  if (body.ruleset !== undefined) {
    data.ruleset = optionalString(body.ruleset) ?? null;
  }

  return prisma.event.update({
    where: { id: routeId(params) },
    data,
  });
}

async function deleteEvent(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.event.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listArenas(): Promise<unknown> {
  return prisma.arena.findMany({
    orderBy: [{ eventId: "asc" }, { order: "asc" }, { name: "asc" }],
    include: {
      event: true,
      stages: { include: { stage: true } },
      matches: true,
    },
  });
}

async function createArena(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Arena");
  const eventId = requireString(body.eventId, "Event ID");
  const name = requireString(body.name, "Arena name");
  const order = body.order === undefined ? 0 : requirePositiveInteger(body.order, "Arena order");

  await requireEvent(eventId);

  return prisma.arena.create({
    data: {
      eventId,
      name,
      order,
    },
    include: {
      event: true,
      stages: { include: { stage: true } },
      matches: true,
    },
  });
}

async function getArena(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireArena(routeId(params));
}

async function updateArena(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Arena");
  const data: { eventId?: string; name?: string; order?: number } = {};

  if (body.eventId !== undefined) {
    const eventId = requireString(body.eventId, "Event ID");
    await requireEvent(eventId);
    data.eventId = eventId;
  }
  if (body.name !== undefined) {
    data.name = requireString(body.name, "Arena name");
  }
  if (body.order !== undefined) {
    data.order = requirePositiveInteger(body.order, "Arena order");
  }

  return prisma.arena.update({
    where: { id: routeId(params) },
    data,
    include: {
      event: true,
      stages: { include: { stage: true } },
      matches: true,
    },
  });
}

async function deleteArena(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.arena.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listEntries(): Promise<unknown> {
  return prisma.entry.findMany({
    orderBy: [{ seed: "asc" }, { id: "asc" }],
    include: { event: true, user: true, stageOfficials: true },
  });
}

async function createEntry(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Entry");
  const eventId = requireString(body.eventId, "Event ID");
  const userId = requireString(body.userId, "User ID");
  const kind = body.kind === undefined ? undefined : parseEntryKind(body.kind);
  const seed = body.seed === undefined ? undefined : requirePositiveInteger(body.seed, "Seed");

  await requireEvent(eventId);
  await requireUser(userId);

  return prisma.entry.create({
    data: {
      eventId,
      userId,
      ...(kind !== undefined ? { kind } : {}),
      ...(seed !== undefined ? { seed } : {}),
    },
    include: { event: true, user: true, stageOfficials: true },
  });
}

async function getEntry(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireEntry(routeId(params));
}

async function updateEntry(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Entry");
  const data: { eventId?: string; userId?: string; kind?: "FIGHTER" | "OFFICIAL"; seed?: number | null } = {};

  if (body.eventId !== undefined) {
    const eventId = requireString(body.eventId, "Event ID");
    await requireEvent(eventId);
    data.eventId = eventId;
  }
  if (body.userId !== undefined) {
    const userId = requireString(body.userId, "User ID");
    await requireUser(userId);
    data.userId = userId;
  }
  if (body.kind !== undefined) {
    data.kind = parseEntryKind(body.kind);
  }
  if (body.seed !== undefined) {
    data.seed = body.seed === null ? null : requirePositiveInteger(body.seed, "Seed");
  }

  return prisma.entry.update({
    where: { id: routeId(params) },
    data,
    include: { event: true, user: true, stageOfficials: true },
  });
}

async function deleteEntry(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.entry.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listStages(): Promise<unknown> {
  return prisma.stage.findMany({
    orderBy: [{ eventId: "asc" }, { type: "asc" }, { name: "asc" }],
    include: { event: true, rounds: true, arenas: { include: { arena: true } }, officials: { include: { entry: { include: { user: true } } } } },
  });
}

async function createStage(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Stage");
  const eventId = requireString(body.eventId, "Event ID");
  const type = parseStageType(body.type);
  const name = body.name === undefined ? undefined : optionalString(body.name);
  const ruleset = body.ruleset === undefined ? undefined : optionalString(body.ruleset);

  await requireEvent(eventId);

  return prisma.stage.create({
    data: {
      eventId,
      type,
      ...(name !== undefined ? { name } : {}),
      ...(ruleset !== undefined ? { ruleset } : {}),
    },
    include: { event: true, rounds: true, arenas: { include: { arena: true } }, officials: { include: { entry: { include: { user: true } } } } },
  });
}

async function getStage(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireStage(routeId(params));
}

async function updateStage(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Stage");
  const data: {
    eventId?: string;
    type?: "POOL" | "ELIMINATION" | "FINAL";
    name?: string | null;
    ruleset?: string | null;
  } = {};

  if (body.eventId !== undefined) {
    const eventId = requireString(body.eventId, "Event ID");
    await requireEvent(eventId);
    data.eventId = eventId;
  }
  if (body.type !== undefined) {
    data.type = parseStageType(body.type);
  }
  if (body.name !== undefined) {
    data.name = optionalString(body.name) ?? null;
  }
  if (body.ruleset !== undefined) {
    data.ruleset = optionalString(body.ruleset) ?? null;
  }

  return prisma.stage.update({
    where: { id: routeId(params) },
    data,
    include: { event: true, rounds: true, arenas: { include: { arena: true } }, officials: { include: { entry: { include: { user: true } } } } },
  });
}

async function deleteStage(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.stage.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listStageArenas(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const stageId = routeId(params);
  await requireStage(stageId);
  return prisma.stageArena.findMany({
    where: { stageId },
    orderBy: { id: "asc" },
    include: { arena: true, stage: true },
  });
}

async function createStageArena(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const stageId = routeId(params);
  await requireStage(stageId);
  const body = ensureObject(await readJsonBody(request), "Stage arena");
  const arenaId = requireString(body.arenaId, "Arena ID");
  await requireArena(arenaId);

  return prisma.stageArena.create({
    data: { stageId, arenaId },
    include: { arena: true, stage: true },
  });
}

async function deleteStageArena(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const stageId = routeId(params);
  const arenaId = param(params, 1, "arenaId");
  const assignment = await prisma.stageArena.findUnique({
    where: { stageId_arenaId: { stageId, arenaId } },
  });
  if (!assignment) {
    throw new HttpError(404, `Stage arena assignment "${stageId}/${arenaId}" not found.`);
  }

  await prisma.stageArena.delete({
    where: { stageId_arenaId: { stageId, arenaId } },
  });
  return undefined;
}

async function listStageOfficials(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const stageId = routeId(params);
  await requireStage(stageId);
  return prisma.stageOfficial.findMany({
    where: { stageId },
    orderBy: [{ role: "asc" }, { id: "asc" }],
    include: { stage: true, entry: { include: { user: true } } },
  });
}

async function createStageOfficial(
  request: IncomingMessage,
  params: Record<string, string>,
): Promise<unknown> {
  const stageId = routeId(params);
  const stage = await requireStage(stageId);
  const body = ensureObject(await readJsonBody(request), "Stage official");
  const entryId = requireString(body.entryId, "Entry ID");
  const role = parseStageOfficialRole(body.role);

  const entry = await requireEntry(entryId);
  if (entry.eventId !== stage.eventId) {
    throw new HttpError(400, "Official must belong to the same event as the stage.");
  }
  if (entry.kind !== "OFFICIAL") {
    throw new HttpError(400, "Only official entries can be assigned as stage officials.");
  }

  return prisma.stageOfficial.create({
    data: { stageId, entryId, role },
    include: { stage: true, entry: { include: { user: true } } },
  });
}

async function deleteStageOfficial(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.stageOfficial.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listRounds(): Promise<unknown> {
  return prisma.round.findMany({
    orderBy: [{ stageId: "asc" }, { roundNumber: "asc" }],
    include: { stage: { include: { event: true } }, matches: true },
  });
}

async function createRound(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Round");
  const stageId = requireString(body.stageId, "Stage ID");
  const roundNumber = requirePositiveInteger(body.roundNumber, "Round number");

  await requireStage(stageId);

  return prisma.round.create({
    data: { stageId, roundNumber },
    include: { stage: { include: { event: true } }, matches: true },
  });
}

async function getRound(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireRound(routeId(params));
}

async function updateRound(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Round");
  const data: { stageId?: string; roundNumber?: number } = {};

  if (body.stageId !== undefined) {
    const stageId = requireString(body.stageId, "Stage ID");
    await requireStage(stageId);
    data.stageId = stageId;
  }
  if (body.roundNumber !== undefined) {
    data.roundNumber = requirePositiveInteger(body.roundNumber, "Round number");
  }

  return prisma.round.update({
    where: { id: routeId(params) },
    data,
    include: { stage: { include: { event: true } }, matches: true },
  });
}

async function deleteRound(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.round.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listMatches(): Promise<unknown> {
  return prisma.match.findMany({
    orderBy: [{ roundId: "asc" }, { id: "asc" }],
    include: {
      round: { include: { stage: { include: { event: true } } } },
      arena: true,
      entryA: { include: { user: true, event: true } },
      entryB: { include: { user: true, event: true } },
      winnerEntry: { include: { user: true, event: true } },
      exchanges: { orderBy: { id: "asc" } },
    },
  });
}

async function createMatch(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Match");
  const roundId = requireString(body.roundId, "Round ID");
  const arenaId = body.arenaId === undefined ? undefined : optionalString(body.arenaId);
  const entryAId = body.entryAId === undefined ? undefined : optionalString(body.entryAId);
  const entryBId = body.entryBId === undefined ? undefined : optionalString(body.entryBId);
  const winnerEntryId =
    body.winnerEntryId === undefined ? undefined : optionalString(body.winnerEntryId);
  const scoreA = body.scoreA === undefined ? undefined : requirePositiveInteger(body.scoreA, "Score A");
  const scoreB = body.scoreB === undefined ? undefined : requirePositiveInteger(body.scoreB, "Score B");
  const ruleset = body.ruleset === undefined ? undefined : optionalString(body.ruleset);

  await requireRound(roundId);
  if (arenaId) await requireArena(arenaId);
  if (entryAId) await requireEntry(entryAId);
  if (entryBId) await requireEntry(entryBId);
  if (winnerEntryId) await requireEntry(winnerEntryId);

  return prisma.match.create({
    data: {
      roundId,
      ...(arenaId !== undefined ? { arenaId } : {}),
      ...(entryAId !== undefined ? { entryAId } : {}),
      ...(entryBId !== undefined ? { entryBId } : {}),
      ...(winnerEntryId !== undefined ? { winnerEntryId } : {}),
      ...(scoreA !== undefined ? { scoreA } : {}),
      ...(scoreB !== undefined ? { scoreB } : {}),
      ...(ruleset !== undefined ? { ruleset } : {}),
    },
    include: {
      round: { include: { stage: { include: { event: true } } } },
      arena: true,
      entryA: { include: { user: true, event: true } },
      entryB: { include: { user: true, event: true } },
      winnerEntry: { include: { user: true, event: true } },
      exchanges: true,
    },
  });
}

async function getMatch(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireMatch(routeId(params));
}

async function updateMatch(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Match");
  const data: {
    roundId?: string;
    arenaId?: string | null;
    entryAId?: string | null;
    entryBId?: string | null;
    winnerEntryId?: string | null;
    scoreA?: number | null;
    scoreB?: number | null;
    ruleset?: string | null;
  } = {};

  if (body.roundId !== undefined) {
    const roundId = requireString(body.roundId, "Round ID");
    await requireRound(roundId);
    data.roundId = roundId;
  }
  if (body.arenaId !== undefined) {
    const arenaId = optionalString(body.arenaId);
    if (arenaId) await requireArena(arenaId);
    data.arenaId = arenaId ?? null;
  }
  if (body.entryAId !== undefined) {
    const entryAId = optionalString(body.entryAId);
    if (entryAId) await requireEntry(entryAId);
    data.entryAId = entryAId ?? null;
  }
  if (body.entryBId !== undefined) {
    const entryBId = optionalString(body.entryBId);
    if (entryBId) await requireEntry(entryBId);
    data.entryBId = entryBId ?? null;
  }
  if (body.winnerEntryId !== undefined) {
    const winnerEntryId = optionalString(body.winnerEntryId);
    if (winnerEntryId) await requireEntry(winnerEntryId);
    data.winnerEntryId = winnerEntryId ?? null;
  }
  if (body.scoreA !== undefined) {
    data.scoreA = body.scoreA === null ? null : requirePositiveInteger(body.scoreA, "Score A");
  }
  if (body.scoreB !== undefined) {
    data.scoreB = body.scoreB === null ? null : requirePositiveInteger(body.scoreB, "Score B");
  }
  if (body.ruleset !== undefined) {
    data.ruleset = optionalString(body.ruleset) ?? null;
  }

  return prisma.match.update({
    where: { id: routeId(params) },
    data,
    include: {
      round: { include: { stage: { include: { event: true } } } },
      arena: true,
      entryA: { include: { user: true, event: true } },
      entryB: { include: { user: true, event: true } },
      winnerEntry: { include: { user: true, event: true } },
      exchanges: { orderBy: { id: "asc" } },
    },
  });
}

async function deleteMatch(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.match.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listExchanges(): Promise<unknown> {
  return prisma.exchange.findMany({
    orderBy: [{ matchId: "asc" }, { id: "asc" }],
    include: {
      match: {
        include: {
          round: { include: { stage: { include: { event: true } } } },
          arena: true,
        },
      },
    },
  });
}

async function createExchange(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Exchange");
  const matchId = requireString(body.matchId, "Match ID");
  const scoreA = body.scoreA === undefined ? undefined : requirePositiveInteger(body.scoreA, "Score A");
  const scoreB = body.scoreB === undefined ? undefined : requirePositiveInteger(body.scoreB, "Score B");

  await requireMatch(matchId);

  return prisma.exchange.create({
    data: {
      matchId,
      ...(scoreA !== undefined ? { scoreA } : {}),
      ...(scoreB !== undefined ? { scoreB } : {}),
      ...(body.details === undefined
        ? {}
        : {
            details: body.details === null ? Prisma.JsonNull : ensureJsonValue(body.details),
          }),
    },
    include: {
      match: {
        include: {
          round: { include: { stage: { include: { event: true } } } },
          arena: true,
        },
      },
    },
  });
}

async function getExchange(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireExchange(routeId(params));
}

async function updateExchange(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Exchange");
  const data: {
    matchId?: string;
    scoreA?: number | null;
    scoreB?: number | null;
    details?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  } = {};

  if (body.matchId !== undefined) {
    const matchId = requireString(body.matchId, "Match ID");
    await requireMatch(matchId);
    data.matchId = matchId;
  }
  if (body.scoreA !== undefined) {
    data.scoreA = body.scoreA === null ? null : requirePositiveInteger(body.scoreA, "Score A");
  }
  if (body.scoreB !== undefined) {
    data.scoreB = body.scoreB === null ? null : requirePositiveInteger(body.scoreB, "Score B");
  }
  if (body.details !== undefined) {
    data.details = body.details === null ? Prisma.JsonNull : ensureJsonValue(body.details);
  }

  return prisma.exchange.update({
    where: { id: routeId(params) },
    data,
    include: {
      match: {
        include: {
          round: { include: { stage: { include: { event: true } } } },
          arena: true,
        },
      },
    },
  });
}

async function deleteExchange(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.exchange.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function requireUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new HttpError(404, `User "${id}" not found.`);
  }
  return user;
}

async function requireSkill(id: string) {
  const skill = await prisma.skill.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!skill) {
    throw new HttpError(404, `Skill "${id}" not found.`);
  }
  return skill;
}

async function requireEvent(id: string) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      entries: { include: { user: true } },
      stages: { include: { rounds: true, arenas: true, officials: { include: { entry: { include: { user: true } } } } } },
      arenas: true,
    },
  });
  if (!event) {
    throw new HttpError(404, `Event "${id}" not found.`);
  }
  return event;
}

async function requireArena(id: string) {
  const arena = await prisma.arena.findUnique({
    where: { id },
    include: { event: true, stages: { include: { stage: true } }, matches: true },
  });
  if (!arena) {
    throw new HttpError(404, `Arena "${id}" not found.`);
  }
  return arena;
}

async function requireEntry(id: string) {
  const entry = await prisma.entry.findUnique({
    where: { id },
    include: { event: true, user: true },
  });
  if (!entry) {
    throw new HttpError(404, `Entry "${id}" not found.`);
  }
  return entry;
}

async function requireStage(id: string) {
  const stage = await prisma.stage.findUnique({
    where: { id },
    include: { event: true, rounds: true, arenas: { include: { arena: true } }, officials: { include: { entry: { include: { user: true } } } } },
  });
  if (!stage) {
    throw new HttpError(404, `Stage "${id}" not found.`);
  }
  return stage;
}

async function requireRound(id: string) {
  const round = await prisma.round.findUnique({
    where: { id },
    include: {
      stage: { include: { event: true } },
      matches: true,
    },
  });
  if (!round) {
    throw new HttpError(404, `Round "${id}" not found.`);
  }
  return round;
}

async function requireMatch(id: string) {
  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      round: { include: { stage: { include: { event: true } } } },
      arena: true,
      entryA: { include: { user: true, event: true } },
      entryB: { include: { user: true, event: true } },
      winnerEntry: { include: { user: true, event: true } },
      exchanges: true,
    },
  });
  if (!match) {
    throw new HttpError(404, `Match "${id}" not found.`);
  }
  return match;
}

async function requireExchange(id: string) {
  const exchange = await prisma.exchange.findUnique({
    where: { id },
    include: {
      match: {
        include: {
          round: { include: { stage: { include: { event: true } } } },
          arena: true,
        },
      },
    },
  });
  if (!exchange) {
    throw new HttpError(404, `Exchange "${id}" not found.`);
  }
  return exchange;
}

function parseStageType(value: unknown): "POOL" | "ELIMINATION" | "FINAL" {
  const type = requireString(value, "Stage type");
  if (!["POOL", "ELIMINATION", "FINAL"].includes(type)) {
    throw new HttpError(400, "Stage type must be POOL, ELIMINATION, or FINAL.");
  }
  return type as "POOL" | "ELIMINATION" | "FINAL";
}

function parseEntryKind(value: unknown): "FIGHTER" | "OFFICIAL" {
  const kind = requireString(value, "Entry kind");
  if (!["FIGHTER", "OFFICIAL"].includes(kind)) {
    throw new HttpError(400, "Entry kind must be FIGHTER or OFFICIAL.");
  }
  return kind as "FIGHTER" | "OFFICIAL";
}

function parseStageOfficialRole(value: unknown): "JUDGE" | "JURY" | "TELLER" | "TABLE" {
  const role = requireString(value, "Stage official role");
  if (!["JUDGE", "JURY", "TELLER", "TABLE"].includes(role)) {
    throw new HttpError(400, "Stage official role must be JUDGE, JURY, TELLER, or TABLE.");
  }
  return role as "JUDGE" | "JURY" | "TELLER" | "TABLE";
}
