export function installLoadPlannerScheduleMock(): {
  calls: Request[];
  restore(): void;
};
