export function installAppsScriptFailureMock(): {
  calls: Request[];
  restore(): void;
};
