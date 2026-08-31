import type { CompetitionRepository } from "./competition-repository";
import { BackendCompetitionRepository } from "@hema/competition-api";
import { MockCompetitionRepository } from "./mock/mock-competition-repository";
import { SheetsCompetitionRepository } from "./sheets/sheets-competition-repository";
import { getBackendApiUrl, shouldUseSheetsApi } from "./use-backend-api";
import { shouldUseMockApi } from "./use-mock-api";

export function createCompetitionRepository(): CompetitionRepository {
  if (shouldUseMockApi()) {
    return new MockCompetitionRepository();
  }

  if (shouldUseSheetsApi()) {
    return new SheetsCompetitionRepository();
  }

  return new BackendCompetitionRepository(getBackendApiUrl());
}
