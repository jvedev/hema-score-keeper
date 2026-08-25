const DEFAULT_RULESET_JSON = JSON.stringify({
  weaponClass: "Longsword",
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
    penalties: [
      { description: "Late in ring", penalties: [0], disqualify: true },
      { description: "Unsportsmanlike conduct", penalties: [0, 1, 2, 3], disqualify: true },
      { description: "Illegal target", penalties: [0, 1, 2, 3], disqualify: false },
      { description: "Bull rushing", penalties: [0, 1], disqualify: false },
      { description: "Illegal technique", penalties: [], disqualify: true },
      { description: "Influence jury", penalties: [0, 3], disqualify: true },
      { description: "Ring out", penalties: [1], disqualify: false },
      { description: "Other", penalties: [1, 2, 3, 4, 5], disqualify: true },
    ],
  },
});

function setupCompetitionApp() {
  const hub = createHubSpreadsheet_();
  const demo = createDemoCompetitionSpreadsheet_();
  addCompetitionToHub_(hub, "Demo Competition", "2026-09-12", "2026-09-13", demo);

  PropertiesService.getScriptProperties().setProperty("HUB_SPREADSHEET_ID", hub.getId());

  Logger.log("Created the hub spreadsheet: %s", hub.getUrl());
  Logger.log("Created a demo competition spreadsheet: %s", demo.getUrl());
  Logger.log("Set the HUB_SPREADSHEET_ID script property automatically.");
  Logger.log("Still to do by hand: set the OAUTH_CLIENT_ID script property, then Deploy > New deployment > Web app.");
}

function createHubSpreadsheet_() {
  const spreadsheet = SpreadsheetApp.create("HEMA Competition Hub");
  const competitions = spreadsheet.getSheets()[0];
  competitions.setName("Competitions");
  competitions.appendRow(["name", "startDate", "endDate", "spreadsheetId"]);

  const rulesets = spreadsheet.insertSheet("Rulesets");
  rulesets.appendRow(["name", "json"]);
  rulesets.appendRow(["Default Longsword", DEFAULT_RULESET_JSON]);

  return spreadsheet;
}

function createDemoCompetitionSpreadsheet_() {
  const spreadsheet = SpreadsheetApp.create("HEMA Competition - Demo Competition");

  const settings = spreadsheet.getSheets()[0];
  settings.setName("Settings");
  settings.appendRow(["name", "startDate", "endDate", "rulesetJson"]);
  settings.appendRow(["Demo Competition", "2026-09-12", "2026-09-13", DEFAULT_RULESET_JSON]);

  const ranking = spreadsheet.insertSheet("Ranking");
  ranking.appendRow(["participantId", "position", "name", "rating"]);

  const participants = spreadsheet.insertSheet("Participants");
  participants.appendRow(["id", "name", "linkedUserEmail"]);

  const bouts = spreadsheet.insertSheet("Bouts");
  bouts.appendRow(["id", "fighterAId", "fighterBId", "scoreA", "scoreB", "winnerParticipantId", "date", "details"]);

  return spreadsheet;
}

function addCompetitionToHub_(hub, name, startDate, endDate, competitionSpreadsheet) {
  const sheet = hub.getSheetByName("Competitions");
  sheet.appendRow([name, startDate, endDate, competitionSpreadsheet.getId()]);
}
