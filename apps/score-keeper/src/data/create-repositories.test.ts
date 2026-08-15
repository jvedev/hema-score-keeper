import { describe, expect, it, vi, afterEach } from "vitest";
import { ArenaApi } from "./api/arena-api";
import { EventApi } from "./api/event-api";
import { RuleSetApi } from "./api/rule-set-api";
import { createArenaRepository } from "./create-arena-repository";
import { createEventRepository } from "./create-event-repository";
import { createRuleSetRepository } from "./create-rule-set-repository";
import { MockArenaRepository } from "./mock/mock-arena-repository";
import { MockEventRepository } from "./mock/mock-event-repository";
import { MockRuleSetRepository } from "./mock/mock-rule-set-repository";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("repository factory defaults", () => {
  it("uses the backend repositories by default", () => {
    vi.stubEnv("VITE_USE_MOCK_API", "false");

    expect(createEventRepository()).toBeInstanceOf(EventApi);
    expect(createArenaRepository()).toBeInstanceOf(ArenaApi);
    expect(createRuleSetRepository()).toBeInstanceOf(RuleSetApi);
  });

  it("uses mock repositories only when explicitly requested", () => {
    vi.stubEnv("VITE_USE_MOCK_API", "true");

    expect(createEventRepository()).toBeInstanceOf(MockEventRepository);
    expect(createArenaRepository()).toBeInstanceOf(MockArenaRepository);
    expect(createRuleSetRepository()).toBeInstanceOf(MockRuleSetRepository);
  });
});
