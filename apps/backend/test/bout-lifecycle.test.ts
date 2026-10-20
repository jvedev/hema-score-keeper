import { OBJECTION_WINDOW_MS } from "@hema/competition-domain";
import { beforeEach, describe, expect, it } from "vitest";
import { boutAction, countedBout, createBoutWorld, getBout, recordBout, type BoutWorld } from "./bout-fixtures.js";
import { bearer } from "./helpers.js";

let world: BoutWorld;

interface View {
  status: string;
  windowEndsAt: string | null;
  objection: { by: string; reason: string | null } | null;
  voidReason: string | null;
}

const view = (response: { json(): unknown }): View => response.json() as View;
const code = (response: { json(): unknown }): string => (response.json() as { details: { code: string } }).details.code;

beforeEach(async () => {
  world = await createBoutWorld();
});

describe("referee approval", () => {
  it("counts the bout and opens a three-day window", async () => {
    const id = await recordBout(world);
    const response = await boutAction(world, "ref", id, "referee-approval", { fightersApprovedOnSpot: { A: false, B: false } });
    expect(response.statusCode).toBe(200);
    expect(view(response)).toMatchObject({ status: "COUNTED", windowEndsAt: "2026-10-18T20:00:00.000Z" });
  });

  it("makes the bout final when both fighters approve on the spot", async () => {
    const id = await recordBout(world);
    const response = await boutAction(world, "ref", id, "referee-approval", { fightersApprovedOnSpot: { A: true, B: true } });
    expect(view(response).status).toBe("FINAL");
  });

  it("only accepts the referee", async () => {
    const id = await recordBout(world);
    expect((await boutAction(world, "f1", id, "referee-approval", { fightersApprovedOnSpot: { A: true, B: true } })).statusCode).toBe(403);
  });
});

describe("recorder rights", () => {
  async function recordAs(who: string): Promise<string> {
    const response = await world.ctx.app.inject({
      method: "POST",
      url: "/api/v1/bouts",
      headers: bearer(world.users[who]!),
      payload: {
        fighterAUserId: "f1",
        fighterBUserId: "f2",
        refereeUserId: "ref",
        startedAt: world.clock.now().toISOString(),
        scoreA: 5,
        scoreB: 3,
        winnerSide: "A",
        startedInCompetitionId: "X",
      },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { id: string }).id;
  }

  it("recorder can approve", async () => {
    const id = await recordAs("outsider");
    expect((await boutAction(world, "jury1", id, "referee-approval", { fightersApprovedOnSpot: { A: true, B: true } })).statusCode).toBe(403);
    const response = await boutAction(world, "outsider", id, "referee-approval", { fightersApprovedOnSpot: { A: true, B: true } });
    expect(view(response).status).toBe("FINAL");
  });

  it("still lets the referee approve a bout someone else recorded", async () => {
    const id = await recordAs("outsider");
    expect(view(await boutAction(world, "ref", id, "referee-approval", { fightersApprovedOnSpot: { A: false, B: false } })).status).toBe("COUNTED");
  });

  it("lets the recorder void and read the bout", async () => {
    const id = await recordAs("outsider");
    expect((await getBout(world, "outsider", id)).statusCode).toBe(200);
    expect(view(await boutAction(world, "outsider", id, "void", { reason: "Wrong fighters" })).status).toBe("VOIDED");
  });
});

describe("fighter approval and objection", () => {
  it("is final once both fighters approve", async () => {
    const id = await countedBout(world);
    expect(view(await boutAction(world, "f1", id, "approval")).status).toBe("COUNTED");
    expect(view(await boutAction(world, "f2", id, "approval")).status).toBe("FINAL");
  });

  it("lets a fighter object with a reason", async () => {
    const id = await countedBout(world);
    const response = await boutAction(world, "f2", id, "objection", { reason: "Last exchange was a double" });
    expect(response.statusCode).toBe(200);
    expect(view(response)).toMatchObject({ status: "OBJECTED", objection: { by: "B", reason: "Last exchange was a double" } });
  });

  it("needs a reason to object", async () => {
    const id = await countedBout(world);
    expect((await boutAction(world, "f2", id, "objection", {})).statusCode).toBe(400);
  });

  it("only lets fighters approve or object", async () => {
    const id = await countedBout(world);
    expect((await boutAction(world, "ref", id, "objection", { reason: "x" })).statusCode).toBe(403);
    expect((await boutAction(world, "jury1", id, "approval")).statusCode).toBe(403);
  });

  it("rejects an objection after three days", async () => {
    const id = await countedBout(world);
    world.clock.advance(OBJECTION_WINDOW_MS);
    const response = await boutAction(world, "f2", id, "objection", { reason: "Too late" });
    expect(response.statusCode).toBe(409);
    expect(code(response)).toBe("WINDOW_CLOSED");
    expect(view(await getBout(world, "f1", id)).status).toBe("FINAL");
  });
});

describe("withdrawing an objection", () => {
  it("only lets the objecting fighter withdraw, after which they can't object again", async () => {
    const id = await countedBout(world);
    await boutAction(world, "f1", id, "objection", { reason: "Wrong score" });

    const byOther = await boutAction(world, "f2", id, "objection/withdrawal");
    expect(byOther.statusCode).toBe(409);
    expect(code(byOther)).toBe("NOT_OBJECTOR");

    expect(view(await boutAction(world, "f1", id, "objection/withdrawal")).status).toBe("COUNTED");
    const again = await boutAction(world, "f1", id, "objection", { reason: "Changed my mind" });
    expect(code(again)).toBe("ALREADY_APPROVED");
  });
});

describe("voiding", () => {
  it("lets the referee void a counted bout with a reason", async () => {
    const id = await countedBout(world);
    expect((await boutAction(world, "ref", id, "void", {})).statusCode).toBe(400);
    const response = await boutAction(world, "ref", id, "void", { reason: "Sanne injured" });
    expect(view(response)).toMatchObject({ status: "VOIDED", voidReason: "Sanne injured" });
  });

  it("only accepts the referee", async () => {
    const id = await countedBout(world);
    expect((await boutAction(world, "f1", id, "void", { reason: "x" })).statusCode).toBe(403);
  });

  it("can't void a bout whose three days have passed, even if nobody read it since", async () => {
    const id = await countedBout(world);
    world.clock.advance(OBJECTION_WINDOW_MS);
    const response = await boutAction(world, "ref", id, "void", { reason: "Too late" });
    expect(response.statusCode).toBe(409);
    expect(view(await getBout(world, "f1", id)).status).toBe("FINAL");
  });
});

describe("simultaneous actions", () => {
  it("keeps an objection that races with the other fighter's approval", async () => {
    const id = await countedBout(world);
    await Promise.all([
      boutAction(world, "f1", id, "objection", { reason: "Wrong score" }),
      boutAction(world, "f2", id, "approval"),
    ]);
    // Either order is fine (approval first, or objection first and the approval refused);
    // what must never happen is the approval overwriting the objection.
    expect(view(await getBout(world, "f1", id)).status).toBe("OBJECTED");
  });
});

describe("reading a bout", () => {
  it("is open to the people involved and the competition admins", async () => {
    const id = await countedBout(world);
    for (const who of ["f1", "f2", "ref", "jury1", "table", "ownerX", "coY", "sys"]) {
      expect((await getBout(world, who, id)).statusCode, who).toBe(200);
    }
  });

  it("is closed to everyone else", async () => {
    const id = await countedBout(world);
    expect((await getBout(world, "outsider", id)).statusCode).toBe(403);
    expect((await getBout(world, "ownerW", id)).statusCode).toBe(403);
  });
});
