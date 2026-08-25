import type { CompetitionRepository } from "./competition-repository";
import { MockCompetitionRepository } from "./mock/mock-competition-repository";
import { SheetsCompetitionRepository } from "./sheets/sheets-competition-repository";
import { shouldUseMockApi } from "./use-mock-api";

export function createCompetitionRepository(): CompetitionRepository {
  if (shouldUseMockApi()) {
    return new MockCompetitionRepository();
  }

  return new SheetsCompetitionRepository();
}
