import { describe, expect, it } from "vitest";
import { nextStage, orderStages } from "./stage-order.js";

const stage = (id: string, type: "POOL" | "ELIMINATION" | "SEMI_FINAL" | "FINAL", name: string | null = null) => ({ id, type, name });

describe("stage order", () => {
  it("orders stages by type, then name, then id", () => {
    const stages = [stage("f", "FINAL"), stage("p2", "POOL", "Pools B"), stage("e", "ELIMINATION"), stage("p1", "POOL", "Pools A"), stage("s", "SEMI_FINAL")];
    expect(orderStages(stages).map((item) => item.id)).toEqual(["p1", "p2", "e", "s", "f"]);
  });

  it("finds the next stage, including a second stage of the same type", () => {
    const stages = [stage("e", "ELIMINATION"), stage("p2", "POOL", "Pools B"), stage("p1", "POOL", "Pools A")];
    expect(nextStage(stages, "p1")?.id).toBe("p2");
    expect(nextStage(stages, "p2")?.id).toBe("e");
  });

  it("has no next stage after the last one or for an unknown stage", () => {
    const stages = [stage("p", "POOL"), stage("f", "FINAL")];
    expect(nextStage(stages, "f")).toBeNull();
    expect(nextStage(stages, "missing")).toBeNull();
  });

  it("does not change the list it was given", () => {
    const stages = [stage("f", "FINAL"), stage("p", "POOL")];
    orderStages(stages);
    expect(stages.map((item) => item.id)).toEqual(["f", "p"]);
  });
});
