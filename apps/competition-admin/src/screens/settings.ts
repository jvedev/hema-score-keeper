import { escapeHtml, t, type MessageKey } from "@hema/ui";
import { ApiError, SessionExpiredError } from "../admin-client";
import type { AdminCompetitionDetail, CompetitionAdminEntry, CompetitionDetail, PersonSearchResult, ScopeKind } from "../api-types";
import type { AppContext } from "../app-context";
import { participantAppUrl } from "../config";
import { adminCapabilities, allowedActions, formToParameters, inviteLink, parametersToForm, parsePlaceLimit, parseScopeValues, rulesetEditable, type ParametersForm } from "../mappers/settings";
import { competitionHeader, wireLinks } from "./competition";

const SCOPES: readonly ScopeKind[] = ["OPEN", "CLUB", "CLUBS", "AREA", "COUNTRY"];

export async function renderSettingsScreen(container: HTMLElement, context: AppContext, competitionId: string): Promise<void> {
  const [competition, participants, admins] = await Promise.all([
    context.client.competition(competitionId),
    context.client.participants(competitionId),
    context.client.admins(competitionId),
  ]);
  const session = context.client.currentSession()!;
  const myRole = session.user.role === "SYSTEM_ADMIN" ? "SYSTEM_ADMIN" : (admins.find((admin) => admin.userId === session.user.id)?.role ?? "CO_ADMIN");
  const capabilities = adminCapabilities(myRole);
  const reload = () => context.navigate({ name: "settings", competitionId }, true);

  container.innerHTML = `${competitionHeader(competition, "settings")}
    ${lifecycleSection(competition)}
    ${detailsSection(competition)}
    ${signupsSection(competition)}
    ${inviteSection(competition)}
    ${rulesetSection(competition)}
    ${participantsSection(participants.map((participant) => participant.name))}
    ${adminsSection(admins, capabilities, session.user.id)}`;
  wireLinks(container, context);

  /** Runs a change, shows the server's refusal next to the section, and reloads on success. Resolves whether it worked. */
  const act = async (section: HTMLElement, action: () => Promise<unknown>, success?: string): Promise<boolean> => {
    const error = section.querySelector<HTMLElement>(".error")!;
    error.hidden = true;
    section.querySelectorAll<HTMLButtonElement>("button").forEach((button) => (button.disabled = true));
    try {
      await action();
      context.toast(success ?? t("admin.saved"));
      reload();
      return true;
    } catch (caught) {
      section.querySelectorAll<HTMLButtonElement>("button").forEach((button) => (button.disabled = false));
      error.hidden = false;
      error.textContent = caught instanceof ApiError && caught.status === 409 && caught.details ? t("settings.notReady") : caught instanceof Error ? caught.message : String(caught);
      return false;
    }
  };

  // Lifecycle
  const lifecycle = container.querySelector<HTMLElement>("section.lifecycle")!;
  lifecycle.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => void act(lifecycle, () => context.client.transition(competitionId, button.dataset.action!)));
  });

  // Details
  const details = container.querySelector<HTMLFormElement>("form.details")!;
  details.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(details);
    void act(details, () =>
      context.client.patchCompetition(competitionId, {
        name: String(data.get("name")),
        date: String(data.get("date")),
        visibility: String(data.get("visibility")),
        scope: { kind: String(data.get("scopeKind")), values: parseScopeValues(String(data.get("scopeValues") ?? "")) },
        acceptsOtherBouts: data.get("acceptsOtherBouts") === "on",
      }),
    );
  });

  // Sign-ups: approval switch and place limit
  const signups = container.querySelector<HTMLFormElement>("form.signups")!;
  signups.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(signups);
    const limit = parsePlaceLimit(String(data.get("placeLimit") ?? ""));
    if (!limit.ok) {
      const error = signups.querySelector<HTMLElement>(".error")!;
      error.hidden = false;
      error.textContent = t("settings.placeLimitInvalid");
      return;
    }
    void act(signups, () => context.client.patchCompetition(competitionId, { signupsNeedApproval: data.get("signupsNeedApproval") === "on", placeLimit: limit.value }));
  });

  // Invite link: shown as link and QR; a new link stops the old one, so it asks first
  const invite = container.querySelector<HTMLElement>("section.invite")!;
  const share = invite.querySelector("invite-share");
  if (share && competition.inviteCode) {
    share.link = inviteLink(participantAppUrl(), competition.inviteCode);
  }
  invite.querySelector<HTMLButtonElement>("button[data-renew]")!.addEventListener("click", () => {
    if (competition.inviteCode && !window.confirm(t("settings.inviteRenewConfirm"))) {
      return;
    }
    void act(invite, () => context.client.newInvite(competitionId), t("settings.inviteMade"));
  });

  // Ruleset
  const ruleset = container.querySelector<HTMLFormElement>("form.ruleset")!;
  ruleset.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(ruleset);
    const form: ParametersForm = {
      minutes: Number(data.get("minutes")),
      maxPointsCap: Number(data.get("maxPointsCap")),
      pointSpreadVictory: Number(data.get("pointSpreadVictory")),
      scores: String(data.get("scores") ?? ""),
      maxDoubles: Number(data.get("maxDoubles")),
      allowAfterBlow: data.get("allowAfterBlow") === "on",
      countDoubles: data.get("countDoubles") === "on",
      useNetScore: data.get("useNetScore") === "on",
    };
    void act(ruleset, () => context.client.patchCompetition(competitionId, { rulesetJson: formToParameters(competition.rulesetJson, form) }));
  });

  // Participants and admins: pick a person from a search
  wirePersonPicker(container.querySelector<HTMLElement>("section.participants")!, context, (person, section) =>
    act(section, () => context.client.addParticipant(competitionId, { name: person.name, userId: person.userId }), t("settings.enrolled", { name: person.name })),
  );
  const adminSection = container.querySelector<HTMLElement>("section.admins")!;
  if (capabilities.manage) {
    wirePersonPicker(adminSection, context, (person, section) => act(section, () => context.client.addAdmin(competitionId, person.userId)));
  }
  adminSection.querySelectorAll<HTMLButtonElement>("button[data-remove]").forEach((button) => {
    button.addEventListener("click", () =>
      void act(adminSection, () => context.client.removeAdmin(competitionId, button.dataset.remove!)).then((done) => {
        if (done && button.dataset.remove === session.user.id) {
          context.navigate({ name: "competitions" });
        }
      }),
    );
  });
  adminSection.querySelectorAll<HTMLButtonElement>("button[data-owner]").forEach((button) => {
    button.addEventListener("click", () => void act(adminSection, () => context.client.transferOwnership(competitionId, button.dataset.owner!)));
  });
}

function lifecycleSection(competition: CompetitionDetail): string {
  const actions = allowedActions(competition.status);
  return `<section class="panel lifecycle">
    <h2>${t("settings.lifecycle")}</h2>
    <p class="muted">${t("settings.now", { status: t(`lifecycle.${competition.status}` as MessageKey) })}</p>
    <div class="row">${actions.map((action) => `<button type="button" data-action="${action}" class="${action === "ARCHIVE" ? "" : "primary"}">${t(`settings.action.${action}` as MessageKey)}</button>`).join("")}</div>
    <p class="error" hidden></p>
  </section>`;
}

function detailsSection(competition: CompetitionDetail): string {
  return `<form class="panel details">
    <h2>${t("settings.details")}</h2>
    <div class="grid-2">
      <label class="field">${t("admin.name")}<input name="name" value="${escapeHtml(competition.name)}" required /></label>
      <label class="field">${t("admin.date")}<input name="date" type="date" value="${escapeHtml(competition.date)}" required /></label>
      <label class="field">${t("settings.visibility")}
        <select name="visibility">${(["PUBLIC", "CLUB_ONLY"] as const).map((value) => `<option value="${value}"${competition.visibility === value ? " selected" : ""}>${t(`settings.visibility.${value}`)}</option>`).join("")}</select>
      </label>
      <label class="field">${t("settings.scope")}
        <select name="scopeKind">${SCOPES.map((kind) => `<option value="${kind}"${competition.scope.kind === kind ? " selected" : ""}>${t(`scope.${kind}` as MessageKey)}</option>`).join("")}</select>
      </label>
      <label class="field">${t("settings.scopeValues")}<input name="scopeValues" value="${escapeHtml(competition.scope.values.join(", "))}" /></label>
    </div>
    <label class="check"><input type="checkbox" name="acceptsOtherBouts" ${competition.acceptsOtherBouts ? "checked" : ""} />${t("settings.acceptsOtherBouts")}</label>
    <p class="error" hidden></p>
    <div class="row"><button type="submit" class="primary">${t("settings.save")}</button></div>
  </form>`;
}

function signupsSection(competition: AdminCompetitionDetail): string {
  return `<form class="panel signups">
    <h2>${t("settings.signups")}</h2>
    <label class="check"><input type="checkbox" name="signupsNeedApproval" ${competition.signupsNeedApproval ? "checked" : ""} />${t("settings.signupsNeedApproval")}</label>
    <label class="field">${t("settings.placeLimit")}<input name="placeLimit" type="number" inputmode="numeric" min="1" step="1" value="${competition.placeLimit === null ? "" : Number(competition.placeLimit)}" /></label>
    <p class="error" hidden></p>
    <div class="row"><button type="submit" class="primary">${t("settings.save")}</button></div>
  </form>`;
}

function inviteSection(competition: AdminCompetitionDetail): string {
  const has = Boolean(competition.inviteCode);
  return `<section class="panel invite">
    <h2>${t("settings.inviteHeading")}</h2>
    ${has ? `<invite-share></invite-share><p class="muted">${t("settings.inviteNote")}</p>` : `<p class="muted">${t("settings.inviteNone")}</p>`}
    <p class="error" hidden></p>
    <div class="row"><button type="button" data-renew>${t(has ? "settings.inviteRenew" : "settings.inviteMake")}</button></div>
  </section>`;
}

function rulesetSection(competition: CompetitionDetail): string {
  const form = parametersToForm(competition.rulesetJson);
  const editable = rulesetEditable(competition.status);
  const disabled = editable ? "" : "disabled";
  const number = (name: keyof ParametersForm, label: MessageKey) =>
    `<label class="field">${t(label)}<input name="${name}" type="number" min="0" step="1" value="${form[name] as number}" ${disabled} /></label>`;
  const check = (name: keyof ParametersForm, label: MessageKey) =>
    `<label class="check"><input type="checkbox" name="${name}" ${form[name] ? "checked" : ""} ${disabled} />${t(label)}</label>`;
  return `<form class="panel ruleset">
    <h2>${t("settings.ruleset")}</h2>
    ${editable ? "" : `<p class="muted">${t("settings.rulesetLocked")}</p>`}
    <div class="grid-2">
      ${number("minutes", "settings.minutes")}
      ${number("maxPointsCap", "settings.maxPointsCap")}
      ${number("pointSpreadVictory", "settings.pointSpread")}
      ${number("maxDoubles", "settings.maxDoubles")}
      <label class="field">${t("settings.scores")}<input name="scores" value="${escapeHtml(form.scores)}" ${disabled} /></label>
    </div>
    ${check("allowAfterBlow", "settings.allowAfterBlow")}
    ${check("countDoubles", "settings.countDoubles")}
    ${check("useNetScore", "settings.useNetScore")}
    <p class="error" hidden></p>
    ${editable ? `<div class="row"><button type="submit" class="primary">${t("settings.save")}</button></div>` : ""}
  </form>`;
}

function participantsSection(names: string[]): string {
  return `<section class="panel participants">
    <h2>${t("settings.participants")}</h2>
    ${names.length ? `<p>${names.map(escapeHtml).join(", ")}</p>` : `<p class="muted">${t("settings.noParticipants")}</p>`}
    ${pickerMarkup(t("settings.enrol"))}
    <p class="error" hidden></p>
  </section>`;
}

function adminsSection(admins: CompetitionAdminEntry[], capabilities: { manage: boolean; leave: boolean }, myUserId: string): string {
  const rows = admins
    .map((admin) => {
      const actions: string[] = [];
      if (capabilities.manage && admin.role === "CO_ADMIN") {
        actions.push(`<button type="button" data-owner="${escapeHtml(admin.userId)}">${t("settings.makeOwner")}</button>`);
        actions.push(`<button type="button" data-remove="${escapeHtml(admin.userId)}">${t("settings.remove")}</button>`);
      } else if (capabilities.leave && admin.userId === myUserId) {
        actions.push(`<button type="button" data-remove="${escapeHtml(admin.userId)}">${t("settings.leave")}</button>`);
      }
      return `<div class="row"><strong>${escapeHtml(admin.name)}</strong><span class="muted">${t(`settings.role.${admin.role}` as MessageKey)}</span>${actions.join("")}</div>`;
    })
    .join("");
  return `<section class="panel admins">
    <h2>${t("settings.admins")}</h2>
    ${rows}
    ${capabilities.manage ? pickerMarkup(t("settings.addAdmin")) : ""}
    <p class="error" hidden></p>
  </section>`;
}

function pickerMarkup(label: string): string {
  return `<label class="field picker">${escapeHtml(label)}<input type="search" placeholder="${t("settings.searchPerson")}" autocomplete="off" /></label>
    <div class="picker-results row"></div>`;
}

/** A search box that lists people; choosing one runs `onPick`. */
function wirePersonPicker(
  section: HTMLElement,
  context: AppContext,
  onPick: (person: PersonSearchResult, section: HTMLElement) => Promise<unknown>,
): void {
  const input = section.querySelector<HTMLInputElement>(".picker input");
  const results = section.querySelector<HTMLElement>(".picker-results");
  if (!input || !results) {
    return;
  }
  let latest = "";
  input.addEventListener("input", async () => {
    const query = input.value.trim();
    latest = query;
    if (query.length < 2) {
      results.innerHTML = "";
      return;
    }
    let people: PersonSearchResult[];
    try {
      people = await context.client.searchPeople(query);
    } catch (caught) {
      if (caught instanceof SessionExpiredError) {
        context.sessionExpired();
        return;
      }
      const error = section.querySelector<HTMLElement>(".error")!;
      error.hidden = false;
      error.textContent = caught instanceof Error ? caught.message : String(caught);
      return;
    }
    if (latest !== query) {
      return;
    }
    results.innerHTML = people
      .map((person) => `<button type="button" data-user="${escapeHtml(person.userId)}">${escapeHtml(person.name)}${person.clubName ? ` · ${escapeHtml(person.clubName)}` : ""}</button>`)
      .join("");
    results.querySelectorAll<HTMLButtonElement>("button[data-user]").forEach((button) => {
      button.addEventListener("click", () => {
        const person = people.find((candidate) => candidate.userId === button.dataset.user);
        if (person) {
          void onPick(person, section);
        }
      });
    });
  });
}
