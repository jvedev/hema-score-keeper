const HUB_SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty("HUB_SPREADSHEET_ID");
const OAUTH_CLIENT_ID = PropertiesService.getScriptProperties().getProperty("OAUTH_CLIENT_ID");

const HUB_COMPETITIONS_SHEET = "Competitions";
const HUB_RULESETS_SHEET = "Rulesets";
const SETTINGS_SHEET = "Settings";
const RANKING_SHEET = "Ranking";
const PARTICIPANTS_SHEET = "Participants";
const BOUTS_SHEET = "Bouts";

const READ_ACTIONS = {
  listCompetitions: () => readSheetAsObjects(openHubSpreadsheet(), HUB_COMPETITIONS_SHEET),
  listRulesets: () => readSheetAsObjects(openHubSpreadsheet(), HUB_RULESETS_SHEET),
  getCompetition: (params) => readSettings(openCompetitionSpreadsheet(params.spreadsheetId)),
  getRanking: (params) => readSheetAsObjects(openCompetitionSpreadsheet(params.spreadsheetId), RANKING_SHEET),
  getParticipants: (params) => readSheetAsObjects(openCompetitionSpreadsheet(params.spreadsheetId), PARTICIPANTS_SHEET),
  getBouts: (params) => readSheetAsObjects(openCompetitionSpreadsheet(params.spreadsheetId), BOUTS_SHEET, ["details"]),
};

const WRITE_ACTIONS = {
  addParticipant: (payload) => addParticipant(payload.spreadsheetId, payload.name, null),
  registerSelf: (payload, identity) => addParticipant(payload.spreadsheetId, payload.name, identity.email),
  publishBout: (payload) => publishBout(payload.spreadsheetId, payload.bout, payload.ranking),
};

function doGet(e) {
  return handleRequest(() => {
    const action = e.parameter.action;
    const handler = READ_ACTIONS[action];
    if (!handler) throw new Error('Unknown read action "' + action + '".');
    return handler(e.parameter);
  });
}

function doPost(e) {
  return handleRequest(() => {
    const payload = JSON.parse(e.postData.contents);
    const handler = WRITE_ACTIONS[payload.action];
    if (!handler) throw new Error('Unknown write action "' + payload.action + '".');

    const identity = verifyIdToken(payload.idToken);
    return handler(payload, identity);
  });
}

function handleRequest(run) {
  try {
    const data = run();
    return jsonResponse({ ok: true, data: data });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function jsonResponse(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function openHubSpreadsheet() {
  return SpreadsheetApp.openById(HUB_SPREADSHEET_ID);
}

function openCompetitionSpreadsheet(spreadsheetId) {
  if (!spreadsheetId) throw new Error("spreadsheetId is required.");
  return SpreadsheetApp.openById(spreadsheetId);
}

function verifyIdToken(idToken) {
  if (!idToken) throw new Error("Sign-in is required for this action.");

  const response = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
    { muteHttpExceptions: true },
  );
  if (response.getResponseCode() !== 200) {
    throw new Error("The Google sign-in token is invalid or expired.");
  }

  const claims = JSON.parse(response.getContentText());
  if (claims.aud !== OAUTH_CLIENT_ID) {
    throw new Error("The Google sign-in token was not issued for this app.");
  }
  if (claims.email_verified !== "true" && claims.email_verified !== true) {
    throw new Error("Your Google account email is not verified.");
  }

  return { email: claims.email, name: claims.name || claims.email };
}

function readSettings(spreadsheet) {
  const rows = readSheetAsObjects(spreadsheet, SETTINGS_SHEET, ["rulesetJson"]);
  const row = rows[0];
  if (!row) throw new Error('The "' + SETTINGS_SHEET + '" sheet has no data row.');
  return row;
}

function readSheetAsObjects(spreadsheet, sheetName, jsonColumns) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet "' + sheetName + '" was not found.');

  const values = sheet.getDataRange().getValues();
  const header = values[0] || [];
  return values.slice(1).map((row) => {
    const record = {};
    header.forEach((column, index) => {
      const raw = row[index];
      record[column] = jsonColumns && jsonColumns.indexOf(column) !== -1 ? parseJsonCell(raw) : raw;
    });
    return record;
  });
}

function parseJsonCell(raw) {
  if (raw === "" || raw === undefined || raw === null) return null;
  return JSON.parse(raw);
}

function addParticipant(spreadsheetId, name, linkedUserEmail) {
  if (!name) throw new Error("A participant name is required.");

  const sheet = openCompetitionSpreadsheet(spreadsheetId).getSheetByName(PARTICIPANTS_SHEET);
  if (!sheet) throw new Error('Sheet "' + PARTICIPANTS_SHEET + '" was not found.');

  const id = "participant-" + Utilities.getUuid();
  sheet.appendRow([id, name, linkedUserEmail || ""]);
  return { id: id, name: name, linkedUserEmail: linkedUserEmail || null };
}

function publishBout(spreadsheetId, bout, ranking) {
  const spreadsheet = openCompetitionSpreadsheet(spreadsheetId);
  appendBoutRow(spreadsheet, bout);
  overwriteRankingSheet(spreadsheet, ranking);
  return { published: true };
}

function appendBoutRow(spreadsheet, bout) {
  const sheet = spreadsheet.getSheetByName(BOUTS_SHEET);
  if (!sheet) throw new Error('Sheet "' + BOUTS_SHEET + '" was not found.');

  sheet.appendRow([
    bout.id,
    bout.fighterAId,
    bout.fighterBId,
    bout.scoreA,
    bout.scoreB,
    bout.winnerParticipantId || "",
    bout.date,
    JSON.stringify(bout.details),
  ]);
}

function overwriteRankingSheet(spreadsheet, ranking) {
  const sheet = spreadsheet.getSheetByName(RANKING_SHEET);
  if (!sheet) throw new Error('Sheet "' + RANKING_SHEET + '" was not found.');

  const header = ["participantId", "position", "name", "rating"];
  sheet.clearContents();
  sheet.appendRow(header);
  ranking.forEach((entry) => {
    sheet.appendRow([entry.participantId, entry.position, entry.name, entry.rating]);
  });
}
