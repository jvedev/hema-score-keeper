import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  ensureJsonValue,
  ensureObject,
  HttpError,
  optionalString,
  readJsonBody,
  requireBoolean,
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
  { method: "GET", pattern: /^\/api\/v1\/events\/([^/]+)\/rulesets$/, handler: listRulesets },
  { method: "POST", pattern: /^\/api\/v1\/events\/([^/]+)\/rulesets$/, handler: createRuleset },
  { method: "GET", pattern: /^\/api\/v1\/rulesets\/([^/]+)$/, handler: getRuleset },
  { method: "PATCH", pattern: /^\/api\/v1\/rulesets\/([^/]+)$/, handler: updateRuleset },
  { method: "GET", pattern: /^\/api\/v1\/events\/([^/]+)\/schedule$/, handler: getEventSchedule },
  { method: "PATCH", pattern: /^\/api\/v1\/events\/([^/]+)\/schedule$/, handler: updateEventSchedule },
  { method: "POST", pattern: /^\/api\/v1\/events\/([^/]+)\/schedule\/slots$/, handler: createScheduleTimeSlot },
  { method: "GET", pattern: /^\/api\/v1\/tournaments$/, handler: listTournaments },
  { method: "POST", pattern: /^\/api\/v1\/tournaments$/, handler: createTournament },
  { method: "GET", pattern: /^\/api\/v1\/tournaments\/([^/]+)$/, handler: getTournament },
  { method: "PATCH", pattern: /^\/api\/v1\/tournaments\/([^/]+)$/, handler: updateTournament },
  { method: "DELETE", pattern: /^\/api\/v1\/tournaments\/([^/]+)$/, handler: deleteTournament },
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
  { method: "PATCH", pattern: /^\/api\/v1\/schedule-time-slots\/([^/]+)$/, handler: updateScheduleTimeSlot },
  { method: "DELETE", pattern: /^\/api\/v1\/schedule-time-slots\/([^/]+)$/, handler: deleteScheduleTimeSlot },
  { method: "POST", pattern: /^\/api\/v1\/scheduled-phases$/, handler: createScheduledPhase },
  { method: "PATCH", pattern: /^\/api\/v1\/scheduled-phases\/([^/]+)$/, handler: updateScheduledPhase },
  { method: "DELETE", pattern: /^\/api\/v1\/scheduled-phases\/([^/]+)$/, handler: deleteScheduledPhase },
  { method: "POST", pattern: /^\/api\/v1\/scheduled-phases\/([^/]+)\/assignments$/, handler: createScheduledAssignment },
  { method: "DELETE", pattern: /^\/api\/v1\/scheduled-assignments\/([^/]+)$/, handler: deleteScheduledAssignment },
  { method: "GET", pattern: /^\/api\/v1\/rounds$/, handler: listRounds },
  { method: "POST", pattern: /^\/api\/v1\/rounds$/, handler: createRound },
  { method: "GET", pattern: /^\/api\/v1\/rounds\/([^/]+)$/, handler: getRound },
  { method: "PATCH", pattern: /^\/api\/v1\/rounds\/([^/]+)$/, handler: updateRound },
  { method: "DELETE", pattern: /^\/api\/v1\/rounds\/([^/]+)$/, handler: deleteRound },
  { method: "GET", pattern: /^\/api\/v1\/matches$/, handler: listMatches },
  { method: "POST", pattern: /^\/api\/v1\/matches$/, handler: createMatch },
  { method: "GET", pattern: /^\/api\/v1\/matches\/([^/]+)$/, handler: getMatch },
  { method: "POST", pattern: /^\/api\/v1\/matches\/([^/]+)\/complete$/, handler: completeMatch },
  { method: "PATCH", pattern: /^\/api\/v1\/matches\/([^/]+)$/, handler: updateMatch },
  { method: "DELETE", pattern: /^\/api\/v1\/matches\/([^/]+)$/, handler: deleteMatch },
  { method: "GET", pattern: /^\/api\/v1\/exchanges$/, handler: listExchanges },
  { method: "POST", pattern: /^\/api\/v1\/exchanges$/, handler: createExchange },
  { method: "GET", pattern: /^\/api\/v1\/exchanges\/([^/]+)$/, handler: getExchange },
  { method: "PATCH", pattern: /^\/api\/v1\/exchanges\/([^/]+)$/, handler: updateExchange },
  { method: "DELETE", pattern: /^\/api\/v1\/exchanges\/([^/]+)$/, handler: deleteExchange },
];

const tournamentOrderBy: Prisma.TournamentOrderByWithRelationInput[] = [
  { order: "asc" },
  { name: "asc" },
];

const tournamentColors = ["#5B8CFF", "#E06C75", "#98C379", "#E5C07B", "#C678DD", "#56B6C2"];
const arenaLeftColor = "#21c15b";
const arenaRightColor = "#2f7dfa";

const eventDetailInclude: Prisma.EventInclude = {
  ruleset: true,
  rulesets: {
    orderBy: [{ name: "asc" }, { version: "desc" }],
  },
  schedule: {
    include: {
      timeSlots: {
        orderBy: { order: "asc" },
        include: {
          scheduledPhases: {
            include: {
              stage: { include: { tournament: true } },
              arena: true,
              assignments: { include: { user: { include: { skills: true } } } },
            },
          },
        },
      },
    },
  },
  tournaments: {
    orderBy: tournamentOrderBy,
    include: {
      ruleset: true,
      entries: { include: { user: { include: { skills: true } } } },
      stages: {
        include: {
          ruleset: true,
          tournament: { include: { event: true } },
          rounds: { include: { matches: true } },
          arenas: { include: { arena: true } },
          officials: { include: { entry: { include: { user: true } } } },
        },
      },
    },
  },
  arenas: true,
};

const tournamentDetailInclude = {
  event: true,
  ruleset: true,
  entries: { include: { user: { include: { skills: true } }, stageOfficials: { include: { stage: { include: { tournament: { include: { event: true } } } } } } } },
  stages: {
    include: {
      ruleset: true,
      tournament: { include: { event: true } },
      rounds: { include: { matches: true } },
      arenas: { include: { arena: true } },
      officials: { include: { entry: { include: { user: true } } } },
    },
  },
} as const;

const entryDetailInclude = {
  tournament: { include: { event: true } },
  user: { include: { skills: true } },
  stageOfficials: { include: { stage: { include: { tournament: { include: { event: true } } } } } },
} as const;

const stageDetailInclude = {
  tournament: { include: { event: true } },
  ruleset: true,
  rounds: { include: { matches: true } },
  arenas: { include: { arena: true } },
  officials: { include: { entry: { include: { user: true } } } },
} as const;

const arenaDetailInclude = {
  event: true,
  stages: { include: { stage: { include: { tournament: { include: { event: true } } } } } },
  matches: true,
} as const;

const scheduledPhaseDetailInclude = {
  stage: { include: { tournament: true } },
  arena: true,
  timeSlot: true,
  assignments: { include: { user: { include: { skills: true } } } },
} as const;

const scheduleDetailInclude = {
  timeSlots: {
    orderBy: { order: "asc" },
    include: {
      scheduledPhases: {
        include: {
          stage: { include: { tournament: true } },
          arena: true,
          assignments: { include: { user: { include: { skills: true } } } },
        },
      },
    },
  },
} as const;

const roundDetailInclude = {
  stage: { include: { tournament: { include: { event: true } } } },
  matches: true,
} as const;

const matchDetailInclude = {
  round: { include: { stage: { include: { tournament: { include: { event: true } } } } } },
  arena: true,
  entryA: { include: { user: true, tournament: { include: { event: true } } } },
  entryB: { include: { user: true, tournament: { include: { event: true } } } },
  winnerEntry: { include: { user: true, tournament: { include: { event: true } } } },
  ruleset: true,
  exchanges: { orderBy: { id: "asc" } },
} as const;

const exchangeDetailInclude = {
  match: { include: matchDetailInclude },
} as const;

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
    include: { skills: true, entries: { include: { tournament: { include: { event: true } } } } },
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
  const data: {
    username?: string;
    judgeVolunteer?: boolean;
    juryVolunteer?: boolean;
    tableVolunteer?: boolean;
    otherVolunteer?: boolean;
  } = {};

  if (body.username !== undefined) {
    data.username = requireString(body.username, "Username");
  }
  if (body.judgeVolunteer !== undefined) {
    data.judgeVolunteer = requireBoolean(body.judgeVolunteer, "Judge volunteer");
  }
  if (body.juryVolunteer !== undefined) {
    data.juryVolunteer = requireBoolean(body.juryVolunteer, "Jury volunteer");
  }
  if (body.tableVolunteer !== undefined) {
    data.tableVolunteer = requireBoolean(body.tableVolunteer, "Table volunteer");
  }
  if (body.otherVolunteer !== undefined) {
    data.otherVolunteer = requireBoolean(body.otherVolunteer, "Other volunteer");
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
  await syncAllPlannerArtifacts();
  return prisma.event.findMany({
    orderBy: { eventName: "asc" },
    include: eventDetailInclude,
  });
}

async function createEvent(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Event");
  const eventName = requireString(body.eventName, "Event name");
  if (body.rulesetId !== undefined && body.rulesetId !== null) {
    throw new HttpError(400, "Event ruleset can only be selected after the event has been created.");
  }
  const allFightersAreVolunteers =
    body.allFightersAreVolunteers === undefined
      ? undefined
      : requireBoolean(body.allFightersAreVolunteers, "All fighters are volunteers");

  return prisma.event.create({
    data: {
      eventName,
      ...(allFightersAreVolunteers !== undefined ? { allFightersAreVolunteers } : {}),
    },
    include: { ruleset: true },
  });
}

async function getEvent(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireEvent(routeId(params));
}

async function listTournaments(): Promise<unknown> {
  return prisma.tournament.findMany({
    orderBy: [{ eventId: "asc" }, { order: "asc" }, { name: "asc" }],
    include: tournamentDetailInclude,
  });
}

async function createTournament(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Tournament");
  const eventId = requireString(body.eventId, "Event ID");
  const name = requireString(body.name, "Tournament name");
  const event = await requireEvent(eventId);
  const rulesetId = body.rulesetId === undefined
    ? event.rulesetId ?? undefined
    : body.rulesetId === null
      ? null
      : requireString(body.rulesetId, "Ruleset ID");
  if (rulesetId) {
    await requireRulesetForEvent(rulesetId, eventId, "Tournament ruleset");
  }
  const order = body.order === undefined ? 0 : requirePositiveInteger(body.order, "Tournament order");
  const usedColors = new Set(event.tournaments.map((tournament) => tournament.color));
  const color = tournamentColors.find((candidate) => !usedColors.has(candidate))
    ?? tournamentColors[event.tournaments.length % tournamentColors.length]
    ?? "#5B8CFF";

  const tournament = await prisma.tournament.create({
    data: {
      eventId,
      name,
      order,
      color,
      ...(rulesetId !== undefined ? { rulesetId } : {}),
      stages: {
        create: [
          { type: "POOL" },
          { type: "ELIMINATION" },
          { type: "SEMI_FINAL" },
          { type: "FINAL" },
        ],
      },
    },
    include: tournamentDetailInclude,
  });

  const currentStageId =
    tournament.stages.find((stage) => stage.type === "POOL")?.id ??
    tournament.stages[0]?.id;
  if (!currentStageId) {
    return tournament;
  }

  return prisma.tournament.update({
    where: { id: tournament.id },
    data: { currentStageId },
    include: tournamentDetailInclude,
  });
}

async function getTournament(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireTournament(routeId(params));
}

async function updateTournament(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Tournament");
  const currentTournament = await requireTournament(routeId(params));
  const data: { eventId?: string; name?: string; rulesetId?: string | null; currentStageId?: string | null; order?: number } = {};

  if (body.eventId !== undefined) {
    const eventId = requireString(body.eventId, "Event ID");
    await requireEvent(eventId);
    data.eventId = eventId;
  }
  if (body.name !== undefined) {
    data.name = requireString(body.name, "Tournament name");
  }
  if (body.rulesetId !== undefined) {
    if (body.rulesetId === null) {
      data.rulesetId = null;
    } else {
      const eventId = body.eventId === undefined ? currentTournament.eventId : requireString(body.eventId, "Event ID");
      const rulesetId = requireString(body.rulesetId, "Ruleset ID");
      await requireRulesetForEvent(rulesetId, eventId, "Tournament ruleset");
      data.rulesetId = rulesetId;
    }
  }
  if (body.order !== undefined) {
    data.order = requirePositiveInteger(body.order, "Tournament order");
  }
  if (body.currentStageId !== undefined) {
    if (body.currentStageId === null) {
      data.currentStageId = null;
    } else {
      const currentStage = await requireStage(requireString(body.currentStageId, "Current stage ID"));
      if (currentStage.tournamentId !== currentTournament.id) {
        throw new HttpError(400, "Current stage must belong to the same tournament.");
      }
      data.currentStageId = currentStage.id;
    }
  }
  const nextEventId = data.eventId ?? currentTournament.eventId;
  const nextRulesetId = data.rulesetId === undefined ? currentTournament.rulesetId : data.rulesetId;
  if (nextRulesetId) {
    await requireRulesetForEvent(nextRulesetId, nextEventId, "Tournament ruleset");
  }

  return prisma.tournament.update({
    where: { id: routeId(params) },
    data,
    include: tournamentDetailInclude,
  });
}

async function deleteTournament(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.tournament.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function updateEvent(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Event");
  const data: { eventName?: string; rulesetId?: string | null; allFightersAreVolunteers?: boolean } = {};

  if (body.eventName !== undefined) {
    data.eventName = requireString(body.eventName, "Event name");
  }
  if (body.rulesetId !== undefined) {
    if (body.rulesetId === null) {
      data.rulesetId = null;
    } else {
      const rulesetId = requireString(body.rulesetId, "Ruleset ID");
      await requireRulesetForEvent(rulesetId, routeId(params), "Event ruleset");
      data.rulesetId = rulesetId;
    }
  }
  if (body.allFightersAreVolunteers !== undefined) {
    data.allFightersAreVolunteers = requireBoolean(body.allFightersAreVolunteers, "All fighters are volunteers");
  }

  return prisma.event.update({
    where: { id: routeId(params) },
    data,
    include: { ruleset: true },
  });
}

async function deleteEvent(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.event.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listRulesets(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const eventId = routeId(params);
  await requireEvent(eventId);
  const rulesets = await prisma.ruleset.findMany({
    where: { eventId },
    orderBy: [{ name: "asc" }, { version: "desc" }],
    include: { _count: { select: { matches: true } } },
  });
  return rulesets.map(toRulesetDetail);
}

async function createRuleset(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const eventId = routeId(params);
  await requireEvent(eventId);
  const body = ensureObject(await readJsonBody(request), "Ruleset");
  const sourceRulesetId = body.baseRulesetId === undefined ? undefined : optionalString(body.baseRulesetId);
  const source = sourceRulesetId ? await requireRulesetForEvent(sourceRulesetId, eventId, "Ruleset template") : undefined;
  const name = body.name !== undefined
    ? requireString(body.name, "Ruleset name")
    : source?.name ?? "Nieuwe ruleset";
  const version = await nextRulesetVersion(eventId, name);
  const definition = body.definition === undefined
    ? ensureJsonValue(source?.definition ?? defaultRulesetDefinition())
    : body.definition === null
      ? Prisma.JsonNull
      : ensureJsonValue(body.definition);

  const ruleset = await prisma.ruleset.create({
    data: {
      eventId,
      name,
      version,
      definition,
    },
    include: { _count: { select: { matches: true } } },
  });

  return toRulesetDetail(ruleset);
}

async function getRuleset(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireRulesetDetail(routeId(params));
}

async function updateRuleset(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const existing = await requireRulesetDetail(routeId(params));
  if (existing.locked) {
    throw new HttpError(409, "A ruleset that is already used in a match cannot be altered.");
  }

  const body = ensureObject(await readJsonBody(request), "Ruleset");
  const data: {
    name?: string;
    definition?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  } = {};

  if (body.name !== undefined) {
    data.name = requireString(body.name, "Ruleset name");
  }
  if (body.definition !== undefined) {
    data.definition = body.definition === null ? Prisma.JsonNull : ensureJsonValue(body.definition);
  }

  if (data.name !== undefined && data.name !== existing.name) {
    const conflict = await prisma.ruleset.findFirst({
      where: {
        eventId: existing.eventId,
        name: data.name,
        version: existing.version,
        id: { not: existing.id },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new HttpError(409, "A ruleset with this name and version already exists in this event.");
    }
  }

  const ruleset = await prisma.ruleset.update({
    where: { id: existing.id },
    data,
    include: { _count: { select: { matches: true } } },
  });

  return toRulesetDetail(ruleset);
}

async function getEventSchedule(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const eventId = routeId(params);
  await syncEventArtifacts(eventId);
  const event = await requireEvent(eventId);
  const schedule = await getOrCreateSchedule(eventId);
  return { event, schedule };
}

async function updateEventSchedule(
  request: IncomingMessage,
  params: Record<string, string>,
): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Event schedule");
  const schedule = await getOrCreateSchedule(routeId(params));
  const data: { startTimeMinutes?: number; currentTimeSlotId?: string | null } = {};
  if (body.startTimeMinutes !== undefined) {
    data.startTimeMinutes = requireTimeOfDay(body.startTimeMinutes);
  }
  if (body.currentTimeSlotId !== undefined) {
    if (body.currentTimeSlotId === null) {
      data.currentTimeSlotId = null;
    } else {
      const timeSlot = await requireScheduleTimeSlot(requireString(body.currentTimeSlotId, "Current time slot ID"));
      if (timeSlot.scheduleId !== schedule.id) {
        throw new HttpError(400, "Current time slot must belong to the same event schedule.");
      }
      data.currentTimeSlotId = timeSlot.id;
    }
  }

  return prisma.eventSchedule.update({
    where: { id: schedule.id },
    data,
    include: scheduleDetailInclude,
  });
}

async function createScheduleTimeSlot(
  request: IncomingMessage,
  params: Record<string, string>,
): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Schedule time slot");
  const schedule = await getOrCreateSchedule(routeId(params));
  const durationMinutes = requireTimeSlotDuration(body.durationMinutes);
  const label = requireString(body.label, "Time slot label");
  const color = body.color === undefined || body.color === null ? null : requireString(body.color, "Time slot color");
  const isBreak = body.isBreak === undefined ? false : requireBoolean(body.isBreak, "Time slot break flag");
  const lastSlot = await prisma.scheduleTimeSlot.findFirst({
    where: { scheduleId: schedule.id },
    orderBy: { order: "desc" },
  });

  return prisma.scheduleTimeSlot.create({
    data: {
      scheduleId: schedule.id,
      order: (lastSlot?.order ?? -1) + 1,
      durationMinutes,
      label,
      color,
      isBreak,
    },
    include: {
      scheduledPhases: {
        include: {
          stage: { include: { tournament: true } },
          arena: true,
        },
      },
    },
  });
}

async function updateScheduleTimeSlot(
  request: IncomingMessage,
  params: Record<string, string>,
): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Schedule time slot");
  const timeSlotId = routeId(params);
  const timeSlot = await requireScheduleTimeSlot(timeSlotId);
  const data: { durationMinutes?: number; label?: string; color?: string | null; isBreak?: boolean } = {};

  if (body.durationMinutes !== undefined) {
    data.durationMinutes = requireTimeSlotDuration(body.durationMinutes);
  }
  if (body.label !== undefined) {
    data.label = requireString(body.label, "Time slot label");
  }
  if (body.color !== undefined) {
    data.color = body.color === null ? null : requireString(body.color, "Time slot color");
  }
  if (body.isBreak !== undefined) {
    const isBreak = requireBoolean(body.isBreak, "Time slot break flag");
    if (isBreak && timeSlot.scheduledPhases.length > 0) {
      throw new HttpError(409, "A time slot with phase assignments cannot become a break.");
    }
    data.isBreak = isBreak;
  }

  return prisma.scheduleTimeSlot.update({
    where: { id: timeSlotId },
    data,
    include: {
      scheduledPhases: {
        include: {
          stage: { include: { tournament: true } },
          arena: true,
        },
      },
    },
  });
}

async function deleteScheduleTimeSlot(
  _request: IncomingMessage,
  params: Record<string, string>,
): Promise<unknown> {
  const timeSlot = await requireScheduleTimeSlot(routeId(params));
  if (timeSlot.scheduledPhases.length > 0) {
    throw new HttpError(409, "Remove phase assignments before deleting this time slot.");
  }

  await prisma.scheduleTimeSlot.delete({ where: { id: timeSlot.id } });
  await syncStageArtifacts([...new Set(timeSlot.scheduledPhases.map((phase) => phase.stageId))]);
  return undefined;
}

async function createScheduledPhase(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Scheduled phase");
  const stageId = requireString(body.stageId, "Stage ID");
  const arenaId = requireString(body.arenaId, "Arena ID");
  const timeSlotId = requireString(body.timeSlotId, "Time slot ID");
  await validateScheduledPhase(stageId, arenaId, timeSlotId);

  const scheduledPhase = await prisma.scheduledPhase.create({
    data: { stageId, arenaId, timeSlotId },
    include: scheduledPhaseDetailInclude,
  });
  await syncStageArtifacts([stageId]);
  return scheduledPhase;
}

async function updateScheduledPhase(
  request: IncomingMessage,
  params: Record<string, string>,
): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Scheduled phase");
  const existing = await requireScheduledPhase(routeId(params));
  const stageId = body.stageId === undefined ? existing.stageId : requireString(body.stageId, "Stage ID");
  const arenaId = body.arenaId === undefined ? existing.arenaId : requireString(body.arenaId, "Arena ID");
  const timeSlotId = body.timeSlotId === undefined
    ? existing.timeSlotId
    : requireString(body.timeSlotId, "Time slot ID");
  await validateScheduledPhase(stageId, arenaId, timeSlotId, existing.id);

  const scheduledPhase = await prisma.scheduledPhase.update({
    where: { id: existing.id },
    data: { stageId, arenaId, timeSlotId },
    include: scheduledPhaseDetailInclude,
  });
  await syncStageArtifacts([existing.stageId, stageId]);
  return scheduledPhase;
}

async function deleteScheduledPhase(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const existing = await requireScheduledPhase(routeId(params));
  await prisma.scheduledPhase.delete({ where: { id: existing.id } });
  await syncStageArtifacts([existing.stageId]);
  return undefined;
}

async function createScheduledAssignment(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Scheduled assignment");
  const scheduledPhase = await requireScheduledPhase(routeId(params));
  const userId = requireString(body.userId, "User ID");
  const role = parseScheduleRole(body.role);
  const user = await requireUser(userId);
  const eventId = scheduledPhase.arena.eventId;
  const allowedKinds: Array<"FIGHTER" | "VOLUNTEER" | "BOTH"> = role === "FIGHTER"
    ? ["FIGHTER", "BOTH"]
    : ["VOLUNTEER", "BOTH"];
  const eligible = await prisma.entry.findFirst({
    where: {
      userId,
      tournament: { eventId },
      kind: { in: allowedKinds },
    },
  });
  if (!eligible) {
    throw new HttpError(400, role === "FIGHTER"
      ? `${user.username} is not registered as a fighter for this event.`
      : `${user.username} is not a volunteer for this event.`);
  }
  if (role === "FIGHTER" && eligible.tournamentId !== scheduledPhase.stage.tournamentId) {
    throw new HttpError(400, `${user.username} is not registered for this tournament.`);
  }
  const conflict = await prisma.scheduledAssignment.findFirst({
    where: {
      userId,
      scheduledPhase: { timeSlotId: scheduledPhase.timeSlotId },
    },
  });
  if (conflict) {
    throw new HttpError(409, `${user.username} is already assigned in this time slot.`);
  }
  const assignedRoleCount = await prisma.scheduledAssignment.count({
    where: { scheduledPhaseId: scheduledPhase.id, role },
  });
  const roleLimit = role === "JURY"
    ? 4
    : role === "FIGHTER"
      ? Math.max(1, scheduledPhase.stage.maxPoolSize ?? scheduledPhase.stage.preferredPoolSize ?? 1)
      : 1;
  if (assignedRoleCount >= roleLimit) {
    throw new HttpError(409, `${role} already has the maximum of ${roleLimit} assignment${roleLimit === 1 ? "" : "s"}.`);
  }
  const assignment = await prisma.scheduledAssignment.create({
    data: { scheduledPhaseId: scheduledPhase.id, userId, role },
    include: { user: { include: { skills: true } } },
  });
  await syncStageArtifacts([scheduledPhase.stageId]);
  return assignment;
}

async function deleteScheduledAssignment(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const assignment = await prisma.scheduledAssignment.findUnique({
    where: { id: routeId(params) },
    include: { scheduledPhase: true },
  });
  if (!assignment) {
    throw new HttpError(404, `Scheduled assignment "${routeId(params)}" not found.`);
  }

  await prisma.scheduledAssignment.delete({ where: { id: assignment.id } });
  await syncStageArtifacts([assignment.scheduledPhase.stageId]);
  return undefined;
}

async function listArenas(): Promise<unknown> {
  return prisma.arena.findMany({
    orderBy: [{ eventId: "asc" }, { order: "asc" }, { name: "asc" }],
    include: arenaDetailInclude,
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
      ...(body.leftColor !== undefined ? { leftColor: requireString(body.leftColor, "Left arena color") } : {}),
      ...(body.rightColor !== undefined ? { rightColor: requireString(body.rightColor, "Right arena color") } : {}),
    },
    include: arenaDetailInclude,
  });
}

async function getArena(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireArena(routeId(params));
}

async function updateArena(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Arena");
  const data: { eventId?: string; name?: string; order?: number; leftColor?: string; rightColor?: string } = {};

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
  if (body.leftColor !== undefined) {
    data.leftColor = requireString(body.leftColor, "Left arena color");
  }
  if (body.rightColor !== undefined) {
    data.rightColor = requireString(body.rightColor, "Right arena color");
  }

  return prisma.arena.update({
    where: { id: routeId(params) },
    data,
    include: arenaDetailInclude,
  });
}

async function deleteArena(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.arena.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listEntries(): Promise<unknown> {
  return prisma.entry.findMany({
    orderBy: [{ tournamentId: "asc" }, { seed: "asc" }, { id: "asc" }],
    include: entryDetailInclude,
  });
}

async function createEntry(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Entry");
  const tournamentId = requireString(body.tournamentId, "Tournament ID");
  const userId = requireString(body.userId, "User ID");
  const requestedKind = body.kind === undefined ? undefined : parseEntryKind(body.kind);
  const seed = body.seed === undefined ? undefined : requirePositiveInteger(body.seed, "Seed");

  const tournament = await requireTournament(tournamentId);
  await requireUser(userId);
  const kind = requestedKind === "FIGHTER" && tournament.event.allFightersAreVolunteers
    ? "BOTH"
    : requestedKind;

  const entry = await prisma.entry.create({
    data: {
      tournamentId,
      userId,
      ...(kind !== undefined ? { kind } : {}),
      ...(seed !== undefined ? { seed } : {}),
    },
    include: entryDetailInclude,
  });

  return entry;
}

async function getEntry(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireEntry(routeId(params));
}

async function updateEntry(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Entry");
  const data: { tournamentId?: string; userId?: string; kind?: "FIGHTER" | "VOLUNTEER" | "BOTH"; seed?: number | null } = {};

  if (body.tournamentId !== undefined) {
    const tournamentId = requireString(body.tournamentId, "Tournament ID");
    await requireTournament(tournamentId);
    data.tournamentId = tournamentId;
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
    include: entryDetailInclude,
  });
}

async function deleteEntry(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.entry.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listStages(): Promise<unknown> {
  return prisma.stage.findMany({
    orderBy: [{ tournamentId: "asc" }, { type: "asc" }, { name: "asc" }],
    include: stageDetailInclude,
  });
}

async function createStage(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Stage");
  const tournamentId = requireString(body.tournamentId, "Tournament ID");
  const type = parseStageType(body.type);
  const name = body.name === undefined ? undefined : optionalString(body.name);
  const tournament = await requireTournament(tournamentId);
  const rulesetId = body.rulesetId === undefined
    ? tournament.rulesetId ?? tournament.event.rulesetId ?? undefined
    : body.rulesetId === null
      ? null
      : requireString(body.rulesetId, "Ruleset ID");
  if (rulesetId) {
    await requireRulesetForEvent(rulesetId, tournament.eventId, "Stage ruleset");
  }
  const timeBetweenMatchesMinutes = body.timeBetweenMatchesMinutes === undefined || body.timeBetweenMatchesMinutes === null
    ? 2
    : requirePositiveInteger(body.timeBetweenMatchesMinutes, "Time between matches");

  let minPoolSize: number | null = null;
  let maxPoolSize: number | null = null;
  let preferredPoolSize: number | null = null;
  if (type === "POOL") {
    minPoolSize = body.minPoolSize === undefined || body.minPoolSize === null
      ? 4
      : requireStagePoolSize(body.minPoolSize, "Minimum pool size");
    maxPoolSize = body.maxPoolSize === undefined || body.maxPoolSize === null
      ? 6
      : requireStagePoolSize(body.maxPoolSize, "Maximum pool size");
    preferredPoolSize = body.preferredPoolSize === undefined || body.preferredPoolSize === null
      ? 5
      : requireStagePoolSize(body.preferredPoolSize, "Preferred pool size");
    validateStagePoolRange(minPoolSize, maxPoolSize, preferredPoolSize);
  }
  const eliminationParticipantCount = type === "ELIMINATION"
    ? body.eliminationParticipantCount === undefined || body.eliminationParticipantCount === null
      ? resolveEliminationParticipantCount(tournament)
      : requireStagePoolSize(body.eliminationParticipantCount, "Elimination participant count")
    : null;

  return prisma.stage.create({
    data: {
      tournamentId,
      type,
      ...(name !== undefined ? { name } : {}),
      ...(rulesetId !== undefined ? { rulesetId } : {}),
      minPoolSize,
      maxPoolSize,
      preferredPoolSize,
      eliminationParticipantCount,
      timeBetweenMatchesMinutes,
    },
    include: stageDetailInclude,
  });
}

async function getStage(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireStage(routeId(params));
}

async function updateStage(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Stage");
  const currentStage = await requireStage(routeId(params));
  const nextType = body.type === undefined ? currentStage.type : parseStageType(body.type);
  const nextTournamentId = body.tournamentId === undefined ? currentStage.tournamentId : requireString(body.tournamentId, "Tournament ID");
  const nextTournament = await requireTournament(nextTournamentId);
  const data: {
    tournamentId?: string;
    type?: "POOL" | "ELIMINATION" | "SEMI_FINAL" | "FINAL";
    name?: string | null;
    rulesetId?: string | null;
    minPoolSize?: number | null;
    maxPoolSize?: number | null;
    preferredPoolSize?: number | null;
    eliminationParticipantCount?: number | null;
    timeBetweenMatchesMinutes?: number;
  } = {};

  if (body.tournamentId !== undefined) {
    data.tournamentId = nextTournamentId;
  }
  if (body.type !== undefined) {
    data.type = nextType;
  }
  if (body.name !== undefined) {
    data.name = optionalString(body.name) ?? null;
  }
  if (body.rulesetId !== undefined) {
    if (body.rulesetId === null) {
      data.rulesetId = null;
    } else {
      const eventId = body.tournamentId === undefined
        ? currentStage.tournament.eventId
        : (await requireTournament(requireString(body.tournamentId, "Tournament ID"))).eventId;
      const rulesetId = requireString(body.rulesetId, "Ruleset ID");
      await requireRulesetForEvent(rulesetId, eventId, "Stage ruleset");
      data.rulesetId = rulesetId;
    }
  }
  if (body.timeBetweenMatchesMinutes !== undefined) {
    data.timeBetweenMatchesMinutes = body.timeBetweenMatchesMinutes === null
      ? 2
      : requirePositiveInteger(body.timeBetweenMatchesMinutes, "Time between matches");
  } else {
    data.timeBetweenMatchesMinutes = currentStage.timeBetweenMatchesMinutes;
  }
  if (nextType === "POOL") {
    const minPoolSize = body.minPoolSize === undefined
      ? currentStage.type === "POOL" ? (currentStage.minPoolSize ?? 4) : 4
      : body.minPoolSize === null
        ? 4
        : requireStagePoolSize(body.minPoolSize, "Minimum pool size");
    const maxPoolSize = body.maxPoolSize === undefined
      ? currentStage.type === "POOL" ? (currentStage.maxPoolSize ?? 6) : 6
      : body.maxPoolSize === null
        ? 6
        : requireStagePoolSize(body.maxPoolSize, "Maximum pool size");
    const preferredPoolSize = body.preferredPoolSize === undefined
      ? currentStage.type === "POOL" ? (currentStage.preferredPoolSize ?? 5) : 5
      : body.preferredPoolSize === null
        ? 5
        : requireStagePoolSize(body.preferredPoolSize, "Preferred pool size");
    validateStagePoolRange(minPoolSize, maxPoolSize, preferredPoolSize);
    data.minPoolSize = minPoolSize;
    data.maxPoolSize = maxPoolSize;
    data.preferredPoolSize = preferredPoolSize;
    data.eliminationParticipantCount = null;
  } else if (nextType === "ELIMINATION") {
    data.minPoolSize = null;
    data.maxPoolSize = null;
    data.preferredPoolSize = null;
    data.eliminationParticipantCount = body.eliminationParticipantCount === undefined
      ? currentStage.type === "ELIMINATION"
        ? currentStage.eliminationParticipantCount ?? resolveEliminationParticipantCount(nextTournament, currentStage)
        : resolveEliminationParticipantCount(nextTournament, currentStage)
      : body.eliminationParticipantCount === null
        ? resolveEliminationParticipantCount(nextTournament, currentStage)
        : requireStagePoolSize(body.eliminationParticipantCount, "Elimination participant count");
  } else {
    data.minPoolSize = null;
    data.maxPoolSize = null;
    data.preferredPoolSize = null;
    data.eliminationParticipantCount = null;
  }
  const nextRulesetId = data.rulesetId === undefined ? currentStage.rulesetId : data.rulesetId;
  if (nextRulesetId) {
    await requireRulesetForEvent(nextRulesetId, nextTournament.eventId, "Stage ruleset");
  }

  return prisma.stage.update({
    where: { id: routeId(params) },
    data,
    include: stageDetailInclude,
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
    include: { arena: true, stage: { include: { tournament: { include: { event: true } } } } },
  });
}

async function createStageArena(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const stageId = routeId(params);
  const body = ensureObject(await readJsonBody(request), "Stage arena");
  const arenaId = requireString(body.arenaId, "Arena ID");
  const arena = await requireArena(arenaId);
  const stage = await requireStage(stageId);
  if (arena.eventId !== stage.tournament.eventId) {
    throw new HttpError(400, "Arena must belong to the same event as the stage.");
  }

  return prisma.stageArena.create({
    data: { stageId, arenaId },
    include: { arena: true, stage: { include: { tournament: { include: { event: true } } } } },
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
    include: { stage: { include: { tournament: { include: { event: true } } } }, entry: { include: { user: true } } },
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
  if (entry.tournamentId !== stage.tournamentId) {
    throw new HttpError(400, "Official must belong to the same tournament as the stage.");
  }
  if (entry.kind === "FIGHTER") {
    throw new HttpError(400, "Only official or both-role entries can be assigned as stage officials.");
  }

  return prisma.stageOfficial.create({
    data: { stageId, entryId, role },
    include: { stage: { include: { tournament: { include: { event: true } } } }, entry: { include: { user: true } } },
  });
}

async function deleteStageOfficial(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.stageOfficial.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listRounds(): Promise<unknown> {
  return prisma.round.findMany({
    orderBy: [{ stageId: "asc" }, { roundNumber: "asc" }],
    include: roundDetailInclude,
  });
}

async function createRound(request: IncomingMessage): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Round");
  const stageId = requireString(body.stageId, "Stage ID");
  const roundNumber = requirePositiveInteger(body.roundNumber, "Round number");

  await requireStage(stageId);

  return prisma.round.create({
    data: { stageId, roundNumber },
    include: roundDetailInclude,
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
    include: roundDetailInclude,
  });
}

async function deleteRound(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.round.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function listMatches(): Promise<unknown> {
  return prisma.match.findMany({
    orderBy: [{ roundId: "asc" }, { id: "asc" }],
    include: matchDetailInclude,
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
  const rulesetId = body.rulesetId === undefined
    ? undefined
    : body.rulesetId === null
      ? null
      : requireString(body.rulesetId, "Ruleset ID");

  const round = await requireRound(roundId);
  const stage = round.stage;
  const tournamentId = stage.tournamentId;
  const eventId = stage.tournament.eventId;
  if (arenaId) {
    const arena = await requireArena(arenaId);
    if (arena.eventId !== eventId) {
      throw new HttpError(400, "Arena must belong to the same event as the round stage.");
    }
  }
  if (entryAId) await requireEntryInTournament(entryAId, tournamentId, "Entry A");
  if (entryBId) await requireEntryInTournament(entryBId, tournamentId, "Entry B");
  if (winnerEntryId) await requireEntryInTournament(winnerEntryId, tournamentId, "Winner entry");
  const resolvedRulesetId = rulesetId === undefined
    ? stage.rulesetId ?? stage.tournament.rulesetId ?? stage.tournament.event.rulesetId ?? null
    : rulesetId;
  if (resolvedRulesetId) {
    await requireRulesetForEvent(resolvedRulesetId, eventId, "Match ruleset");
  }

  return prisma.match.create({
    data: {
      roundId,
      ...(arenaId !== undefined ? { arenaId } : {}),
      ...(entryAId !== undefined ? { entryAId } : {}),
      ...(entryBId !== undefined ? { entryBId } : {}),
      ...(winnerEntryId !== undefined ? { winnerEntryId } : {}),
      ...(scoreA !== undefined ? { scoreA } : {}),
      ...(scoreB !== undefined ? { scoreB } : {}),
      ...(resolvedRulesetId !== undefined ? { rulesetId: resolvedRulesetId } : {}),
    },
    include: matchDetailInclude,
  });
}

async function getMatch(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  return requireMatch(routeId(params));
}

async function updateMatch(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const body = ensureObject(await readJsonBody(request), "Match");
  const currentMatch = await requireMatch(routeId(params));
  const data: {
    roundId?: string;
    arenaId?: string | null;
    entryAId?: string | null;
    entryBId?: string | null;
    winnerEntryId?: string | null;
    scoreA?: number | null;
    scoreB?: number | null;
    rulesetId?: string | null;
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
  if (body.rulesetId !== undefined) {
    if (body.rulesetId === null) {
      data.rulesetId = null;
    } else {
      const rulesetId = requireString(body.rulesetId, "Ruleset ID");
      const nextRoundId = data.roundId ?? currentMatch.roundId;
      const nextRound = data.roundId !== undefined ? await requireRound(nextRoundId) : currentMatch.round;
      const nextEventId = nextRound.stage.tournament.eventId;
      if (currentMatch.rulesetId && currentMatch.rulesetId !== rulesetId) {
        throw new HttpError(409, "A match ruleset cannot be altered once it has been set.");
      }
      await requireRulesetForEvent(rulesetId, nextEventId, "Match ruleset");
      data.rulesetId = rulesetId;
    }
  }
  if (data.roundId !== undefined || data.arenaId !== undefined || data.entryAId !== undefined || data.entryBId !== undefined || data.winnerEntryId !== undefined) {
    const nextRoundId = data.roundId ?? currentMatch.roundId;
    const nextRound = data.roundId !== undefined ? await requireRound(nextRoundId) : currentMatch.round;
    const nextStage = nextRound.stage;
    const nextTournamentId = nextStage.tournamentId;
    const nextEventId = nextStage.tournament.eventId;
    const nextArenaId = data.arenaId !== undefined ? data.arenaId : currentMatch.arenaId;
    const nextEntryAId = data.entryAId !== undefined ? data.entryAId : currentMatch.entryAId;
    const nextEntryBId = data.entryBId !== undefined ? data.entryBId : currentMatch.entryBId;
    const nextWinnerEntryId = data.winnerEntryId !== undefined ? data.winnerEntryId : currentMatch.winnerEntryId;

    if (nextArenaId) {
      const arena = await requireArena(nextArenaId);
      if (arena.eventId !== nextEventId) {
        throw new HttpError(400, "Arena must belong to the same event as the match stage.");
      }
    }
    if (nextEntryAId) {
      await requireEntryInTournament(nextEntryAId, nextTournamentId, "Entry A");
    }
    if (nextEntryBId) {
      await requireEntryInTournament(nextEntryBId, nextTournamentId, "Entry B");
    }
    if (nextWinnerEntryId) {
      await requireEntryInTournament(nextWinnerEntryId, nextTournamentId, "Winner entry");
    }
  }
  const nextRound = data.roundId === undefined ? currentMatch.round : await requireRound(data.roundId);
  const nextEventId = nextRound.stage.tournament.eventId;
  const nextRulesetId = data.rulesetId === undefined ? currentMatch.rulesetId : data.rulesetId;
  if (nextRulesetId) {
    await requireRulesetForEvent(nextRulesetId, nextEventId, "Match ruleset");
  }

  return prisma.match.update({
    where: { id: routeId(params) },
    data,
    include: matchDetailInclude,
  });
}

async function deleteMatch(_request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  await prisma.match.delete({ where: { id: routeId(params) } });
  return undefined;
}

async function completeMatch(request: IncomingMessage, params: Record<string, string>): Promise<unknown> {
  const matchId = routeId(params);
  const currentMatch = await requireMatch(matchId);
  if (
    currentMatch.scoreA !== null ||
    currentMatch.scoreB !== null ||
    currentMatch.winnerEntryId !== null ||
    currentMatch.exchanges.length > 0
  ) {
    throw new HttpError(409, "This match has already been completed.");
  }

  const body = ensureObject(await readJsonBody(request), "Match completion");
  const scoreA = requireInteger(body.scoreA, "Score A");
  const scoreB = requireInteger(body.scoreB, "Score B");
  const exchangeInputs = Array.isArray(body.exchanges) ? body.exchanges : undefined;
  if (!exchangeInputs) {
    throw new HttpError(400, "Match completion exchanges must be an array.");
  }

  let winnerEntryId: string | null = null;
  if (body.winnerEntryId !== undefined) {
    if (body.winnerEntryId === null) {
      winnerEntryId = null;
    } else {
      winnerEntryId = requireString(body.winnerEntryId, "Winner entry ID");
      await requireEntryInTournament(
        winnerEntryId,
        currentMatch.round.stage.tournamentId,
        "Winner entry",
      );
    }
  }

  const exchanges = exchangeInputs.map((exchangeInput, index) => {
    const exchange = ensureObject(exchangeInput, `Match exchange ${index + 1}`);
    return {
      scoreA: requireInteger(exchange.scoreA, `Match exchange ${index + 1} score A`),
      scoreB: requireInteger(exchange.scoreB, `Match exchange ${index + 1} score B`),
      details: exchange.details === undefined ? undefined : ensureJsonValue(exchange.details),
    };
  });

  if (exchanges.length > 0) {
    const lastExchange = exchanges[exchanges.length - 1];
    if (!lastExchange || lastExchange.scoreA !== scoreA || lastExchange.scoreB !== scoreB) {
      throw new HttpError(400, "Final scores must match the last saved exchange.");
    }
  }

  return prisma.$transaction(async (transaction) => {
    for (const exchange of exchanges) {
      if (exchange.details === undefined) {
        throw new HttpError(400, "Match exchange details must be provided.");
      }
      await transaction.exchange.create({
        data: {
          matchId,
          scoreA: exchange.scoreA,
          scoreB: exchange.scoreB,
          details: exchange.details,
        },
      });
    }

    return transaction.match.update({
      where: { id: matchId },
      data: {
        scoreA,
        scoreB,
        winnerEntryId,
      },
      include: matchDetailInclude,
    });
  });
}

async function listExchanges(): Promise<unknown> {
  return prisma.exchange.findMany({
    orderBy: [{ matchId: "asc" }, { id: "asc" }],
    include: exchangeDetailInclude,
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
    include: exchangeDetailInclude,
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
    include: exchangeDetailInclude,
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
    include: eventDetailInclude,
  });
  if (!event) {
    throw new HttpError(404, `Event "${id}" not found.`);
  }
  return event;
}

async function requireRuleset(id: string) {
  const ruleset = await prisma.ruleset.findUnique({
    where: { id },
    include: { _count: { select: { matches: true } } },
  });
  if (!ruleset) {
    throw new HttpError(404, `Ruleset "${id}" not found.`);
  }
  return ruleset;
}

async function requireRulesetDetail(id: string) {
  const ruleset = await requireRuleset(id);
  return toRulesetDetail(ruleset);
}

async function requireRulesetForEvent(id: string, eventId: string, label: string) {
  const ruleset = await requireRuleset(id);
  if (ruleset.eventId !== eventId) {
    throw new HttpError(400, `${label} must belong to the same event.`);
  }
  return ruleset;
}

async function requireTournament(id: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: tournamentDetailInclude,
  });
  if (!tournament) {
    throw new HttpError(404, `Tournament "${id}" not found.`);
  }
  return tournament;
}

async function requireArena(id: string) {
  const arena = await prisma.arena.findUnique({
    where: { id },
    include: arenaDetailInclude,
  });
  if (!arena) {
    throw new HttpError(404, `Arena "${id}" not found.`);
  }
  return arena;
}

async function requireEntry(id: string) {
  const entry = await prisma.entry.findUnique({
    where: { id },
    include: entryDetailInclude,
  });
  if (!entry) {
    throw new HttpError(404, `Entry "${id}" not found.`);
  }
  return entry;
}

async function requireStage(id: string) {
  const stage = await prisma.stage.findUnique({
    where: { id },
    include: stageDetailInclude,
  });
  if (!stage) {
    throw new HttpError(404, `Stage "${id}" not found.`);
  }
  return stage;
}

async function getOrCreateSchedule(eventId: string) {
  await requireEvent(eventId);
  return prisma.eventSchedule.upsert({
    where: { eventId },
    create: { eventId },
    update: {},
    include: scheduleDetailInclude,
  });
}

async function requireScheduleTimeSlot(id: string) {
  const timeSlot = await prisma.scheduleTimeSlot.findUnique({
    where: { id },
    include: {
      scheduledPhases: {
        include: {
          stage: { include: { tournament: true } },
          arena: true,
        },
      },
    },
  });
  if (!timeSlot) {
    throw new HttpError(404, `Schedule time slot "${id}" not found.`);
  }
  return timeSlot;
}

async function requireScheduledPhase(id: string) {
  const scheduledPhase = await prisma.scheduledPhase.findUnique({
    where: { id },
    include: scheduledPhaseDetailInclude,
  });
  if (!scheduledPhase) {
    throw new HttpError(404, `Scheduled phase "${id}" not found.`);
  }
  return scheduledPhase;
}

async function syncAllPlannerArtifacts(): Promise<void> {
  const stages = await prisma.stage.findMany({ select: { id: true } });
  await syncStageArtifacts(stages.map((stage) => stage.id));
}

async function syncEventArtifacts(eventId: string): Promise<void> {
  const stages = await prisma.stage.findMany({
    where: { tournament: { eventId } },
    select: { id: true },
  });
  await syncStageArtifacts(stages.map((stage) => stage.id));
}

async function syncStageArtifacts(stageIds: readonly string[]): Promise<void> {
  for (const stageId of new Set(stageIds)) {
    await syncStageArtifactsForStage(stageId);
  }
}

async function syncStageArtifactsForStage(stageId: string): Promise<void> {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: {
      tournament: { include: { event: true } },
      scheduledPhases: {
        include: {
          arena: true,
          timeSlot: { include: { schedule: true } },
          assignments: { include: { user: true } },
        },
      },
      rounds: {
        include: { matches: true },
      },
    },
  });
  if (!stage) {
    return;
  }

  const desiredArenaIds = [...new Set(stage.scheduledPhases.map((phase) => phase.arenaId))];
  await syncStageArenas(stage.id, desiredArenaIds);

  if (stage.type !== "POOL") {
    return;
  }

  const desiredMatches = await buildDesiredPoolMatches(stage);
  await syncStageMatches(stage, desiredMatches);
}

async function syncStageArenas(stageId: string, desiredArenaIds: readonly string[]): Promise<void> {
  await prisma.stageArena.deleteMany({
    where: {
      stageId,
      ...(desiredArenaIds.length > 0 ? { arenaId: { notIn: [...desiredArenaIds] } } : {}),
    },
  });

  const existing = await prisma.stageArena.findMany({
    where: { stageId },
    select: { arenaId: true },
  });
  const existingArenaIds = new Set(existing.map((assignment) => assignment.arenaId));
  for (const arenaId of desiredArenaIds) {
    if (existingArenaIds.has(arenaId)) {
      continue;
    }
    await prisma.stageArena.create({
      data: { stageId, arenaId },
    });
  }
}

interface GeneratedPoolMatch {
  key: string;
  roundNumber: number;
  arenaId: string;
  entryAId: string;
  entryBId: string;
  rulesetId: string | null;
}

async function buildDesiredPoolMatches(stage: {
  id: string;
  tournamentId: string;
  tournament: {
    rulesetId: string | null;
    event: {
      rulesetId: string | null;
    };
  };
  rulesetId: string | null;
  scheduledPhases: Array<{
    arenaId: string;
    timeSlot: { order: number };
    arena: { order: number };
    assignments: Array<{ role: string; userId: string }>;
  }>;
}): Promise<GeneratedPoolMatch[]> {
  const fighterUserIds = [...new Set(stage.scheduledPhases.flatMap((phase) =>
    phase.assignments
      .filter((assignment) => assignment.role === "FIGHTER")
      .map((assignment) => assignment.userId),
  ))];
  if (fighterUserIds.length === 0) {
    return [];
  }

  const entries = await prisma.entry.findMany({
    where: {
      tournamentId: stage.tournamentId,
      userId: { in: fighterUserIds },
    },
    orderBy: [{ seed: "asc" }, { id: "asc" }],
  });
  const entryByUserId = new Map(entries.map((entry) => [entry.userId, entry]));
  const rulesetId = stage.rulesetId ?? stage.tournament.rulesetId ?? stage.tournament.event.rulesetId ?? null;

  const matches: GeneratedPoolMatch[] = [];
  const phases = [...stage.scheduledPhases].sort((left, right) =>
    left.timeSlot.order - right.timeSlot.order ||
    left.arena.order - right.arena.order ||
    left.arenaId.localeCompare(right.arenaId),
  );

  for (const phase of phases) {
    const fighters = phase.assignments
      .filter((assignment) => assignment.role === "FIGHTER")
      .map((assignment) => entryByUserId.get(assignment.userId))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((left, right) =>
        (left.seed ?? Number.MAX_SAFE_INTEGER) - (right.seed ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id),
      );

    for (let index = 0; index < fighters.length; index += 1) {
      for (let opponentIndex = index + 1; opponentIndex < fighters.length; opponentIndex += 1) {
        const entryA = fighters[index]!;
        const entryB = fighters[opponentIndex]!;
        matches.push({
          key: matchKey(phase.arenaId, entryA.id, entryB.id),
          roundNumber: phase.timeSlot.order,
          arenaId: phase.arenaId,
          entryAId: entryA.id,
          entryBId: entryB.id,
          rulesetId,
        });
      }
    }
  }

  return matches;
}

async function syncStageMatches(
  stage: {
    id: string;
    rounds: Array<{
      id: string;
      roundNumber: number;
      matches: Array<{
        id: string;
        arenaId: string | null;
        entryAId: string | null;
        entryBId: string | null;
      }>;
    }>;
  },
  desiredMatches: GeneratedPoolMatch[],
): Promise<void> {
  const desiredRounds = new Map<number, GeneratedPoolMatch[]>();
  for (const match of desiredMatches) {
    const roundMatches = desiredRounds.get(match.roundNumber) ?? [];
    roundMatches.push(match);
    desiredRounds.set(match.roundNumber, roundMatches);
  }

  const existingRoundsByNumber = new Map(stage.rounds.map((round) => [round.roundNumber, round] as const));
  const desiredRoundNumbers = [...desiredRounds.keys()].sort((left, right) => left - right);
  for (const roundNumber of desiredRoundNumbers) {
    let round = existingRoundsByNumber.get(roundNumber);
    if (!round) {
      round = await prisma.round.create({
        data: {
          stageId: stage.id,
          roundNumber,
        },
        include: { matches: true },
      });
      existingRoundsByNumber.set(roundNumber, round);
    }
    await syncRoundMatches(round, desiredRounds.get(roundNumber) ?? []);
  }
}

async function syncRoundMatches(
  round: {
    id: string;
    matches: Array<{
      id: string;
      arenaId: string | null;
      entryAId: string | null;
      entryBId: string | null;
    }>;
  },
  desiredMatches: GeneratedPoolMatch[],
): Promise<void> {
  const existingMatches = await prisma.match.findMany({
    where: { roundId: round.id },
  });
  const existingByKey = new Map<string, (typeof existingMatches)[number]>();
  for (const match of existingMatches) {
    existingByKey.set(matchKey(match.arenaId, match.entryAId, match.entryBId), match);
  }

  const desiredByKey = new Map(desiredMatches.map((match) => [match.key, match] as const));
  for (const desired of desiredMatches) {
    const existing = existingByKey.get(desired.key);
    if (existing) {
      await prisma.match.update({
        where: { id: existing.id },
        data: {
          arenaId: desired.arenaId,
          entryAId: desired.entryAId,
          entryBId: desired.entryBId,
          rulesetId: desired.rulesetId,
        },
      });
      continue;
    }

    await prisma.match.create({
      data: {
        roundId: round.id,
        arenaId: desired.arenaId,
        entryAId: desired.entryAId,
        entryBId: desired.entryBId,
        rulesetId: desired.rulesetId,
      },
    });
  }

  for (const existing of existingMatches) {
    if (!desiredByKey.has(matchKey(existing.arenaId, existing.entryAId, existing.entryBId))) {
      await prisma.match.delete({ where: { id: existing.id } });
    }
  }
}

function matchKey(arenaId: string | null, entryAId: string | null, entryBId: string | null): string {
  const left = entryAId ?? "";
  const right = entryBId ?? "";
  const [first, second] = [left, right].sort();
  return `${arenaId ?? ""}:${first}:${second}`;
}

async function validateScheduledPhase(
  stageId: string,
  arenaId: string,
  timeSlotId: string,
  existingId?: string,
): Promise<void> {
  const [stage, arena, timeSlot] = await Promise.all([
    prisma.stage.findUnique({ where: { id: stageId }, include: { tournament: true } }),
    prisma.arena.findUnique({ where: { id: arenaId } }),
    prisma.scheduleTimeSlot.findUnique({ where: { id: timeSlotId }, include: { schedule: true } }),
  ]);

  if (!stage) {
    throw new HttpError(404, `Stage "${stageId}" not found.`);
  }
  if (!arena) {
    throw new HttpError(404, `Arena "${arenaId}" not found.`);
  }
  if (!timeSlot) {
    throw new HttpError(404, `Schedule time slot "${timeSlotId}" not found.`);
  }
  if (stage.tournament.eventId !== arena.eventId || arena.eventId !== timeSlot.schedule.eventId) {
    throw new HttpError(400, "Stage, arena, and time slot must belong to the same event.");
  }
  if (timeSlot.isBreak) {
    throw new HttpError(409, "A phase cannot be placed in a break time slot.");
  }

  const occupiedPlacement = await prisma.scheduledPhase.findUnique({
    where: { arenaId_timeSlotId: { arenaId, timeSlotId } },
  });
  if (occupiedPlacement && occupiedPlacement.id !== existingId) {
    throw new HttpError(409, "This arena already has a phase in the selected time slot.");
  }
}

async function requireRound(id: string) {
  const round = await prisma.round.findUnique({
    where: { id },
    include: roundDetailInclude,
  });
  if (!round) {
    throw new HttpError(404, `Round "${id}" not found.`);
  }
  return round;
}

async function requireMatch(id: string) {
  const match = await prisma.match.findUnique({
    where: { id },
    include: matchDetailInclude,
  });
  if (!match) {
    throw new HttpError(404, `Match "${id}" not found.`);
  }
  return match;
}

async function requireExchange(id: string) {
  const exchange = await prisma.exchange.findUnique({
    where: { id },
    include: exchangeDetailInclude,
  });
  if (!exchange) {
    throw new HttpError(404, `Exchange "${id}" not found.`);
  }
  return exchange;
}

async function requireEntryInTournament(id: string, tournamentId: string, label: string) {
  const entry = await requireEntry(id);
  if (entry.tournamentId !== tournamentId) {
    throw new HttpError(400, `${label} must belong to the same tournament as the stage.`);
  }
  return entry;
}

function requireStagePoolSize(value: unknown, label: string): number {
  const size = requirePositiveInteger(value, label);
  if (size < 1) {
    throw new HttpError(400, `${label} must be at least 1.`);
  }
  return size;
}

function validateStagePoolRange(minPoolSize: number, maxPoolSize: number, preferredPoolSize: number): void {
  if (minPoolSize > maxPoolSize) {
    throw new HttpError(400, "Minimum pool size cannot exceed maximum pool size.");
  }
  if (preferredPoolSize < minPoolSize || preferredPoolSize > maxPoolSize) {
    throw new HttpError(400, "Preferred pool size must be between the minimum and maximum pool size.");
  }
}

function resolveEliminationParticipantCount(
  tournament: { stages?: Array<{ type: string; preferredPoolSize: number | null }> },
  currentStage?: { type: string; preferredPoolSize: number | null; eliminationParticipantCount: number | null },
): number {
  if (currentStage?.type === "POOL" && currentStage.preferredPoolSize !== null) {
    return currentStage.preferredPoolSize;
  }

  const poolStage = tournament.stages?.find((stage) => stage.type === "POOL" && stage.preferredPoolSize !== null);
  if (poolStage?.preferredPoolSize !== null && poolStage?.preferredPoolSize !== undefined) {
    return poolStage.preferredPoolSize;
  }

  if (currentStage && currentStage.eliminationParticipantCount !== null) {
    return currentStage.eliminationParticipantCount;
  }

  return 5;
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(400, `${label} must be an integer.`);
  }

  return value;
}

function toRulesetDetail(ruleset: {
  id: string;
  eventId: string;
  name: string;
  version: number;
  definition: Prisma.JsonValue | null;
  _count: { matches: number };
}) {
  return {
    id: ruleset.id,
    eventId: ruleset.eventId,
    name: ruleset.name,
    version: ruleset.version,
    definition: ruleset.definition,
    matchCount: ruleset._count.matches,
    locked: ruleset._count.matches > 0,
  };
}

async function nextRulesetVersion(eventId: string, name: string): Promise<number> {
  const current = await prisma.ruleset.findFirst({
    where: { eventId, name },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (current?.version ?? 0) + 1;
}

function defaultRulesetDefinition() {
  return {
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
}

function requireTimeSlotDuration(value: unknown): number {
  const durationMinutes = requirePositiveInteger(value, "Time slot duration");
  if (durationMinutes < 1 || durationMinutes > 24 * 60) {
    throw new HttpError(400, "Time slot duration must be between 1 and 1440 minutes.");
  }

  return durationMinutes;
}

function parseScheduleRole(value: unknown): "JUDGE" | "JURY" | "TABLE" | "FIGHTER" {
  const role = requireString(value, "Schedule role");
  if (!["JUDGE", "JURY", "TABLE", "FIGHTER"].includes(role)) {
    throw new HttpError(400, "Schedule role must be JUDGE, JURY, TABLE, or FIGHTER.");
  }
  return role as "JUDGE" | "JURY" | "TABLE" | "FIGHTER";
}

function requireTimeOfDay(value: unknown): number {
  const minutes = requirePositiveInteger(value, "Schedule start time");
  if (minutes >= 24 * 60) {
    throw new HttpError(400, "Schedule start time must be between 00:00 and 23:59.");
  }
  return minutes;
}

function parseStageType(value: unknown): "POOL" | "ELIMINATION" | "SEMI_FINAL" | "FINAL" {
  const type = requireString(value, "Stage type");
  if (!["POOL", "ELIMINATION", "SEMI_FINAL", "FINAL"].includes(type)) {
    throw new HttpError(400, "Stage type must be POOL, ELIMINATION, SEMI_FINAL, or FINAL.");
  }
  return type as "POOL" | "ELIMINATION" | "SEMI_FINAL" | "FINAL";
}

function parseEntryKind(value: unknown): "FIGHTER" | "VOLUNTEER" | "BOTH" {
  const kind = requireString(value, "Entry kind");
  if (!["FIGHTER", "VOLUNTEER", "BOTH"].includes(kind)) {
    throw new HttpError(400, "Entry kind must be FIGHTER, VOLUNTEER, or BOTH.");
  }
  return kind as "FIGHTER" | "VOLUNTEER" | "BOTH";
}

function parseStageOfficialRole(value: unknown): "JUDGE" | "JURY" | "TELLER" | "TABLE" {
  const role = requireString(value, "Stage official role");
  if (!["JUDGE", "JURY", "TELLER", "TABLE"].includes(role)) {
    throw new HttpError(400, "Stage official role must be JUDGE, JURY, TELLER, or TABLE.");
  }
  return role as "JUDGE" | "JURY" | "TELLER" | "TABLE";
}
