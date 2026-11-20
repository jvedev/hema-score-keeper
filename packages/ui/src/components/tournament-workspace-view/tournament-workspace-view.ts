import css from "./tournament-workspace-view.css?raw";
import { BaseComponent } from "../base-component/base-component.js";
import { LOCALE_CHANGE_EVENT, t } from "../../i18n/i18n.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { nextStage, orderStages } from "./stage-order.js";
import "../pool-results/pool-results.js";
import type { PoolResults } from "../pool-results/pool-results.js";
import { matchPlayed, nextFreeOrder, poolPhaseFor, roundStatus, stageMatchRows, stagePhaseOptions } from "./stage-matches.js";
import { createApiClient, type ApiEvent, type ApiTournament, type ApiStage, type ApiEntry, type ApiStageOfficial, type StageOfficialRole, type ApiTournamentAdmin, type ApiTournamentAdminCandidate, type ApiDatabaseLiveStatus, type ApiLiveRing, type ApiDatabaseLiveResult, type ApiLiveRingColors, type ApiScoreboardSettings, type ApiRingRules, type ApiScoreboardTextSize, type ApiScoreboardTheme, type ApiMatch, type ApiRound, type StageType } from "@hema/event-admin-api";

function skillLevel(skills: Array<{ skillName: string; skillLevel: number }> | undefined, skillName: string): number {
  return skills?.find((skill) => skill.skillName === skillName && skill.skillLevel > 0)?.skillLevel ?? 0;
}

export type TournamentTab = "overview" | "participants" | "stages" | "officials" | "access" | "live";

interface StageFormState {
  mode: "create" | "edit";
  stageId: string | null;
  type: StageType;
  name: string;
  /** "" = no ruleset of its own (the tournament's or event's ruleset applies). */
  rulesetId: string;
  minPoolSize: string;
  maxPoolSize: string;
  preferredPoolSize: string;
  eliminationParticipantCount: string;
  timeBetweenMatchesMinutes: string;
}

/** The match being planned: pool matches only change their order; bracket matches also their phase. */
interface PlanFormState {
  matchId: string;
  stageId: string;
  pool: boolean;
  phaseId: string;
  order: string;
}

const STAGE_FORM_FIELDS = [
  "name",
  "rulesetId",
  "minPoolSize",
  "maxPoolSize",
  "preferredPoolSize",
  "eliminationParticipantCount",
  "timeBetweenMatchesMinutes",
] as const;

export class TournamentWorkspaceView extends BaseComponent {
  #event: ApiEvent | null = null;
  #tournamentId: string | null = null;
  #activeTab: TournamentTab = "overview";
  #selectedStageId: string | null = null;
  #loading = false;
  #error: string | null = null;
  #entryError: string | null = null;
  #deletingEntry = false;
  #addingEntry = false;
  #showAddParticipant = false;
  #participantName = "";
  #showBulk = false;
  #bulkNames = "";
  #editEntry: {
    id: string;
    tournamentId: string;
    username: string;
    kind: "FIGHTER" | "VOLUNTEER" | "BOTH";
    seed: string;
    judgeVolunteer: boolean;
    juryVolunteer: boolean;
    tableVolunteer: boolean;
    otherVolunteer: boolean;
    judgeSkill: string;
    jurySkill: string;
  } | null = null;
  #savingEntry = false;
  // Officials state
  #addingOfficial = false;
  #deletingOfficialId: string | null = null;
  #showAddOfficial = false;
  #officialStageId: string | null = null;
  #officialEntryId: string = "";
  #officialRole: StageOfficialRole = "JUDGE";
  #officialsError: string | null = null;
  // Access state
  #tournamentAdmins: ApiTournamentAdmin[] = [];
  #tournamentAdminCandidates: ApiTournamentAdminCandidate[] = [];
  #addingAdmin = false;
  #removingAdminUserId: string | null = null;
  #showAddAdmin = false;
  #adminUserId: string = "";
  #accessError: string | null = null;
  // Tournament form state
  #showEditTournament = false;
  #savingTournament = false;
  #tournamentError: string | null = null;
  #poolResultsFullscreen = false;
  #fillingBracket = false;
  // Match planning: one match at a time; pool matches only change order, bracket matches also their phase.
  #planForm: PlanFormState | null = null;
  #planSaving = false;
  #planError: string | null = null;
  // Stage form state: one form for creating and editing; the typed values survive re-renders.
  #stageForm: StageFormState | null = null;
  #savingStage = false;
  #stageFormError: string | null = null;
  #stageError: string | null = null;
  #deletingStageId: string | null = null;
  // Live state
  #liveStatus: ApiDatabaseLiveStatus | null = null;
  #liveRings: ApiLiveRing[] = [];
  #liveResults: ApiDatabaseLiveResult[] = [];
  #activatingLive = false;
  #loadingLive = false;
  #liveError: string | null = null;
  #editingRingId: string | null = null;
  #editingRingColors: { leftColor: string; rightColor: string } | null = null;
  #editingRingSettings: { mirrored: boolean; showNext: boolean; textSize: string; theme: string } | null = null;
  #savingRing = false;
  #rotatingKeeperToken: string | null = null;
  #rotatingScoreboardToken: string | null = null;
  #showingCorrectionModal = false;
  #correctingResultId: string | null = null;

  get event(): ApiEvent | null {
    return this.#event;
  }

  set event(value: ApiEvent | null) {
    this.#event = value;
    this.renderView();
  }

  get tournamentId(): string | null {
    return this.#tournamentId;
  }

  set tournamentId(value: string | null) {
    if (value !== this.#tournamentId) {
      this.#showAddParticipant = false;
      this.#participantName = "";
      this.#entryError = null;
      this.#showBulk = false;
      this.#bulkNames = "";
      this.#editEntry = null;
      this.#showEditTournament = false;
      this.#tournamentError = null;
      this.#stageForm = null;
      this.#stageFormError = null;
      this.#planForm = null;
      this.#planError = null;
    }
    this.#tournamentId = value;
    this.renderView();
  }

  get activeTab(): TournamentTab {
    return this.#activeTab;
  }

  set activeTab(value: TournamentTab) {
    this.#activeTab = value;
    this.renderView();
  }

  get selectedStageId(): string | null {
    return this.#selectedStageId;
  }

  set selectedStageId(value: string | null) {
    this.#selectedStageId = value;
    this.renderView();
  }

  get loading(): boolean {
    return this.#loading;
  }

  set loading(value: boolean) {
    this.#loading = value;
    this.renderView();
  }

  get error(): string | null {
    return this.#error;
  }

  set error(value: string | null) {
    this.#error = value;
    this.renderView();
  }

  connectedCallback(): void {
    this.renderView();
    this.registerEvent(window, LOCALE_CHANGE_EVENT, () => this.renderView());
    this.registerEvent(this.root, "click", (e) => this.handleClick(e));
    this.registerEvent(this.root, "keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape" && this.#poolResultsFullscreen) this.closePoolResultsFullscreen();
    });
    this.registerEvent(this.root, "input", (e) => {
      const input = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (input.name === "usernames") this.#bulkNames = input.value;
      if (this.#editEntry && input.name === "seed") this.#editEntry.seed = input.value;
      if (this.#editEntry && input.name === "tournamentId") this.#editEntry.tournamentId = input.value;
      if (this.#editEntry && input.name === "username") this.#editEntry.username = input.value;
      if (this.#editEntry && input instanceof HTMLInputElement && input.type === "checkbox") {
        if (input.name === "judgeVolunteer") this.#editEntry.judgeVolunteer = input.checked;
        if (input.name === "juryVolunteer") this.#editEntry.juryVolunteer = input.checked;
        if (input.name === "tableVolunteer") this.#editEntry.tableVolunteer = input.checked;
        if (input.name === "otherVolunteer") this.#editEntry.otherVolunteer = input.checked;
      }
      if (this.#editEntry && input.name === "judgeSkill") this.#editEntry.judgeSkill = input.value;
      if (this.#editEntry && input.name === "jurySkill") this.#editEntry.jurySkill = input.value;
      if (this.#editEntry && input.name === "kind" && (input.value === "FIGHTER" || input.value === "VOLUNTEER" || input.value === "BOTH")) this.#editEntry.kind = input.value;
      if (this.#stageForm && input.closest("form.stage-form")) this.updateStageFormField(input);
      if (this.#planForm && input.name === "order" && input.closest("form[data-form='plan-match']")) this.#planForm.order = input.value;
    });
    this.registerEvent(this.root, "change", (e) => {
      const input = e.target as HTMLSelectElement;
      if (this.#planForm && input.name === "scheduledPhaseId" && input.closest("form[data-form='plan-match']")) {
        this.choosePlanPhase(input.value);
        return;
      }
      if (this.#stageForm && input.name === "type" && input.closest("form.stage-form")) {
        this.updateStageFormField(input);
        this.renderView();
      }
    });
    this.registerEvent(this.root, "submit", (e) => {
      const form = e.target as HTMLFormElement;
      if (form.dataset.form !== "add-participant" && form.dataset.form !== "add-bulk" && form.dataset.form !== "edit-entry" && form.dataset.form !== "add-official" && form.dataset.form !== "add-admin" && form.dataset.form !== "ring-edit" && form.dataset.form !== "add-stage" && form.dataset.form !== "edit-stage" && form.dataset.form !== "edit-tournament" && form.dataset.form !== "plan-match") return;
      e.preventDefault();
      if (form.dataset.form === "add-bulk") void this.addBulk(form);
      else if (form.dataset.form === "edit-entry") void this.saveEntry(form);
      else if (form.dataset.form === "add-official") void this.addOfficial(form);
      else if (form.dataset.form === "add-admin") void this.handleAddAdmin(form);
      else if (form.dataset.form === "ring-edit") void this.handleRingEdit(form);
      else if (form.dataset.form === "add-stage" || form.dataset.form === "edit-stage") void this.submitStageForm(form);
      else if (form.dataset.form === "edit-tournament") void this.saveTournament(form);
      else if (form.dataset.form === "plan-match") void this.savePlan(form);
      else void this.addParticipant(form);
    });
  }

  private handleClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const tabBtn = target.closest<HTMLElement>("[data-tab]");
    if (tabBtn && tabBtn.dataset.tab) {
      this.#activeTab = tabBtn.dataset.tab as TournamentTab;
      if (this.#activeTab === "access") {
        void this.loadTournamentAdmins();
      } else if (this.#activeTab === "live") {
        void this.loadLiveData();
      }
      this.renderView();
      return;
    }

    // Buttons inside a stage row (edit, delete) must run their own action, so actions come before selection.
    const actionEl = target.closest<HTMLElement>("[data-action]");
    if (!actionEl?.dataset.action) {
      const stageItem = target.closest<HTMLElement>("[data-stage-id]");
      if (stageItem?.dataset.stageId) {
        this.#selectedStageId = stageItem.dataset.stageId;
        this.renderView();
      }
      return;
    }
    {
      const action = actionEl.dataset.action;
      if (action === "view-participants") {
        this.#activeTab = "participants";
        this.renderView();
      } else if (action === "edit-tournament") {
        this.#showEditTournament = true;
        this.#tournamentError = null;
        this.renderView();
        this.root.querySelector<HTMLInputElement>("form[data-form='edit-tournament'] input[name='name']")?.focus();
      } else if (action === "cancel-edit-tournament" && !this.#savingTournament) {
        this.#showEditTournament = false;
        this.#tournamentError = null;
        this.renderView();
      } else if (action === "add-participant") {
        this.#showAddParticipant = true;
        this.#entryError = null;
        this.renderView();
      } else if (action === "cancel-add-participant") {
        this.#showAddParticipant = false;
        this.#participantName = "";
        this.#entryError = null;
        this.renderView();
      } else if (action === "add-bulk") {
        this.#showBulk = true;
        this.#showAddParticipant = false;
        this.#entryError = null;
        this.renderView();
      } else if (action === "cancel-bulk") {
        this.#showBulk = false;
        this.#bulkNames = "";
        this.#entryError = null;
        this.renderView();
      } else if (action === "delete-entry") {
        void this.deleteEntry(actionEl.dataset.id);
      } else if (action === "edit-entry") {
        const entry = this.currentTournament()?.entries.find((item) => item.id === actionEl.dataset.id);
        if (entry && !this.#savingEntry) {
          this.#editEntry = {
            id: entry.id,
            tournamentId: entry.tournamentId,
            username: entry.user?.username ?? "",
            kind: entry.kind,
            seed: entry.seed?.toString() ?? "",
            judgeVolunteer: entry.user?.judgeVolunteer ?? false,
            juryVolunteer: entry.user?.juryVolunteer ?? false,
            tableVolunteer: entry.user?.tableVolunteer ?? false,
            otherVolunteer: entry.user?.otherVolunteer ?? false,
            judgeSkill: skillLevel(entry.user?.skills, "JUDGE").toString(),
            jurySkill: skillLevel(entry.user?.skills, "JURY").toString(),
          };
          this.#entryError = null;
          this.renderView();
        }
      } else if (action === "cancel-edit-entry" && !this.#savingEntry) {
        this.#editEntry = null;
        this.#entryError = null;
        this.renderView();
      } else if (action === "add-official") {
        const stageId = actionEl.dataset.stageId;
        if (stageId) {
          this.#officialStageId = stageId;
          this.#showAddOfficial = true;
          this.#officialsError = null;
          this.renderView();
        }
      } else if (action === "cancel-add-official") {
        this.#showAddOfficial = false;
        this.#officialStageId = null;
        this.#officialEntryId = "";
        this.#officialRole = "JUDGE";
        this.#officialsError = null;
        this.renderView();
      } else if (action === "delete-official") {
        const officialId = actionEl.dataset.officialId;
        if (officialId && window.confirm(t("tournament.deleteOfficialConfirm"))) {
          void this.deleteOfficial(officialId);
        }
      } else if (action === "add-admin") {
        this.#showAddAdmin = true;
        this.#adminUserId = "";
        this.#accessError = null;
        void this.loadTournamentAdmins();
        this.renderView();
      } else if (action === "cancel-add-admin") {
        this.#showAddAdmin = false;
        this.#adminUserId = "";
        this.#accessError = null;
        this.renderView();
      } else if (action === "remove-admin") {
        const userId = actionEl.dataset.userId;
        const userName = actionEl.closest("tr")?.querySelector("td")?.textContent ?? "";
        if (userId && window.confirm(t("tournament.removeAdminConfirm", { name: userName }))) {
          void this.removeTournamentAdmin(userId);
        }
      } else if (action === "activate-live") {
        if (window.confirm(t("tournament.activateLiveConfirm"))) {
          void this.activateLiveTournament();
        }
      } else if (action === "rotate-keeper") {
        const ringId = actionEl.dataset.ringId;
        const ringName = actionEl.closest("tr")?.querySelector("td")?.textContent ?? "";
        if (ringId && window.confirm(t("tournament.rotateKeeperConfirm", { name: ringName }))) {
          void this.rotateKeeperToken(ringId);
        }
      } else if (action === "rotate-scoreboard") {
        const ringId = actionEl.dataset.ringId;
        const ringName = actionEl.closest("tr")?.querySelector("td")?.textContent ?? "";
        if (ringId && window.confirm(t("tournament.rotateScoreboardConfirm", { name: ringName }))) {
          void this.rotateScoreboardToken(ringId);
        }
      } else if (action === "edit-ring-colors") {
        const ringId = actionEl.dataset.ringId;
        if (ringId) {
          const ring = this.#liveRings.find((r) => r.id === ringId);
          if (ring) {
            this.#editingRingId = ringId;
            this.#editingRingColors = { leftColor: ring.leftColor, rightColor: ring.rightColor };
            this.#editingRingSettings = null;
            this.renderView();
          }
        }
      } else if (action === "edit-ring-settings") {
        const ringId = actionEl.dataset.ringId;
        if (ringId) {
          const ring = this.#liveRings.find((r) => r.id === ringId);
          if (ring) {
            this.#editingRingId = ringId;
            this.#editingRingColors = null;
            this.#editingRingSettings = {
              mirrored: ring.scoreboard.mirrored,
              showNext: ring.scoreboard.showNext,
              textSize: ring.scoreboard.textSize,
              theme: ring.scoreboard.theme,
            };
            this.renderView();
          }
        }
      } else if (action === "cancel-ring-edit") {
        this.#editingRingId = null;
        this.#editingRingColors = null;
        this.#editingRingSettings = null;
        this.renderView();
      } else if (action === "correct-result") {
        const resultId = actionEl.dataset.resultId;
        if (resultId) {
          this.#showingCorrectionModal = true;
          this.#correctingResultId = resultId;
          this.renderView();
        }
      } else if (action === "add-stage") {
        this.openStageForm(null);
      } else if (action === "edit-stage") {
        const stage = this.currentTournament()?.stages?.find((item) => item.id === actionEl.dataset.stageId);
        if (stage) this.openStageForm(stage);
      } else if (action === "cancel-stage-form" && !this.#savingStage) {
        this.#stageForm = null;
        this.#stageFormError = null;
        this.renderView();
      } else if (action === "delete-stage") {
        const stageId = actionEl.dataset.stageId;
        const stageName = actionEl.dataset.stageName ?? "";
        if (stageId && window.confirm(t("tournament.deleteStageConfirm", { name: stageName }))) {
          void this.deleteStage(stageId);
        }
      } else if (action === "go-stages" || action === "go-live") {
        this.#activeTab = action === "go-stages" ? "stages" : "live";
        if (this.#activeTab === "live") void this.loadLiveData();
        this.renderView();
      } else if (action === "fill-bracket") {
        const stageId = actionEl.dataset.stageId;
        const refill = actionEl.dataset.filled === "true";
        if (stageId && (!refill || window.confirm(t("tournament.bracketRefillConfirm")))) void this.fillBracket(stageId);
      } else if (action === "open-pool-results-fullscreen") {
        this.#poolResultsFullscreen = true;
        this.renderView();
        this.root.querySelector<HTMLButtonElement>("[data-action='close-pool-results-fullscreen']")?.focus();
      } else if (action === "close-pool-results-fullscreen") {
        this.closePoolResultsFullscreen();
      } else if (action === "plan-match") {
        this.openPlan(actionEl.dataset.matchId ?? "");
      } else if (action === "cancel-plan" && !this.#planSaving) {
        this.#planForm = null;
        this.#planError = null;
        this.renderView();
      } else if (action === "unschedule-match") {
        void this.unschedulePlannedMatch();
      } else if (action === "open-planning") {
        if (this.#event) {
          this.dispatchEvent(new CustomEvent("planning-requested", { bubbles: true, composed: true, detail: { eventId: this.#event.id } }));
        }
      } else if (action === "next-stage") {
        const stageId = actionEl.dataset.stageId;
        if (stageId && window.confirm(t("tournament.nextStageConfirm", { name: actionEl.dataset.stageName ?? "" }))) {
          void this.makeActiveStage(stageId);
        }
      } else if (action === "make-active-stage") {
        const stageId = actionEl.dataset.stageId;
        if (stageId) {
          void this.makeActiveStage(stageId);
        }
      }
    }
  }

  private async addBulk(form: HTMLFormElement): Promise<void> {
    const event = this.#event;
    const tournament = this.currentTournament();
    const form_ = new FormData(form);
    const value = String(form_.get("usernames") ?? "");
    const alsoVolunteer = form_.get("alsoVolunteer") === "on";
    const names: string[] = [];
    for (const line of value.split(/\r?\n/)) {
      const name = line.trim();
      if (name && !names.some((item) => item.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) names.push(name);
    }
    if (!event || !tournament || !names.length || this.#addingEntry) return;
    this.#bulkNames = value;
    this.#addingEntry = true;
    this.#entryError = null;
    this.renderView();
    const api = createApiClient();
    const current = () => this.#event?.id === event.id && this.#tournamentId === tournament.id;
    try {
      const users = await api.listUsers();
      const latest = await api.getEvent(event.id);
      const entries = latest.tournaments.find((item) => item.id === tournament.id)?.entries;
      if (!entries) throw new Error(t("tournament.notFound"));
      for (const username of names) {
        let user = users.find((item) => item.username.localeCompare(username, undefined, { sensitivity: "accent" }) === 0);
        if (!user) {
          user = await api.createUser({ username });
          users.push(user);
        }
        if (!entries.some((entry) => entry.userId === user.id)) {
          const entry = await api.createEntry({ tournamentId: tournament.id, userId: user.id, kind: latest.allFightersAreVolunteers || alsoVolunteer ? "BOTH" : "FIGHTER" });
          entries.push(entry);
        }
      }
      const refreshed = await api.getEvent(event.id);
      if (current()) {
        this.#event = refreshed;
        this.#showBulk = false;
        this.#bulkNames = "";
      }
    } catch (error) {
      try {
        const refreshed = await api.getEvent(event.id);
        if (current()) this.#event = refreshed;
      } catch { /* Retrying reloads the event before writing. */ }
      if (current()) this.#entryError = `${t("tournament.bulkPartialError")} ${error instanceof Error ? error.message : ""}`;
    } finally {
      this.#addingEntry = false;
      this.renderView();
    }
  }

  private async addParticipant(form: HTMLFormElement): Promise<void> {
    const event = this.#event;
    const tournament = this.currentTournament();
    const username = String(new FormData(form).get("username") ?? "").trim();
    if (!event || !tournament || !username || this.#addingEntry) return;
    this.#participantName = username;
    this.#addingEntry = true;
    this.#entryError = null;
    const button = form.querySelector<HTMLButtonElement>("button[type='submit']");
    if (button) button.disabled = true;
    try {
      const api = createApiClient();
      const users = await api.listUsers();
      const user = users.find((item) => item.username.localeCompare(username, undefined, { sensitivity: "accent" }) === 0)
        ?? await api.createUser({ username });
      const existing = tournament.entries.find((entry) => entry.userId === user.id);
      const kind = event.allFightersAreVolunteers || String(new FormData(form).get("alsoVolunteer") ?? "") === "on" ? "BOTH" : "FIGHTER";
      if (!existing) await api.createEntry({ tournamentId: tournament.id, userId: user.id, kind });
      const refreshed = await api.getEvent(event.id);
      if (this.#event?.id === event.id && this.#tournamentId === tournament.id) {
        this.#event = refreshed;
        this.#showAddParticipant = false;
        this.#participantName = "";
      }
    } catch (error) {
      if (this.#event?.id === event.id && this.#tournamentId === tournament.id) {
        this.#entryError = error instanceof Error ? error.message : t("tournament.addParticipantError");
      }
    } finally {
      this.#addingEntry = false;
      this.renderView();
    }
  }

  private async saveEntry(form: HTMLFormElement): Promise<void> {
    const event = this.#event;
    const tournamentId = this.#tournamentId;
    const editing = this.#editEntry;
    if (!event || !tournamentId || !editing || this.#savingEntry || !form.reportValidity()) return;
    const data = new FormData(form);
    const kind = data.get("kind");
    const destinationTournamentId = String(data.get("tournamentId") ?? "");
    const username = String(data.get("username") ?? "").trim();
    if (kind !== "FIGHTER" && kind !== "VOLUNTEER" && kind !== "BOTH" || !destinationTournamentId || !username) return;
    const seed = String(data.get("seed") ?? "");
    const seedValue = seed === "" ? null : Number(seed);
    editing.kind = kind;
    editing.seed = seed;
    editing.tournamentId = destinationTournamentId;
    editing.username = username;
    for (const flag of ["judgeVolunteer", "juryVolunteer", "tableVolunteer", "otherVolunteer"] as const) {
      editing[flag] = data.get(flag) === "on";
    }
    this.#savingEntry = true;
    this.#entryError = null;
    this.renderView();
    const current = () => this.#event?.id === event.id && this.#tournamentId === tournamentId;
    try {
      const api = createApiClient();
      await api.updateEntryParticipant(editing.id, {
        tournamentId: destinationTournamentId,
        kind,
        seed: seedValue,
        username,
        judgeVolunteer: editing.judgeVolunteer,
        juryVolunteer: editing.juryVolunteer,
        tableVolunteer: editing.tableVolunteer,
        otherVolunteer: editing.otherVolunteer,
        skills: [
          { skillName: "JUDGE", skillLevel: Number(editing.judgeSkill) > 0 ? Number(editing.judgeSkill) : null },
          { skillName: "JURY", skillLevel: Number(editing.jurySkill) > 0 ? Number(editing.jurySkill) : null },
        ],
      });
      const refreshed = await api.getEvent(event.id);
      if (current()) {
        this.#event = refreshed;
        this.#editEntry = null;
      }
    } catch (error) {
      if (current()) this.#entryError = error instanceof Error ? error.message : t("tournament.editParticipantError");
    } finally {
      this.#savingEntry = false;
      this.renderView();
    }
  }

  private async deleteEntry(id: string | undefined): Promise<void> {
    const event = this.#event;
    const tournamentId = this.#tournamentId;
    const entry = this.currentTournament()?.entries?.find((item) => item.id === id);
    if (!event || !entry || this.#deletingEntry || !window.confirm(t("tournament.deleteParticipantConfirm", { name: entry.user?.username ?? entry.id }))) return;

    this.#deletingEntry = true;
    this.#entryError = null;
    this.renderView();
    try {
      const api = createApiClient();
      await api.deleteEntry(entry.id);
      const refreshed = await api.getEvent(event.id);
      if (this.#event?.id === event.id && this.#tournamentId === tournamentId) this.#event = refreshed;
    } catch (error) {
      if (this.#event?.id === event.id && this.#tournamentId === tournamentId) {
        this.#entryError = error instanceof Error ? error.message : t("tournament.deleteParticipantError");
      }
    } finally {
      this.#deletingEntry = false;
      this.renderView();
    }
  }

  private async addOfficial(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const stageId = this.#officialStageId;
    const entryId = String(formData.get("entryId") ?? "");
    const role = formData.get("role") as StageOfficialRole | null;
    if (!stageId || !entryId || !role) return;

    this.#addingOfficial = true;
    this.#officialsError = null;
    this.renderView();

    const current = () => this.#event?.id && this.#tournamentId && this.#officialStageId === stageId;
    try {
      const api = createApiClient();
      await api.createStageOfficial(stageId, { entryId, role });
      const refreshed = await api.getEvent(this.#event!.id);
      if (current()) {
        this.#event = refreshed;
        this.#showAddOfficial = false;
        this.#officialStageId = null;
        this.#officialEntryId = "";
        this.#officialRole = "JUDGE";
      }
    } catch (error) {
      if (current()) {
        this.#officialsError = error instanceof Error ? error.message : t("tournament.addOfficialError");
      }
    } finally {
      this.#addingOfficial = false;
      this.renderView();
    }
  }

  private async deleteOfficial(id: string): Promise<void> {
    const event = this.#event;
    if (!event || this.#deletingOfficialId) return;

    this.#deletingOfficialId = id;
    this.#officialsError = null;
    this.renderView();

    const current = () => this.#event?.id === event.id;
    try {
      const api = createApiClient();
      await api.deleteStageOfficial(id);
      const refreshed = await api.getEvent(event.id);
      if (current()) this.#event = refreshed;
    } catch (error) {
      if (current()) {
        this.#officialsError = error instanceof Error ? error.message : t("tournament.deleteOfficialError");
      }
    } finally {
      this.#deletingOfficialId = null;
      this.renderView();
    }
  }

  private async loadTournamentAdmins(): Promise<void> {
    const tournamentId = this.#tournamentId;
    if (!tournamentId) return;

    this.#accessError = null;
    try {
      const api = createApiClient();
      this.#tournamentAdmins = await api.tournamentAdmins(tournamentId);
      this.#tournamentAdminCandidates = await api.tournamentAdminCandidates(tournamentId);
    } catch (error) {
      this.#accessError = error instanceof Error ? error.message : t("tournament.loadAccessError");
    }
  }

  private async handleAddAdmin(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    this.#adminUserId = String(formData.get("userId") ?? "");
    if (!this.#adminUserId) return;
    await this.addTournamentAdmin();
  }

  private async handleRingEdit(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const ringId = this.#editingRingId;
    if (!ringId) return;

    const leftColor = String(formData.get("leftColor") ?? "");
    const rightColor = String(formData.get("rightColor") ?? "");
    const mirrored = formData.get("mirrored") !== null;
    const showNext = formData.get("showNext") !== null;
    const textSize = String(formData.get("textSize") ?? "MEDIUM") as ApiScoreboardTextSize;
    const theme = String(formData.get("theme") ?? "DARK") as ApiScoreboardTheme;

    if (this.#editingRingColors) {
      await this.saveRingColors(ringId, { leftColor, rightColor });
    }
    if (this.#editingRingSettings) {
      await this.saveRingSettings(ringId, { mirrored, showNext, textSize, theme });
    }
  }

  private async addTournamentAdmin(): Promise<void> {
    const tournamentId = this.#tournamentId;
    const userId = this.#adminUserId;
    if (!tournamentId || !userId) return;

    this.#addingAdmin = true;
    this.#accessError = null;
    this.renderView();

    const current = () => this.#tournamentId === tournamentId;
    try {
      const api = createApiClient();
      this.#tournamentAdmins = await api.addTournamentAdmin(tournamentId, userId);
      this.#tournamentAdminCandidates = await api.tournamentAdminCandidates(tournamentId);
      if (current()) {
        this.#showAddAdmin = false;
        this.#adminUserId = "";
      }
    } catch (error) {
      this.#accessError = error instanceof Error ? error.message : t("tournament.addAdminError");
    } finally {
      this.#addingAdmin = false;
      this.renderView();
    }
  }

  private async removeTournamentAdmin(userId: string): Promise<void> {
    const tournamentId = this.#tournamentId;
    if (!tournamentId || !userId) return;

    this.#removingAdminUserId = userId;
    this.#accessError = null;
    this.renderView();

    const current = () => this.#tournamentId === tournamentId;
    try {
      const api = createApiClient();
      await api.removeTournamentAdmin(tournamentId, userId);
      this.#tournamentAdmins = this.#tournamentAdmins.filter((a) => a.userId !== userId);
      this.#tournamentAdminCandidates = await api.tournamentAdminCandidates(tournamentId);
    } catch (error) {
      if (current()) {
        this.#accessError = error instanceof Error ? error.message : t("tournament.removeAdminError");
      }
    } finally {
      this.#removingAdminUserId = null;
      this.renderView();
    }
  }

  private async loadLiveData(): Promise<void> {
    const tournamentId = this.#tournamentId;
    if (!tournamentId) return;

    this.#loadingLive = true;
    this.#liveError = null;
    this.renderView();

    try {
      const api = createApiClient();
      this.#liveStatus = await api.databaseLiveStatus(tournamentId);
      if (this.#liveStatus?.active && this.#liveStatus.liveTournamentId) {
        this.#liveRings = await api.liveRings(this.#liveStatus.liveTournamentId);
        this.#liveResults = await api.databaseLiveResults(tournamentId);
      } else {
        this.#liveRings = [];
        this.#liveResults = [];
      }
    } catch (error) {
      this.#liveError = error instanceof Error ? error.message : t("tournament.loadLiveError");
    } finally {
      this.#loadingLive = false;
      this.renderView();
    }
  }

  private async activateLiveTournament(): Promise<void> {
    const tournamentId = this.#tournamentId;
    if (!tournamentId) return;

    this.#activatingLive = true;
    this.#liveError = null;
    this.renderView();

    const current = () => this.#tournamentId === tournamentId;
    try {
      const api = createApiClient();
      const result = await api.activateDatabaseLive(tournamentId);
      this.#liveStatus = {
        active: true,
        liveTournamentId: result.id,
        rings: result.projection.rings,
        bouts: result.projection.bouts,
      };
      if (current() && this.#liveStatus.liveTournamentId) {
        this.#liveRings = await api.liveRings(this.#liveStatus.liveTournamentId);
        this.#liveResults = await api.databaseLiveResults(tournamentId);
      }
    } catch (error) {
      if (current()) {
        this.#liveError = error instanceof Error ? error.message : t("tournament.activateLiveError");
      }
    } finally {
      this.#activatingLive = false;
      this.renderView();
    }
  }

  private async rotateKeeperToken(ringId: string): Promise<void> {
    this.#rotatingKeeperToken = ringId;
    this.#liveError = null;
    this.renderView();

    const current = () => this.#liveStatus?.liveTournamentId && this.#editingRingId === null;
    try {
      const api = createApiClient();
      await api.rotateLiveRingKeeperToken(ringId);
      if (current() && this.#liveStatus?.liveTournamentId) {
        this.#liveRings = await api.liveRings(this.#liveStatus.liveTournamentId);
      }
    } catch (error) {
      if (current()) {
        this.#liveError = error instanceof Error ? error.message : t("tournament.rotateKeeperError");
      }
    } finally {
      this.#rotatingKeeperToken = null;
      this.renderView();
    }
  }

  private async rotateScoreboardToken(ringId: string): Promise<void> {
    this.#rotatingScoreboardToken = ringId;
    this.#liveError = null;
    this.renderView();

    const current = () => this.#liveStatus?.liveTournamentId && this.#editingRingId === null;
    try {
      const api = createApiClient();
      await api.rotateLiveRingScoreboardToken(ringId);
      if (current() && this.#liveStatus?.liveTournamentId) {
        this.#liveRings = await api.liveRings(this.#liveStatus.liveTournamentId);
      }
    } catch (error) {
      if (current()) {
        this.#liveError = error instanceof Error ? error.message : t("tournament.rotateScoreboardError");
      }
    } finally {
      this.#rotatingScoreboardToken = null;
      this.renderView();
    }
  }

  private async saveRingColors(ringId: string, colors: ApiLiveRingColors): Promise<void> {
    this.#savingRing = true;
    this.#liveError = null;
    this.renderView();

    const current = () => this.#liveStatus?.liveTournamentId && this.#editingRingId === ringId;
    try {
      const api = createApiClient();
      await api.setLiveRingColors(ringId, colors);
      if (current() && this.#liveStatus?.liveTournamentId) {
        this.#liveRings = await api.liveRings(this.#liveStatus.liveTournamentId);
        this.#editingRingId = null;
        this.#editingRingColors = null;
      }
    } catch (error) {
      if (current()) {
        this.#liveError = error instanceof Error ? error.message : t("tournament.saveRingColorsError");
      }
    } finally {
      this.#savingRing = false;
      this.renderView();
    }
  }

  private async saveRingSettings(ringId: string, settings: ApiScoreboardSettings): Promise<void> {
    this.#savingRing = true;
    this.#liveError = null;
    this.renderView();

    const current = () => this.#liveStatus?.liveTournamentId && this.#editingRingId === ringId;
    try {
      const api = createApiClient();
      await api.setLiveRingScoreboardSettings(ringId, settings);
      if (current() && this.#liveStatus?.liveTournamentId) {
        this.#liveRings = await api.liveRings(this.#liveStatus.liveTournamentId);
        this.#editingRingId = null;
        this.#editingRingSettings = null;
      }
    } catch (error) {
      if (current()) {
        this.#liveError = error instanceof Error ? error.message : t("tournament.saveRingSettingsError");
      }
    } finally {
      this.#savingRing = false;
      this.renderView();
    }
  }

  private findMatch(matchId: string): { stage: ApiStage; round: ApiRound; match: ApiMatch } | null {
    for (const stage of this.currentTournament()?.stages ?? []) {
      for (const round of stage.rounds ?? []) {
        const match = round.matches?.find((item) => item.id === matchId);
        if (match) return { stage, round, match };
      }
    }
    return null;
  }

  private openPlan(matchId: string): void {
    const found = this.findMatch(matchId);
    const event = this.#event;
    if (!found || !event || this.#planSaving) return;
    const { stage, round, match } = found;
    const pool = stage.type === "POOL";
    const phaseId = pool
      ? (poolPhaseFor(event, stage, match, round)?.phaseId ?? "")
      : (match.scheduledMatch?.scheduledPhaseId ?? stagePhaseOptions(event, stage.id)[0]?.phaseId ?? "");
    const order = match.scheduledMatch && match.scheduledMatch.scheduledPhaseId === phaseId
      ? match.scheduledMatch.order
      : phaseId
        ? nextFreeOrder(event, phaseId, match.id)
        : 1;
    this.#planForm = { matchId, stageId: stage.id, pool, phaseId, order: String(order) };
    this.#planError = null;
    this.renderView();
  }

  private choosePlanPhase(phaseId: string): void {
    const form = this.#planForm;
    const event = this.#event;
    const found = form ? this.findMatch(form.matchId) : null;
    if (!form || !event || !found) return;
    form.phaseId = phaseId;
    const scheduled = found.match.scheduledMatch;
    form.order = String(scheduled && scheduled.scheduledPhaseId === phaseId ? scheduled.order : nextFreeOrder(event, phaseId, found.match.id));
    this.renderView();
  }

  private async savePlan(element: HTMLFormElement): Promise<void> {
    const form = this.#planForm;
    const eventId = this.#event?.id;
    if (!form || !eventId || this.#planSaving) return;
    const orderInput = element.querySelector<HTMLInputElement>("input[name='order']");
    if (orderInput) form.order = orderInput.value;
    const order = Number(form.order.trim());
    if (!form.phaseId) return;
    if (!Number.isInteger(order) || order < 1) {
      this.#planError = t("tournament.planOrderInvalid");
      this.renderView();
      return;
    }
    await this.runPlanChange(eventId, form, (api) => api.scheduleMatch(form.matchId, { scheduledPhaseId: form.phaseId, order }));
  }

  private async unschedulePlannedMatch(): Promise<void> {
    const form = this.#planForm;
    const eventId = this.#event?.id;
    if (!form || !eventId || form.pool || this.#planSaving) return;
    await this.runPlanChange(eventId, form, (api) => api.unscheduleMatch(form.matchId));
  }

  private async runPlanChange(eventId: string, form: PlanFormState, change: (api: ReturnType<typeof createApiClient>) => Promise<unknown>): Promise<void> {
    this.#planSaving = true;
    this.#planError = null;
    this.renderView();
    const current = () => this.#planForm === form && this.#event?.id === eventId;
    try {
      const api = createApiClient();
      await change(api);
      const refreshed = await api.getEvent(eventId);
      if (current()) {
        this.#event = refreshed;
        this.#planForm = null;
      }
    } catch (error) {
      if (current()) this.#planError = error instanceof Error ? error.message : t("tournament.planSaveError");
    } finally {
      this.#planSaving = false;
      this.renderView();
    }
  }

  private renderPlanForm(): string {
    const form = this.#planForm;
    const event = this.#event;
    const found = form ? this.findMatch(form.matchId) : null;
    if (!form || !event || !found) return "";
    const disabled = this.#planSaving ? "disabled" : "";
    const error = this.#planError ? `<p class="form-error" role="alert">${escapeHtml(this.#planError)}</p>` : "";
    const cancel = `<button type="button" class="btn-secondary" data-action="cancel-plan" ${disabled}>${t("tournament.cancelStage")}</button>`;
    if (form.pool) {
      const phase = poolPhaseFor(event, found.stage, found.match, found.round);
      if (!phase) {
        return `<form data-form="plan-match" class="plan-form">
            <p class="plan-hint">${t("tournament.planPoolNeedsSchedule")}</p>
            <div class="form-actions">${cancel}</div>
          </form>`;
      }
      return `<form data-form="plan-match" class="plan-form" novalidate>
          <p class="plan-phase">${t("tournament.planPoolPhase", { phase: escapeHtml(phase.label) })}</p>
          <label>${t("tournament.planOrder")}
            <input name="order" type="number" inputmode="numeric" min="1" step="1" value="${escapeHtml(form.order)}" ${disabled} />
          </label>
          ${error}
          <div class="form-actions">
            <button type="submit" class="btn-primary" ${disabled}>${t("tournament.planSave")}</button>
            ${cancel}
          </div>
        </form>`;
    }
    const options = stagePhaseOptions(event, found.stage.id);
    if (options.length === 0) {
      return `<form data-form="plan-match" class="plan-form">
          <p class="plan-hint">${t("tournament.planBracketNeedsSchedule")}</p>
          <div class="form-actions">${cancel}</div>
        </form>`;
    }
    return `<form data-form="plan-match" class="plan-form" novalidate>
        <label>${t("tournament.planPhase")}
          <select name="scheduledPhaseId" ${disabled}>
            ${options.map((option) => `<option value="${escapeHtml(option.phaseId)}" ${option.phaseId === form.phaseId ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
        <label>${t("tournament.planOrder")}
          <input name="order" type="number" inputmode="numeric" min="1" step="1" value="${escapeHtml(form.order)}" ${disabled} />
        </label>
        ${error}
        <div class="form-actions">
          <button type="submit" class="btn-primary" ${disabled}>${t("tournament.planSave")}</button>
          ${found.match.scheduledMatch ? `<button type="button" class="btn-secondary" data-action="unschedule-match" ${disabled}>${t("tournament.planUnschedule")}</button>` : ""}
          ${cancel}
        </div>
      </form>`;
  }

  private async fillBracket(stageId: string): Promise<void> {
    const tournamentId = this.#tournamentId;
    const eventId = this.#event?.id;
    if (!tournamentId || !eventId || this.#fillingBracket) return;
    this.#fillingBracket = true;
    this.#stageError = null;
    this.renderView();
    const current = () => this.#tournamentId === tournamentId && this.#event?.id === eventId;
    try {
      const api = createApiClient();
      await api.fillBracket(stageId);
      const refreshed = await api.getEvent(eventId);
      if (current()) this.#event = refreshed;
    } catch (error) {
      if (current()) this.#stageError = error instanceof Error ? error.message : t("tournament.bracketFillError");
    } finally {
      this.#fillingBracket = false;
      this.renderView();
    }
  }

  private openStageForm(stage: ApiStage | null): void {
    if (this.#savingStage) return;
    const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));
    this.#stageForm = stage
      ? {
          mode: "edit",
          stageId: stage.id,
          type: stage.type,
          name: stage.name ?? "",
          rulesetId: stage.ruleset?.id ?? "",
          minPoolSize: text(stage.minPoolSize),
          maxPoolSize: text(stage.maxPoolSize),
          preferredPoolSize: text(stage.preferredPoolSize),
          eliminationParticipantCount: text(stage.eliminationParticipantCount),
          timeBetweenMatchesMinutes: text(stage.timeBetweenMatchesMinutes),
        }
      : {
          mode: "create",
          stageId: null,
          type: "POOL",
          name: "",
          rulesetId: "",
          minPoolSize: "",
          maxPoolSize: "",
          preferredPoolSize: "",
          eliminationParticipantCount: "",
          timeBetweenMatchesMinutes: "",
        };
    this.#stageFormError = null;
    this.renderView();
    this.root.querySelector<HTMLInputElement>("form.stage-form input[name='name']")?.focus();
  }

  private updateStageFormField(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
    const form = this.#stageForm;
    if (!form) return;
    if (input.name === "type" && (input.value === "POOL" || input.value === "ELIMINATION" || input.value === "SEMI_FINAL" || input.value === "BRONZE_FINAL" || input.value === "FINAL")) {
      form.type = input.value;
    } else if ((STAGE_FORM_FIELDS as readonly string[]).includes(input.name)) {
      form[input.name as (typeof STAGE_FORM_FIELDS)[number]] = input.value;
    }
  }

  /** The request body for the form, or a message saying what to fix. Empty number fields leave the server's default. */
  private stageFormBody(form: StageFormState): { body: Record<string, unknown> } | { error: string } {
    const number = (value: string, minimum: number): number | null | "invalid" => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      return Number.isInteger(parsed) && parsed >= minimum ? parsed : "invalid";
    };
    const body: Record<string, unknown> = {
      type: form.type,
      name: form.name.trim() || null,
      rulesetId: form.rulesetId || null,
    };
    if (form.type === "POOL") {
      const min = number(form.minPoolSize, 1);
      const max = number(form.maxPoolSize, 1);
      const preferred = number(form.preferredPoolSize, 1);
      if (min === "invalid" || max === "invalid" || preferred === "invalid") return { error: t("tournament.stageSizeWholeNumber") };
      const effectiveMin = min ?? 4;
      const effectiveMax = max ?? 6;
      const effectivePreferred = preferred ?? 5;
      if (effectiveMin > effectiveMax) return { error: t("tournament.stageMinAboveMax") };
      if (effectivePreferred < effectiveMin || effectivePreferred > effectiveMax) return { error: t("tournament.stagePreferredOutside") };
      body.minPoolSize = min;
      body.maxPoolSize = max;
      body.preferredPoolSize = preferred;
    } else if (form.type === "ELIMINATION") {
      const count = number(form.eliminationParticipantCount, 2);
      if (count === "invalid") return { error: t("tournament.stageEliminationCountInvalid") };
      body.eliminationParticipantCount = count;
    }
    const minutes = number(form.timeBetweenMatchesMinutes, 1);
    if (minutes === "invalid") return { error: t("tournament.stageMinutesInvalid") };
    body.timeBetweenMatchesMinutes = minutes;
    return { body };
  }

  private async submitStageForm(element: HTMLFormElement): Promise<void> {
    // Read the fields as they are now: values set without an input event (autofill) count too.
    element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]").forEach((input) => this.updateStageFormField(input));
    const form = this.#stageForm;
    const tournamentId = this.#tournamentId;
    const eventId = this.#event?.id;
    if (!form || !tournamentId || !eventId || this.#savingStage) return;
    const result = this.stageFormBody(form);
    if ("error" in result) {
      this.#stageFormError = result.error;
      this.renderView();
      return;
    }
    this.#savingStage = true;
    this.#stageFormError = null;
    this.renderView();
    const current = () => this.#tournamentId === tournamentId && this.#stageForm === form;
    try {
      const api = createApiClient();
      if (form.mode === "create") {
        await api.createStage({ tournamentId, ...result.body } as Parameters<typeof api.createStage>[0]);
      } else {
        await api.updateStage(form.stageId!, result.body as Parameters<typeof api.updateStage>[1]);
      }
      const refreshed = await api.getEvent(eventId);
      if (current()) {
        this.#event = refreshed;
        this.#stageForm = null;
      }
    } catch (error) {
      if (current()) {
        this.#stageFormError = error instanceof Error ? error.message : t(form.mode === "create" ? "tournament.createStageError" : "tournament.saveStageError");
      }
    } finally {
      this.#savingStage = false;
      this.renderView();
    }
  }

  private renderStageForm(tournament: ApiTournament): string {
    const form = this.#stageForm;
    if (!form) return "";
    const event = this.#event!;
    const disabled = this.#savingStage ? "disabled" : "";
    const inheritedName = tournament.ruleset?.name ?? event.ruleset?.name ?? null;
    const inherited = inheritedName ? t("tournament.stageRulesetInherit", { name: inheritedName }) : t("tournament.rulesetNone");
    const typeOption = (value: StageType, key: string) =>
      `<option value="${value}" ${form.type === value ? "selected" : ""}>${t(key as never)}</option>`;
    const numberField = (name: string, label: string, value: string, placeholder: string, minimum = 1) => `
      <label>${label}
        <input name="${name}" type="number" inputmode="numeric" min="${minimum}" step="1" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${disabled} />
      </label>`;
    return `
      <form data-form="${form.mode === "create" ? "add-stage" : "edit-stage"}" class="stage-form" novalidate>
        <h3>${t(form.mode === "create" ? "tournament.stageFormCreate" : "tournament.stageFormEdit")}</h3>
        <div class="stage-form-grid">
          <label>${t("tournament.stageName")}
            <input name="name" maxlength="120" value="${escapeHtml(form.name)}" ${disabled} />
          </label>
          <label>${t("tournament.stageType")}
            <select name="type" ${disabled}>
              ${typeOption("POOL", "tournament.stageTypePool")}
              ${typeOption("ELIMINATION", "tournament.stageTypeElimination")}
              ${typeOption("SEMI_FINAL", "tournament.stageTypeSemiFinal")}
              ${typeOption("BRONZE_FINAL", "tournament.stageTypeBronzeFinal")}
              ${typeOption("FINAL", "tournament.stageTypeFinal")}
            </select>
          </label>
          <label>${t("tournament.rulesetLabel")}
            <select name="rulesetId" ${disabled}>
              <option value="" ${form.rulesetId === "" ? "selected" : ""}>${escapeHtml(inherited)}</option>
              ${(event.rulesets ?? [])
                .map((ruleset) => `<option value="${escapeHtml(ruleset.id)}" ${ruleset.id === form.rulesetId ? "selected" : ""}>${escapeHtml(ruleset.name)}</option>`)
                .join("")}
            </select>
          </label>
          ${numberField("timeBetweenMatchesMinutes", t("tournament.stageMinutesBetween"), form.timeBetweenMatchesMinutes, "2")}
        </div>
        ${
          form.type === "POOL"
            ? `<fieldset class="stage-form-grid pool-fields">
                <legend>${t("tournament.stagePoolSizes")}</legend>
                ${numberField("minPoolSize", t("tournament.minPoolSize"), form.minPoolSize, "4")}
                ${numberField("preferredPoolSize", t("tournament.preferredPoolSize"), form.preferredPoolSize, "5")}
                ${numberField("maxPoolSize", t("tournament.maxPoolSize"), form.maxPoolSize, "6")}
              </fieldset>`
            : form.type === "ELIMINATION"
              ? `<div class="stage-form-grid elimination-fields">
                  ${numberField("eliminationParticipantCount", t("tournament.stageEliminationCount"), form.eliminationParticipantCount, t("tournament.stageEliminationCountAuto"), 2)}
                </div>`
              : ""
        }
        ${this.#stageFormError ? `<p class="form-error" role="alert">${escapeHtml(this.#stageFormError)}</p>` : ""}
        <div class="form-actions">
          <button type="submit" class="btn-primary" ${disabled}>${t(form.mode === "create" ? "tournament.createStage" : "tournament.saveStage")}</button>
          <button type="button" class="btn-secondary" data-action="cancel-stage-form" ${disabled}>${t("tournament.cancelStage")}</button>
        </div>
      </form>`;
  }

  private async deleteStage(stageId: string): Promise<void> {
    const tournamentId = this.#tournamentId;
    if (!tournamentId) return;

    this.#deletingStageId = stageId;
    this.#stageError = null;
    this.renderView();

    const current = () => this.#tournamentId === tournamentId;
    try {
      const api = createApiClient();
      await api.deleteStage(stageId);
      if (current()) {
        const refreshed = await api.getEvent(this.#event!.id);
        this.#event = refreshed;
        if (this.#selectedStageId === stageId) {
          this.#selectedStageId = null;
        }
      }
    } catch (error) {
      if (current()) {
        this.#stageError = error instanceof Error ? error.message : t("tournament.deleteStageError");
      }
    } finally {
      this.#deletingStageId = null;
      this.renderView();
    }
  }

  private async makeActiveStage(stageId: string): Promise<void> {
    const tournamentId = this.#tournamentId;
    if (!tournamentId) return;

    this.#stageError = null;
    this.renderView();

    const current = () => this.#tournamentId === tournamentId;
    try {
      const api = createApiClient();
      await api.updateTournament(tournamentId, { currentStageId: stageId });
      if (current()) {
        const refreshed = await api.getEvent(this.#event!.id);
        this.#event = refreshed;
        this.#selectedStageId = stageId;
      }
    } catch (error) {
      if (current()) {
        this.#stageError = error instanceof Error ? error.message : t("tournament.makeActiveStageError");
      }
    } finally {
      this.renderView();
    }
  }

  private renderTournamentForm(tournament: ApiTournament, event: ApiEvent): string {
    const disabled = this.#savingTournament ? "disabled" : "";
    const rulesets = event.rulesets ?? [];
    const current = tournament.ruleset?.id ?? "";
    const inherited = event.ruleset?.name
      ? t("tournament.rulesetUseEvent", { name: event.ruleset.name })
      : t("tournament.rulesetNone");
    return `
      <form data-form="edit-tournament" class="tournament-form">
        <h2>${t("tournament.editTitle")}</h2>
        <label>${t("tournament.nameLabel")}
          <input name="name" required maxlength="120" value="${escapeHtml(tournament.name)}" ${disabled} />
        </label>
        <label>${t("tournament.rulesetLabel")}
          <select name="rulesetId" ${disabled}>
            <option value="" ${current === "" ? "selected" : ""}>${escapeHtml(inherited)}</option>
            ${rulesets
              .map((ruleset) => `<option value="${escapeHtml(ruleset.id)}" ${ruleset.id === current ? "selected" : ""}>${escapeHtml(ruleset.name)}</option>`)
              .join("")}
          </select>
        </label>
        ${this.#tournamentError ? `<p class="form-error" role="alert">${escapeHtml(this.#tournamentError)}</p>` : ""}
        <div class="form-actions">
          <button type="submit" class="btn-primary" ${disabled}>${t("tournament.saveTournament")}</button>
          <button type="button" class="btn-secondary" data-action="cancel-edit-tournament" ${disabled}>${t("tournament.cancelParticipant")}</button>
        </div>
      </form>`;
  }

  private async saveTournament(form: HTMLFormElement): Promise<void> {
    const tournamentId = this.#tournamentId;
    const eventId = this.#event?.id;
    if (!tournamentId || !eventId || this.#savingTournament) return;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const rulesetId = String(data.get("rulesetId") ?? "") || null;
    if (!name) return;
    this.#savingTournament = true;
    this.#tournamentError = null;
    this.renderView();
    const current = () => this.#tournamentId === tournamentId && this.#event?.id === eventId;
    try {
      const api = createApiClient();
      await api.updateTournament(tournamentId, { name, rulesetId });
      const refreshed = await api.getEvent(eventId);
      if (current()) {
        this.#event = refreshed;
        this.#showEditTournament = false;
        // The shell shows the tournament's name in its breadcrumb.
        this.dispatchEvent(new CustomEvent("event-refreshed", { bubbles: true, composed: true, detail: { event: refreshed } }));
      }
    } catch (error) {
      if (current()) {
        this.#tournamentError = error instanceof Error ? error.message : t("tournament.saveTournamentError");
      }
    } finally {
      this.#savingTournament = false;
      this.renderView();
    }
  }

  private currentTournament(): ApiTournament | null {
    return this.#event?.tournaments?.find((t) => t.id === this.#tournamentId) ?? null;
  }

  private renderView(): void {
    if (this.#loading) {
      this.render(css, `<div class="tournament-loading">${t("tournament.loading")}</div>`);
      return;
    }

    if (this.#error) {
      this.render(css, `<div class="tournament-error">${escapeHtml(this.#error)}</div>`);
      return;
    }

    const tournament = this.currentTournament();
    if (!tournament) {
      this.render(css, `<div class="tournament-not-found">${t("tournament.notFound")}</div>`);
      return;
    }

    const event = this.#event!;
    const rulesetName = tournament.ruleset?.name ?? event.ruleset?.name ?? null;
    const isInherited = !tournament.ruleset && !!event.ruleset;

    const rulesetLabel = rulesetName
      ? isInherited
        ? t("tournament.rulesetInherited", { name: rulesetName })
        : t("tournament.rulesetOverride", { name: rulesetName })
      : t("tournament.noRuleset");

    const participantsCount = tournament.entries?.length ?? 0;
    const stagesCount = tournament.stages?.length ?? 0;
    const activeStage = tournament.stages?.find((s: ApiStage) => s.id === tournament.currentStageId);

    const tabNames: TournamentTab[] = ["overview", "participants", "stages", "officials", "access", "live"];

    this.render(
      css,
      `
      <div class="tournament-workspace">
        <header class="tournament-header">
          <div class="header-meta">
            <h1 class="tournament-title">${escapeHtml(tournament.name)}</h1>
            <div class="badges-row">
              <span class="badge ruleset-badge">${escapeHtml(rulesetLabel)}</span>
              <span class="badge participant-badge">
                ${participantsCount === 1 ? t("events.participantsOne") : t("events.participants", { count: participantsCount })}
              </span>
              <span class="badge stage-badge">
                ${stagesCount === 1 ? t("events.stagesOne") : t("events.stages", { count: stagesCount })}
              </span>
              ${
                activeStage
                  ? `<span class="badge active-stage-badge">${escapeHtml(activeStage.name ?? "")}</span>`
                  : ""
              }
            </div>
          </div>
          <div class="header-actions">
            <button type="button" class="btn-secondary" data-action="edit-tournament" ${this.#showEditTournament ? "disabled" : ""}>
              ${t("tournament.edit")}
            </button>
          </div>
        </header>
        ${this.#showEditTournament ? this.renderTournamentForm(tournament, event) : ""}

        <nav class="nav-tabs" aria-label="Tournament navigation">
          ${tabNames
            .map(
              (tab) => `
            <button
              type="button"
              class="nav-tab ${this.#activeTab === tab ? "active" : ""}"
              data-tab="${tab}"
            >
              ${t(`tournament.tabs.${tab}` as any)}
            </button>
          `,
            )
            .join("")}
        </nav>

        <main class="tab-pane">
          ${this.renderTabContent(tournament, activeStage)}
        </main>
      </div>
    `,
    );
    this.hydratePoolResults(tournament);
  }

  private closePoolResultsFullscreen(): void {
    this.#poolResultsFullscreen = false;
    this.renderView();
    this.root.querySelector<HTMLButtonElement>("[data-action='open-pool-results-fullscreen']")?.focus();
  }

  /** `<pool-results>` gets its data as properties, so it is filled after each render. */
  private hydratePoolResults(tournament: ApiTournament): void {
    const event = this.#event;
    const stages = tournament.stages ?? [];
    const stage =
      stages.find((item) => item.id === this.#selectedStageId) ?? stages.find((item) => item.id === tournament.currentStageId) ?? stages[0];
    if (!event || !stage) return;
    this.root.querySelectorAll<PoolResults>("pool-results").forEach((element) => element.setData(event, stage, tournament));
  }

  private renderTabContent(tournament: ApiTournament, activeStage?: ApiStage): string {
    switch (this.#activeTab) {
      case "overview":
        return this.renderOverviewTab(tournament, activeStage);
      case "participants":
        return this.renderParticipantsTab(tournament);
      case "stages":
        return this.renderStagesTab(tournament);
      case "officials":
        return this.renderOfficialsTab(tournament);
      case "access":
        return this.renderAccessTab(tournament);
      case "live":
        return this.renderLiveTab(tournament);
    }
  }

  private renderOverviewTab(tournament: ApiTournament, _activeStage?: ApiStage): string {
    const entries = tournament.entries ?? [];
    const fighters = entries.filter((entry) => entry.kind !== "VOLUNTEER").length;
    const volunteers = entries.filter((entry) => entry.kind !== "FIGHTER").length;
    const stages = orderStages(tournament.stages ?? []);
    const event = this.#event!;
    const rulesetName = tournament.ruleset?.name ?? event.ruleset?.name ?? null;
    return `
      <div class="tab-content-overview">
        ${this.renderNextStep(tournament)}
        <dl class="overview-facts">
          <div>
            <dt>${t("tournament.factsParticipants")}</dt>
            <dd>
              ${fighters === 1 ? t("tournament.factsFightersOne") : t("tournament.factsFighters", { count: fighters })}
              · ${t("tournament.factsVolunteers", { count: volunteers })}
              <button type="button" class="btn-link" data-action="view-participants">${t("tournament.factsOpenParticipants")}</button>
            </dd>
          </div>
          <div>
            <dt>${t("tournament.factsStages")}</dt>
            <dd>${stages.length ? stages.map((stage) => escapeHtml(this.stageName(stage))).join(" → ") : t("tournament.noStages")}</dd>
          </div>
          <div>
            <dt>${t("tournament.rulesetLabel")}</dt>
            <dd>${rulesetName ? escapeHtml(rulesetName) : t("tournament.rulesetNone")}</dd>
          </div>
        </dl>
      </div>
    `;
  }

  /** What the tournament admin should do now, worked out from the stages and their matches. */
  private renderNextStep(tournament: ApiTournament): string {
    const stages = orderStages(tournament.stages ?? []);
    const current = stages.find((stage) => stage.id === tournament.currentStageId);
    const box = (text: string, action?: { name: string; label: string }) => `
      <section class="next-step" aria-labelledby="next-step-title">
        <h3 id="next-step-title">${t("tournament.nextStepTitle")}</h3>
        <p>${text}</p>
        ${action ? `<button type="button" class="btn-primary" data-action="${action.name}">${action.label}</button>` : ""}
      </section>`;
    if (stages.length === 0) {
      return box(t("tournament.nextAddStage"), { name: "go-stages", label: t("tournament.openStages") });
    }
    if (!current) {
      return box(t("tournament.nextChooseStage"), { name: "go-stages", label: t("tournament.openStages") });
    }
    const name = escapeHtml(this.stageName(current));
    const matches = (current.rounds ?? []).flatMap((round) => round.matches ?? []);
    if (matches.length === 0) {
      return current.type === "POOL"
        ? box(t("tournament.nextSchedulePools", { stage: name }), { name: "open-planning", label: t("tournament.openPlanning") })
        : box(t("tournament.nextNoMatches", { stage: name }), { name: "go-stages", label: t("tournament.openStages") });
    }
    const played = matches.filter(matchPlayed).length;
    if (played < matches.length) {
      return box(t("tournament.nextProgress", { played, total: matches.length, stage: name }), { name: "go-live", label: t("tournament.openLive") });
    }
    const following = nextStage(stages, current.id);
    return following
      ? box(t("tournament.nextMoveOn", { stage: name, next: escapeHtml(this.stageName(following)) }), { name: "go-stages", label: t("tournament.openStages") })
      : box(t("tournament.nextFinished"));
  }

  private stageName(stage: Pick<ApiStage, "name">): string {
    return stage.name ?? t("tournament.unnamedStage");
  }

  private stageTypeLabel(type: StageType): string {
    const keys: Record<string, string> = {
      POOL: "tournament.stageTypePool",
      ELIMINATION: "tournament.stageTypeElimination",
      SEMI_FINAL: "tournament.stageTypeSemiFinal",
      BRONZE_FINAL: "tournament.stageTypeBronzeFinal",
      FINAL: "tournament.stageTypeFinal",
    };
    return keys[type] ? t(keys[type] as never) : type;
  }

  #renderEditEntryForm(): string {
    if (!this.#editEntry) return "";
    const editing = this.#editEntry;
    const disabled = this.#savingEntry ? "disabled" : "";
    const kindOptions = (["FIGHTER", "VOLUNTEER", "BOTH"] as const)
      .map((kind) => `<option value="${kind}" ${editing.kind === kind ? "selected" : ""}>${t(`tournament.kind.${kind}`)}</option>`)
      .join("");
    const tournamentOptions = (this.#event?.tournaments ?? [])
      .map((item) => `<option value="${escapeHtml(item.id)}" ${editing.tournamentId === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`)
      .join("");
    const volunteerFlags = (["judgeVolunteer", "juryVolunteer", "tableVolunteer", "otherVolunteer"] as const)
      .map((flag) => `<label class="flag-option"><input type="checkbox" name="${flag}" ${editing[flag] ? "checked" : ""} ${disabled} /> ${t(`tournament.volunteer.${flag}`)}</label>`)
      .join("");
    return `<form data-form="edit-entry">
      <label>${t("tournament.entryName")} <input name="username" value="${escapeHtml(editing.username)}" required ${disabled} /></label>
      <label>${t("tournament.entryTournament")} <select name="tournamentId" ${disabled}>${tournamentOptions}</select></label>
      <label>${t("tournament.entryKind")} <select name="kind" ${disabled}>${kindOptions}</select></label>
      <label>${t("tournament.entrySeed")} <input name="seed" type="number" min="0" step="1" value="${escapeHtml(editing.seed)}" ${disabled} /></label>
      <fieldset class="person-editor-section">
        <legend>${t("tournament.volunteerPreferences")}</legend>
        ${volunteerFlags}
      </fieldset>
      <fieldset class="person-editor-section">
        <legend>${t("tournament.skills")}</legend>
        ${this.#renderSkillRating("judgeSkill", editing.judgeSkill, t("tournament.volunteer.judgeVolunteer"), disabled)}
        ${this.#renderSkillRating("jurySkill", editing.jurySkill, t("tournament.volunteer.juryVolunteer"), disabled)}
      </fieldset>
      <p class="person-editor-scope-note" data-scope-note>${t("tournament.personSharedScope")}</p>
      <button type="submit" ${disabled}>${t("tournament.saveParticipant")}</button>
      <button type="button" data-action="cancel-edit-entry" ${disabled}>${t("tournament.cancelParticipant")}</button>
    </form>`;
  }

  #renderSkillRating(name: string, selected: string, label: string, disabled: string): string {
    const levels = [0, 1, 2, 3, 4, 5];
    const options = levels
      .map((level) => `<label class="skill-level"><input type="radio" name="${name}" value="${level}" ${selected === level.toString() ? "checked" : ""} ${disabled} /> ${level}</label>`)
      .join("");
    return `<span class="skill-rating-line">${escapeHtml(label)}: ${options}</span>`;
  }

  private renderParticipantsTab(tournament: ApiTournament): string {
    const entries = tournament.entries ?? [];

    return `
      <div class="tab-content-participants">
        ${this.#entryError ? `<p role="alert">${escapeHtml(this.#entryError)}</p>` : ""}
        ${this.#renderEditEntryForm()}
        ${this.#showBulk ? `<form data-form="add-bulk"><label>${t("tournament.bulkNames")} <textarea name="usernames" required ${this.#addingEntry ? "disabled" : ""}>${escapeHtml(this.#bulkNames)}</textarea></label><label class="flag-option"><input type="checkbox" name="alsoVolunteer" ${this.#addingEntry ? "disabled" : ""} /> ${t("tournament.alsoVolunteer")}</label><button type="submit" ${this.#addingEntry ? "disabled" : ""}>${t("tournament.addBulk")}</button><button type="button" data-action="cancel-bulk" ${this.#addingEntry ? "disabled" : ""}>${t("tournament.cancelParticipant")}</button></form>` : ""}
        ${this.#showAddParticipant ? `<form data-form="add-participant"><label>${t("tournament.participantName")} <input name="username" value="${escapeHtml(this.#participantName)}" required /></label><label class="flag-option"><input type="checkbox" name="alsoVolunteer" ${this.#addingEntry ? "disabled" : ""} /> ${t("tournament.alsoVolunteer")}</label><button type="submit" ${this.#addingEntry ? "disabled" : ""}>${t("tournament.addParticipant")}</button><button type="button" data-action="cancel-add-participant" ${this.#addingEntry ? "disabled" : ""}>${t("tournament.cancelParticipant")}</button></form>` : ""}
        <div class="table-header-actions">
          <h3>${t("tournament.tabs.participants")}</h3>
          <div class="header-actions">
            <button type="button" class="btn-primary" data-action="add-participant">
              ${t("tournament.addParticipant")}
            </button>
            <button type="button" class="btn-secondary" data-action="add-bulk">
              ${t("tournament.addBulk")}
            </button>
          </div>
        </div>

        ${
          entries.length === 0
            ? `<div class="empty-state">${t("tournament.noParticipants")}</div>`
            : `
          <table class="entries-table">
            <thead>
              <tr>
                <th>${t("tournament.entrySeed")}</th>
                <th>${t("tournament.participantName")}</th>
                <th>${t("tournament.role")}</th>
                <th>${t("tournament.actions")}</th>
              </tr>
            </thead>
            <tbody>
              ${entries
                .map(
                  (entry) => `
                <tr class="entry-row" data-entry-id="${entry.id}">
                  <td>${entry.seed ?? "—"}</td>
                  <td>${escapeHtml(entry.user?.username ?? entry.id)}</td>
                  <td><span class="badge">${entry.kind}</span></td>
                  <td>
                    <button type="button" class="btn-secondary" data-action="edit-entry" data-id="${escapeHtml(entry.id)}" ${this.#savingEntry ? "disabled" : ""}>${t("tournament.editParticipant")}</button>
                    <button type="button" class="btn-secondary" data-action="delete-entry" data-id="${escapeHtml(entry.id)}" ${this.#deletingEntry ? "disabled" : ""}>
                      ${t("tournament.deleteParticipant")}
                    </button>
                  </td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        `
        }
      </div>
    `;
  }

  private renderStagesTab(tournament: ApiTournament): string {
    const stages = orderStages(tournament.stages ?? []);
    const currentStageId = tournament.currentStageId ?? null;
    const selectedStage =
      stages.find((stage) => stage.id === this.#selectedStageId) ?? stages.find((stage) => stage.id === currentStageId) ?? stages[0];
    return `
      <div class="tab-content-stages stages-tab">
        <div class="table-header-actions">
          <h3>${t("tournament.tabs.stages")}</h3>
          <button type="button" class="btn-primary" data-action="add-stage">${t("tournament.addStage")}</button>
        </div>
        ${this.renderStageForm(tournament)}
        ${
          stages.length === 0 || !selectedStage
            ? `<div class="empty-state">${t("tournament.noStages")}</div>`
            : `${this.renderStagePath(stages, currentStageId, selectedStage.id)}
               ${this.renderStagePage(stages, selectedStage, tournament, currentStageId)}`
        }
      </div>
    `;
  }

  /** The stages in fighting order, each marked done, current or still to come. */
  private renderStagePath(stages: ApiStage[], currentStageId: string | null, selectedId: string): string {
    const currentIndex = stages.findIndex((stage) => stage.id === currentStageId);
    const stateLabels = { done: t("tournament.stageStateDone"), current: t("tournament.stageStateCurrent"), upcoming: t("tournament.stageStateUpcoming") };
    return `
      <ol class="stage-path" aria-label="${escapeHtml(t("tournament.stagePathLabel"))}">
        ${stages
          .map((stage, index) => {
            const state = currentIndex === -1 || index > currentIndex ? "upcoming" : index === currentIndex ? "current" : "done";
            const matches = (stage.rounds ?? []).flatMap((round) => round.matches ?? []);
            const played = matches.filter(matchPlayed).length;
            const selected = stage.id === selectedId;
            return `
              <li class="stage-path-item is-${state} ${selected ? "selected" : ""}" data-state="${state}">
                <button type="button" class="stage-path-step" data-stage-id="${escapeHtml(stage.id)}" ${selected ? 'aria-current="true"' : ""}>
                  <span class="stage-path-type">${this.stageTypeLabel(stage.type)}</span>
                  <span class="stage-path-name">${escapeHtml(this.stageName(stage))}</span>
                  <span class="stage-path-meta">${stateLabels[state]}${matches.length ? ` · ${played}/${matches.length}` : ""}</span>
                </button>
              </li>`;
          })
          .join("")}
      </ol>`;
  }

  /** One page per stage: what it is, where it is fought and its matches, without sub-tabs. */
  private renderStagePage(stages: ApiStage[], stage: ApiStage, tournament: ApiTournament, currentStageId: string | null): string {
    const busy = this.#deletingStageId === stage.id || this.#stageForm?.stageId === stage.id ? "disabled" : "";
    return `
      <section class="stage-page" aria-labelledby="stage-page-title">
        <header class="stage-page-header">
          <div>
            <h3 id="stage-page-title">${escapeHtml(this.stageName(stage))}</h3>
            <span class="badge">${this.stageTypeLabel(stage.type)}</span>
            ${stage.id === currentStageId ? `<span class="badge active-stage-badge">${t("tournament.activeStage")}</span>` : ""}
          </div>
          <div class="stage-page-actions">
            ${
              stage.type === "ELIMINATION"
                ? (() => {
                    const filled = (stage.rounds ?? []).some((round) => (round.matches ?? []).length > 0);
                    return `<button type="button" class="${filled ? "btn-secondary" : "btn-primary"}" data-action="fill-bracket" data-stage-id="${escapeHtml(stage.id)}" data-filled="${filled}" ${this.#fillingBracket ? "disabled" : ""}>${t(filled ? "tournament.bracketRefill" : "tournament.bracketFill")}</button>`;
                  })()
                : ""
            }
            ${this.renderStageProgression(stages, stage, currentStageId)}
            <button type="button" class="btn-secondary" data-action="edit-stage" data-stage-id="${escapeHtml(stage.id)}" ${busy}>${t("tournament.editStage")}</button>
            <button type="button" class="btn-secondary" data-action="delete-stage" data-stage-id="${escapeHtml(stage.id)}" data-stage-name="${escapeHtml(this.stageName(stage))}" ${this.#deletingStageId === stage.id ? "disabled" : ""}>${t("tournament.deleteStage")}</button>
          </div>
        </header>
        ${this.#stageError ? `<p class="form-error stage-page-error" role="alert">${escapeHtml(this.#stageError)}</p>` : ""}
        ${this.renderStageSummary(stage, tournament)}
        ${this.renderStageSection("arenas", stage, tournament)}
        ${this.renderStageSection("officials", stage, tournament)}
        ${stage.type === "POOL" ? this.renderStageSection("pool-results", stage, tournament) : ""}
        ${this.renderStageRounds(stage, tournament)}
        ${this.renderStageMatches(stage, tournament)}
      </section>`;
  }

  private renderStageSummary(stage: ApiStage, tournament: ApiTournament): string {
    const event = this.#event!;
    const inherited = tournament.ruleset?.name ?? event.ruleset?.name ?? null;
    const ruleset = stage.ruleset?.name ?? (inherited ? t("tournament.stageRulesetInherit", { name: inherited }) : t("tournament.rulesetNone"));
    const sizes =
      stage.type === "POOL"
        ? `<div><dt>${t("tournament.stagePoolSizes")}</dt><dd>${t("tournament.summaryPoolSizes", {
            min: stage.minPoolSize ?? 4,
            max: stage.maxPoolSize ?? 6,
            preferred: stage.preferredPoolSize ?? 5,
          })}</dd></div>`
        : stage.type === "ELIMINATION"
          ? `<div><dt>${t("tournament.summaryBracket")}</dt><dd>${
              stage.eliminationParticipantCount
                ? t("tournament.summaryBracketCount", { count: stage.eliminationParticipantCount })
                : t("tournament.stageEliminationCountAuto")
            }</dd></div>`
          : "";
    return `
      <dl class="stage-summary">
        <div><dt>${t("tournament.rulesetLabel")}</dt><dd>${escapeHtml(ruleset)}</dd></div>
        ${sizes}
        <div><dt>${t("tournament.summaryTiming")}</dt><dd>${t("tournament.summaryMinutes", { minutes: stage.timeBetweenMatchesMinutes })}</dd></div>
      </dl>`;
  }

  /** For the current stage: move on to the next one, or say it is the last; for another stage: make it current. */
  private renderStageProgression(stages: ApiStage[], stage: ApiStage, currentStageId: string | null): string {
    if (stage.id !== currentStageId) {
      return `<button type="button" class="btn-secondary" data-action="make-active-stage" data-stage-id="${escapeHtml(stage.id)}">
          ${t("tournament.makeActiveStage")}
        </button>`;
    }
    const next = nextStage(stages, stage.id);
    if (!next) {
      return `<span class="badge last-stage-badge">${t("tournament.lastStage")}</span>`;
    }
    const name = next.name ?? t("tournament.unnamedStage");
    return `<button type="button" class="btn-primary" data-action="next-stage" data-stage-id="${escapeHtml(next.id)}" data-stage-name="${escapeHtml(name)}">
        ${t("tournament.nextStage", { name: escapeHtml(name) })}
      </button>`;
  }

  private renderStageRounds(stage: ApiStage, _tournament: ApiTournament): string {
    const rounds = [...(stage.rounds ?? [])].sort((left, right) => left.roundNumber - right.roundNumber);
    const statusLabel = {
      empty: t("tournament.roundEmpty"),
      "not-started": t("tournament.roundNotStarted"),
      "in-progress": t("tournament.roundInProgress"),
      done: t("tournament.roundDone"),
    } as const;
    return `
      <div class="stage-rounds-pane stage-section">
        <div class="table-header-actions">
          <h4>${t("tournament.rounds")}</h4>
          <span class="badge">${rounds.length}</span>
        </div>
        ${
          rounds.length === 0
            ? `<p class="empty-state">${t("tournament.noRounds")}</p>`
            : `
              <table class="entries-table">
                <thead>
                  <tr>
                    <th>${t("tournament.round")}</th>
                    <th>${t("tournament.matchesPlayed")}</th>
                    <th>${t("tournament.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${rounds
                    .map((round) => {
                      const status = roundStatus(round);
                      const played = (round.matches ?? []).filter(matchPlayed).length;
                      return `
                        <tr>
                          <td>${round.roundNumber + 1}</td>
                          <td>${played} / ${round.matches?.length ?? 0}</td>
                          <td><span class="badge round-status round-status-${status}">${statusLabel[status]}</span></td>
                        </tr>`;
                    })
                    .join("")}
                </tbody>
              </table>
            `
        }
      </div>
    `;
  }

  private renderStageMatches(stage: ApiStage, tournament: ApiTournament): string {
    const rows = stageMatchRows(this.#event!, tournament, stage);
    const dash = "—";
    const groups: Array<{ arena: string; rows: typeof rows }> = [];
    for (const row of rows) {
      const arena = row.arena ?? t("tournament.noRingYet");
      const group = groups.find((item) => item.arena === arena);
      if (group) group.rows.push(row);
      else groups.push({ arena, rows: [row] });
    }
    // Rings in the Event's arena order; matches without a ring last.
    const arenaOrder = new Map((this.#event?.arenas ?? []).map((arena) => [arena.name, arena.order] as const));
    groups.sort((left, right) => (arenaOrder.get(left.arena) ?? Number.MAX_SAFE_INTEGER) - (arenaOrder.get(right.arena) ?? Number.MAX_SAFE_INTEGER));
    return `
      <div class="stage-matches-pane stage-section">
        <div class="table-header-actions">
          <h4>${t("tournament.matches")}</h4>
          <span class="badge">${rows.filter((row) => row.played).length} / ${rows.length}</span>
        </div>
        ${
          rows.length === 0
            ? `<p class="empty-state">${t("tournament.noMatches")}</p>`
            : groups
                .map(
                  (group) => `
              <section class="ring-group">
                <h5>${escapeHtml(group.arena)}</h5>
                <table class="entries-table matches-table">
                  <thead>
                    <tr>
                      <th>${t("tournament.round")}</th>
                      <th>${t("tournament.ringOrder")}</th>
                      <th>${t("tournament.fighterLeft")}</th>
                      <th>${t("tournament.fighterRight")}</th>
                      <th>${t("tournament.score")}</th>
                      <th>${t("tournament.winner")}</th>
                      <th><span class="visually-hidden">${t("tournament.planColumn")}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${group.rows
                      .map(
                        (row) => `
                          <tr class="${row.played ? "match-played" : "match-open"}">
                            <td>${row.roundNumber}</td>
                            <td ${row.slot ? `title="${escapeHtml(t("tournament.scheduledIn", { slot: row.slot }))}"` : ""}>${row.order ?? dash}</td>
                            <td>${escapeHtml(row.left ?? t("tournament.toBeDecided"))}</td>
                            <td>${escapeHtml(row.right ?? t("tournament.toBeDecided"))}</td>
                            <td class="score-cell">${escapeHtml(row.score ?? dash)}</td>
                            <td>${row.draw ? t("tournament.draw") : escapeHtml(row.winner ?? dash)}</td>
                            <td>${
                              row.played
                                ? ""
                                : `<button type="button" class="btn-secondary btn-small" data-action="plan-match" data-match-id="${escapeHtml(row.id)}" ${this.#planForm?.matchId === row.id ? "disabled" : ""}>${t("tournament.planMatch")}</button>`
                            }</td>
                          </tr>
                          ${this.#planForm?.matchId === row.id ? `<tr class="plan-row"><td colspan="7">${this.renderPlanForm()}</td></tr>` : ""}`,
                      )
                      .join("")}
                  </tbody>
                </table>
              </section>`,
                )
                .join("")
        }
      </div>
    `;
  }

  private renderStageSection(section: "arenas" | "officials" | "pool-results", stage: ApiStage, tournament: ApiTournament): string {
    switch (section) {
      case "arenas":
        return `
          <div class="stage-arenas-pane stage-section">
            <div class="table-header-actions">
              <h4>${t("tournament.arenas")}</h4>
              <span class="badge">${stage.arenas?.length ?? 0}</span>
            </div>
            ${
              stage.arenas?.length
                ? `<ul class="stage-arena-list">${[...stage.arenas]
                    .sort((left, right) => (left.arena?.order ?? 0) - (right.arena?.order ?? 0))
                    .map((item) => `<li>${escapeHtml(item.arena?.name ?? t("tournament.arena"))}</li>`)
                    .join("")}</ul>`
                : `<p class="empty-state">${t("tournament.noArenas")}</p>`
            }
            <p class="planning-note">${t("tournament.stageArenasFromPlanning")}</p>
            <button type="button" class="btn-secondary" data-action="open-planning">${t("tournament.openPlanning")}</button>
          </div>
        `;
      case "officials":
        return `
          <div class="stage-officials-pane stage-section">
            <div class="table-header-actions">
              <h4>${t("tournament.tabs.officials")}</h4>
              <span class="badge">${stage.officials?.length ?? 0}</span>
            </div>
            ${
              stage.officials?.length
                ? `<ul>${stage.officials
                    .map((official) => {
                      const entry = tournament.entries?.find((item) => item.id === official.entryId);
                      const name = entry?.user?.username ?? t("tournament.unknownPerson");
                      return `<li>${escapeHtml(name)} · ${t(`tournament.role.${official.role}` as never)}</li>`;
                    })
                    .join("")}</ul>`
                : `<p class="empty-state">${t("tournament.noOfficialsForStage")}</p>`
            }
          </div>
        `;
      case "pool-results":
        return `
          <div class="stage-pool-results-pane stage-section">
            <div class="table-header-actions">
              <h4>${t("tournament.poolResults")}</h4>
              <button type="button" class="btn-secondary" data-action="open-pool-results-fullscreen">${t("tournament.fullScreen")}</button>
            </div>
            <pool-results></pool-results>
          </div>
          ${
            this.#poolResultsFullscreen
              ? `<div class="pool-results-fullscreen" role="dialog" aria-modal="true" aria-label="${escapeHtml(t("tournament.poolResults"))}">
                  <div class="pool-results-fullscreen-header">
                    <h2>${escapeHtml(stage.name ?? t("tournament.poolResults"))}</h2>
                    <button type="button" class="btn-secondary" data-action="close-pool-results-fullscreen">${t("tournament.closeFullScreen")}</button>
                  </div>
                  <pool-results></pool-results>
                </div>`
              : ""
          }
        `;
    }
  }

  private renderOfficialsTab(tournament: ApiTournament): string {
    const stages = tournament.stages ?? [];
    const volunteerEntries = tournament.entries?.filter((e) => e.kind !== "FIGHTER") ?? [];

    return `
      <div class="tab-content-officials">
        <div class="table-header-actions">
          <h3>${t("tournament.tabs.officials")}</h3>
        </div>
        ${this.#officialsError ? `<p role="alert">${escapeHtml(this.#officialsError)}</p>` : ""}
        ${this.#renderAddOfficialForm(tournament, volunteerEntries)}
        ${stages.length === 0
          ? `<p class="empty-state">${t("tournament.noStagesForOfficials")}</p>`
          : `<div class="officials-list">
              ${stages
                .map((stage) => this.#renderStageOfficials(tournament, stage, volunteerEntries))
                .join("")}
            </div>`}
      </div>
    `;
  }

  #renderAddOfficialForm(tournament: ApiTournament, volunteerEntries: ApiEntry[]): string {
    if (!this.#showAddOfficial || !this.#officialStageId) return "";
    const stage = tournament.stages?.find((s) => s.id === this.#officialStageId);
    if (!stage) return "";

    const assignedEntryIds = new Set(stage.officials?.map((o) => o.entryId) ?? []);
    const availableEntries = volunteerEntries.filter((e) => !assignedEntryIds.has(e.id));

    const entryOptions = availableEntries.length > 0
      ? availableEntries.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.user?.username ?? e.id)}</option>`).join("")
      : `<option value="">${t("tournament.noAvailableOfficials")}</option>`;

    return `
      <form data-form="add-official" class="officials-form">
        <input type="hidden" name="stageId" value="${escapeHtml(this.#officialStageId)}" />
        <label>${t("tournament.officialEntry")}
          <select name="entryId" ${availableEntries.length === 0 ? "disabled" : ""}>
            ${entryOptions}
          </select>
        </label>
        <label>${t("tournament.officialRole")}
          <select name="role">
            <option value="JUDGE" ${this.#officialRole === "JUDGE" ? "selected" : ""}>${t("tournament.role.JUDGE")}</option>
            <option value="JURY" ${this.#officialRole === "JURY" ? "selected" : ""}>${t("tournament.role.JURY")}</option>
            <option value="TABLE" ${this.#officialRole === "TABLE" ? "selected" : ""}>${t("tournament.role.TABLE")}</option>
          </select>
        </label>
        <button type="submit" class="btn-primary" ${this.#addingOfficial || availableEntries.length === 0 ? "disabled" : ""}>
          ${t("tournament.addOfficial")}
        </button>
        <button type="button" class="btn-secondary" data-action="cancel-add-official" ${this.#addingOfficial ? "disabled" : ""}>
          ${t("tournament.cancelOfficial")}
        </button>
      </form>
    `;
  }

  #renderStageOfficials(tournament: ApiTournament, stage: ApiStage, volunteerEntries: ApiEntry[]): string {
    const stageOfficials = stage.officials ?? [];
    const volunteerEntryMap = new Map(volunteerEntries.map((e) => [e.id, e]));

    return `
      <div class="officials-stage-card">
        <h4>${escapeHtml(stage.name ?? t("tournament.unnamedStage"))}</h4>
        ${stageOfficials.length > 0
          ? `<ul class="officials-list-for-stage">
              ${stageOfficials.map((official) => {
                const entry = volunteerEntryMap.get(official.entryId);
                return `
                  <li class="official-item">
                    <span class="official-name">${escapeHtml(entry?.user?.username ?? official.entryId)}</span>
                    <span class="official-role">${t(`tournament.role.${official.role}`)}</span>
                    <button type="button" class="btn-secondary" data-action="delete-official" data-official-id="${escapeHtml(official.id)}" ${this.#deletingOfficialId === official.id ? "disabled" : ""}>
                      ${t("tournament.deleteOfficial")}
                    </button>
                  </li>
                `;
              }).join("")}
            </ul>`
          : `<p class="empty-state">${t("tournament.noOfficialsForStage")}</p>`}
        <button type="button" class="btn-primary" data-action="add-official" data-stage-id="${escapeHtml(stage.id)}">
          ${t("tournament.addOfficialToStage")}
        </button>
      </div>
    `;
  }

  private renderAccessTab(_tournament: ApiTournament): string {
    const tournamentId = this.#tournamentId;
    const admins = this.#tournamentAdmins;
    const candidates = this.#tournamentAdminCandidates;

    return `
      <div class="tab-content-access">
        <div class="table-header-actions">
          <h3>${t("tournament.adminsTitle")}</h3>
          <button type="button" class="btn-primary" data-action="add-admin">
            ${t("tournament.addAdmin")}
          </button>
        </div>
        ${this.#accessError ? `<p role="alert">${escapeHtml(this.#accessError)}</p>` : ""}
        ${this.#showAddAdmin
          ? `
            <form data-form="add-admin" class="admin-form">
              <label>
                ${t("tournament.selectAdminCandidate")}
                <select name="userId" required>
                  <option value="">${t("tournament.selectAdminCandidate")}</option>
                  ${candidates
                    .map(
                      (c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${escapeHtml(c.username)})</option>`,
                    )
                    .join("")}
                </select>
              </label>
              <button type="submit" ${this.#addingAdmin ? "disabled" : ""}>
                ${t("tournament.addAdmin")}
              </button>
              <button type="button" data-action="cancel-add-admin" ${this.#addingAdmin ? "disabled" : ""}>
                ${t("tournament.cancelAddAdmin")}
              </button>
            </form>
          `
          : ""}
        ${
          admins.length === 0
            ? `<p class="empty-state">${t("tournament.noAdmins")}</p>`
            : `
              <table class="entries-table">
                <thead>
                  <tr>
                    <th>${t("tournament.entryName")}</th>
                    <th>${t("tournament.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${admins
                    .map(
                      (admin) => `
                    <tr>
                      <td>${escapeHtml(admin.user.name)} (${escapeHtml(admin.user.username)})</td>
                      <td>
                        <button type="button" class="btn-secondary" data-action="remove-admin" data-user-id="${escapeHtml(admin.userId)}" ${this.#removingAdminUserId === admin.userId ? "disabled" : ""}>
                          ${t("tournament.removeAdmin")}
                        </button>
                      </td>
                    </tr>
                  `,
                    )
                    .join("")}
                </tbody>
              </table>
            `
        }
        ${candidates.length === 0 && admins.length > 0 && !this.#showAddAdmin
          ? `<p class="empty-state">${t("tournament.noAdminCandidates")}</p>`
          : ""}
      </div>
    `;
  }

  private renderLiveTab(_tournament: ApiTournament): string {
    const liveStatus = this.#liveStatus;
    const liveRings = this.#liveRings;
    const liveResults = this.#liveResults;

    return `
      <div class="tab-content-live">
        <div class="table-header-actions">
          <h3>${t("tournament.tabs.live")}</h3>
          ${liveStatus?.active
            ? `<button type="button" class="btn-secondary" disabled>${t("tournament.liveActive")}</button>`
            : `<button type="button" class="btn-primary" data-action="activate-live" ${this.#activatingLive ? "disabled" : ""}>
                ${t("tournament.liveActivate")}
              </button>`}
        </div>
        ${this.#liveError ? `<p role="alert">${escapeHtml(this.#liveError)}</p>` : ""}
        ${this.#loadingLive
          ? `<p>${t("tournament.loading")}</p>`
          : `
            ${liveStatus?.active
              ? `
                <div class="live-status">
                  <p><strong>${t("tournament.liveActive")}</strong>: ${t("tournament.liveStatus", { status: `${liveStatus.rings} ${t("tournament.liveRings")}, ${liveStatus.bouts} bouts` })}</p>
                </div>
                
                <div class="live-section">
                  <h4>${t("tournament.liveRings")}</h4>
                  ${liveRings.length === 0
                    ? `<p class="empty-state">${t("tournament.noLiveRings")}</p>`
                    : `
                      <table class="entries-table">
                        <thead>
                          <tr>
                            <th>${t("tournament.entryName")}</th>
                            <th>${t("tournament.keeperToken")}</th>
                            <th>${t("tournament.scoreboardToken")}</th>
                            <th>${t("tournament.actions")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${liveRings.map((ring) => `
                            <tr>
                              <td>${escapeHtml(ring.name)}</td>
                              <td>
                                <div class="token-cell">
                                  <a href="${ring.keeperToken}" target="_blank" rel="noopener noreferrer">${t("tournament.keeperToken")}</a>
                                  ${ring.activeKeeper
                                    ? `<p class="token-note">${t("tournament.currentKeeper", { name: ring.activeKeeper.userName })}</p>`
                                    : `<p class="token-note">${t("tournament.noCurrentKeeper")}</p>`}
                                  <button type="button" class="btn-secondary" data-action="rotate-keeper" data-ring-id="${escapeHtml(ring.id)}" ${this.#rotatingKeeperToken === ring.id ? "disabled" : ""}>
                                    ${t("tournament.rotateKeeper")}
                                  </button>
                                </div>
                              </td>
                              <td>
                                <div class="token-cell">
                                  <a href="${ring.scoreboardToken}" target="_blank" rel="noopener noreferrer">${t("tournament.scoreboardToken")}</a>
                                  <button type="button" class="btn-secondary" data-action="rotate-scoreboard" data-ring-id="${escapeHtml(ring.id)}" ${this.#rotatingScoreboardToken === ring.id ? "disabled" : ""}>
                                    ${t("tournament.rotateScoreboard")}
                                  </button>
                                </div>
                              </td>
                              <td>
                                <button type="button" class="btn-secondary" data-action="edit-ring-colors" data-ring-id="${escapeHtml(ring.id)}">
                                  ${t("tournament.ringColors")}
                                </button>
                                <button type="button" class="btn-secondary" data-action="edit-ring-settings" data-ring-id="${escapeHtml(ring.id)}">
                                  ${t("tournament.ringSettings")}
                                </button>
                              </td>
                            </tr>
                          `).join("")}
                        </tbody>
                      </table>
                    `}
                </div>
                
                <div class="live-section">
                  <h4>${t("tournament.liveResults")}</h4>
                  ${liveResults.length === 0
                    ? `<p class="empty-state">${t("tournament.noLiveResults")}</p>`
                    : `
                      <table class="entries-table">
                        <thead>
                          <tr>
                            <th>${t("tournament.entryName")}</th>
                            <th>${t("tournament.fighterLeft")}</th>
                            <th>${t("tournament.fighterRight")}</th>
                            <th>Score</th>
                            <th>${t("tournament.actions")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${liveResults.map((result) => `
                            <tr>
                              <td>${escapeHtml(result.label)}</td>
                              <td>${escapeHtml(result.fighterLeft)}</td>
                              <td>${escapeHtml(result.fighterRight)}</td>
                              <td>${result.score.left}-${result.score.right}${result.score.doubles > 0 ? ` (${result.score.doubles}D)` : ""}</td>
                              <td>
                                <button type="button" class="btn-secondary" data-action="correct-result" data-result-id="${escapeHtml(result.boutId)}">
                                  Correct
                                </button>
                              </td>
                            </tr>
                          `).join("")}
                        </tbody>
                      </table>
                    `}
                </div>
              `
              : `<p class="empty-state">${t("tournament.liveInactive")}</p>`}
          `}
        ${this.#editingRingId
          ? this.renderRingEditModal()
          : ""}
      </div>
    `;
  }

  private renderRingEditModal(): string {
    const ring = this.#liveRings.find((r) => r.id === this.#editingRingId);
    if (!ring) return "";

    const colors = this.#editingRingColors ?? { leftColor: ring.leftColor, rightColor: ring.rightColor };
    const settings = this.#editingRingSettings ?? {
      mirrored: ring.scoreboard.mirrored,
      showNext: ring.scoreboard.showNext,
      textSize: ring.scoreboard.textSize,
      theme: ring.scoreboard.theme,
    };

    return `
      <div class="modal-backdrop" data-modal="ring-edit">
        <div class="modal-card">
          <h3>${t("tournament.ringColors")} & ${t("tournament.ringSettings")}</h3>
          <form data-form="ring-edit">
            <fieldset>
              <legend>${t("tournament.ringColors")}</legend>
              <label>
                ${t("tournament.fighterLeft")}
                <input name="leftColor" type="color" value="${escapeHtml(colors.leftColor)}" />
              </label>
              <label>
                ${t("tournament.fighterRight")}
                <input name="rightColor" type="color" value="${escapeHtml(colors.rightColor)}" />
              </label>
            </fieldset>
            <fieldset>
              <legend>${t("tournament.ringSettings")}</legend>
              <label class="flag-option">
                <input name="mirrored" type="checkbox" ${settings.mirrored ? "checked" : ""} />
                ${t("tournament.scoreboardMirrored")}
              </label>
              <label class="flag-option">
                <input name="showNext" type="checkbox" ${settings.showNext ? "checked" : ""} />
                ${t("tournament.scoreboardShowNext")}
              </label>
              <label>
                ${t("tournament.scoreboardTextSize")}
                <select name="textSize">
                  <option value="SMALL" ${settings.textSize === "SMALL" ? "selected" : ""}>${t("tournament.textSizeSmall")}</option>
                  <option value="MEDIUM" ${settings.textSize === "MEDIUM" ? "selected" : ""}>${t("tournament.textSizeMedium")}</option>
                  <option value="LARGE" ${settings.textSize === "LARGE" ? "selected" : ""}>${t("tournament.textSizeLarge")}</option>
                </select>
              </label>
              <label>
                ${t("tournament.scoreboardTheme")}
                <select name="theme">
                  <option value="DARK" ${settings.theme === "DARK" ? "selected" : ""}>${t("tournament.themeDark")}</option>
                  <option value="LIGHT" ${settings.theme === "LIGHT" ? "selected" : ""}>${t("tournament.themeLight")}</option>
                </select>
              </label>
            </fieldset>
            <div class="modal-actions">
              <button type="submit" class="btn-primary" ${this.#savingRing ? "disabled" : ""}>
                ${t("tournament.saveParticipant")}
              </button>
              <button type="button" class="btn-secondary" data-action="cancel-ring-edit" ${this.#savingRing ? "disabled" : ""}>
                ${t("tournament.cancelParticipant")}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("tournament-workspace-view")) {
  customElements.define("tournament-workspace-view", TournamentWorkspaceView);
}
