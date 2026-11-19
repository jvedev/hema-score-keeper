import css from "./tournament-workspace-view.css?raw";
import { BaseComponent } from "../base-component/base-component.js";
import { LOCALE_CHANGE_EVENT, t } from "../../i18n/i18n.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { createApiClient, type ApiEvent, type ApiTournament, type ApiStage, type ApiEntry, type ApiStageOfficial, type StageOfficialRole, type ApiTournamentAdmin, type ApiTournamentAdminCandidate, type ApiDatabaseLiveStatus, type ApiLiveRing, type ApiDatabaseLiveResult, type ApiLiveRingColors, type ApiScoreboardSettings, type ApiRingRules, type ApiScoreboardTextSize, type ApiScoreboardTheme } from "@hema/event-admin-api";

function skillLevel(skills: Array<{ skillName: string; skillLevel: number }> | undefined, skillName: string): number {
  return skills?.find((skill) => skill.skillName === skillName && skill.skillLevel > 0)?.skillLevel ?? 0;
}

export type TournamentTab = "overview" | "participants" | "stages" | "officials" | "access" | "live";
export type StageSubTab = "overview" | "arenas" | "officials" | "rounds" | "matches" | "pool-results";

export class TournamentWorkspaceView extends BaseComponent {
  #event: ApiEvent | null = null;
  #tournamentId: string | null = null;
  #activeTab: TournamentTab = "overview";
  #selectedStageId: string | null = null;
  #stageSubTab: StageSubTab = "overview";
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

  get stageSubTab(): StageSubTab {
    return this.#stageSubTab;
  }

  set stageSubTab(value: StageSubTab) {
    this.#stageSubTab = value;
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
    });
    this.registerEvent(this.root, "submit", (e) => {
      const form = e.target as HTMLFormElement;
      if (form.dataset.form !== "add-participant" && form.dataset.form !== "add-bulk" && form.dataset.form !== "edit-entry" && form.dataset.form !== "add-official" && form.dataset.form !== "add-admin" && form.dataset.form !== "ring-edit") return;
      e.preventDefault();
      if (form.dataset.form === "add-bulk") void this.addBulk(form);
      else if (form.dataset.form === "edit-entry") void this.saveEntry(form);
      else if (form.dataset.form === "add-official") void this.addOfficial(form);
      else if (form.dataset.form === "add-admin") void this.handleAddAdmin(form);
      else if (form.dataset.form === "ring-edit") void this.handleRingEdit(form);
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

    const subTabBtn = target.closest<HTMLElement>("[data-subtab]");
    if (subTabBtn && subTabBtn.dataset.subtab) {
      this.#stageSubTab = subTabBtn.dataset.subtab as StageSubTab;
      this.renderView();
      return;
    }

    const stageItem = target.closest<HTMLElement>(".stage-item");
    if (stageItem && stageItem.dataset.stageId) {
      this.#selectedStageId = stageItem.dataset.stageId;
      this.renderView();
      return;
    }

    const actionEl = target.closest<HTMLElement>("[data-action]");
    if (actionEl && actionEl.dataset.action) {
      const action = actionEl.dataset.action;
      if (action === "view-participants") {
        this.#activeTab = "participants";
        this.renderView();
      } else if (action === "edit-tournament") {
        this.dispatchEvent(
          new CustomEvent("tournament-edit-requested", {
            bubbles: true,
            composed: true,
            detail: { tournamentId: this.#tournamentId },
          }),
        );
      } else if (action === "add-participant") {
        this.#showAddParticipant = true;
        this.#entryError = null;
        this.renderView();
        this.dispatchEvent(
          new CustomEvent("participant-add-requested", {
            bubbles: true,
            composed: true,
            detail: { tournamentId: this.#tournamentId, mode: "single" },
          }),
        );
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
        this.dispatchEvent(
          new CustomEvent("participant-add-requested", {
            bubbles: true,
            composed: true,
            detail: { tournamentId: this.#tournamentId, mode: "bulk" },
          }),
        );
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
      } else if (action === "make-active-stage") {
        const stageId = actionEl.dataset.stageId;
        if (stageId) {
          this.dispatchEvent(
            new CustomEvent("stage-advance-requested", {
              bubbles: true,
              composed: true,
              detail: { tournamentId: this.#tournamentId, stageId },
            }),
          );
        }
      } else if (action === "add-stage") {
        this.dispatchEvent(
          new CustomEvent("stage-create-requested", {
            bubbles: true,
            composed: true,
            detail: { tournamentId: this.#tournamentId },
          }),
        );
      } else if (action === "activate-live") {
        this.dispatchEvent(
          new CustomEvent("live-activate-requested", {
            bubbles: true,
            composed: true,
            detail: { tournamentId: this.#tournamentId },
          }),
        );
      } else if (action === "correct-result") {
        const matchId = actionEl.dataset.matchId;
        if (matchId) {
          this.dispatchEvent(
            new CustomEvent("result-correct-requested", {
              bubbles: true,
              composed: true,
              detail: { matchId },
            }),
          );
        }
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
    const activeStage = tournament.stages?.find((s: ApiStage) => s.id === tournament.currentStageId) ?? tournament.stages?.[0];

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
            <button type="button" class="btn-secondary" data-action="edit-tournament">
              ${t("tournament.edit")}
            </button>
          </div>
        </header>

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

  private renderOverviewTab(tournament: ApiTournament, activeStage?: ApiStage): string {
    const entries = tournament.entries ?? [];
    const stages = tournament.stages ?? [];

    return `
      <div class="tab-content-overview">
        <div class="overview-grid">
          <div class="summary-card summary-card-participants">
            <div class="summary-card-header">${t("tournament.overview.participantsTitle")}</div>
            <div class="summary-card-value">${entries.length}</div>
            <button type="button" class="btn-secondary" data-action="view-participants">
              ${t("events.openEvent")}
            </button>
          </div>

          <div class="summary-card summary-card-stages">
            <div class="summary-card-header">${t("tournament.overview.stagesTitle")}</div>
            <div class="summary-card-value">${activeStage ? escapeHtml(activeStage.name ?? "") : t("tournament.noStages")}</div>
            <div class="summary-card-meta">${stages.length} ${stages.length === 1 ? t("events.stagesOne") : t("events.stages", { count: stages.length })}</div>
          </div>

          <div class="summary-card summary-card-schedule">
            <div class="summary-card-header">${t("tournament.overview.scheduleTitle")}</div>
            <div class="summary-card-value">SQLite</div>
            <div class="summary-card-meta">Database-mode</div>
          </div>

          <div class="summary-card summary-card-live">
            <div class="summary-card-header">${t("tournament.overview.liveTitle")}</div>
            <div class="summary-card-value">Ready</div>
            <div class="summary-card-meta">${t("tournament.tabs.live")}</div>
          </div>
        </div>
      </div>
    `;
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
    const stages = tournament.stages ?? [];
    const activeStageId = tournament.currentStageId;
    const selectedStage =
      stages.find((s) => s.id === this.#selectedStageId) ??
      stages.find((s) => s.id === activeStageId) ??
      stages[0];

    const subTabs: StageSubTab[] = ["overview", "arenas", "officials", "rounds", "matches", "pool-results"];

    return `
      <div class="tab-content-stages">
        <div class="table-header-actions">
          <h3>${t("tournament.tabs.stages")}</h3>
          <button type="button" class="btn-primary" data-action="add-stage">
            ${t("tournament.addStage")}
          </button>
        </div>

        ${
          stages.length === 0
            ? `<div class="empty-state">${t("tournament.noStages")}</div>`
            : `
          <div class="stage-layout">
            <aside class="stage-sidebar">
              ${stages
                .map(
                  (stage) => `
                <div
                  class="stage-item ${selectedStage?.id === stage.id ? "active" : ""}"
                  data-stage-id="${stage.id}"
                >
                  <h4>${escapeHtml(stage.name ?? "")}</h4>
                  <div class="badges-row" style="margin-top: 0.25rem;">
                    <span class="badge">${stage.type}</span>
                    ${stage.id === activeStageId ? `<span class="badge active-stage-badge">${t("tournament.activeStage")}</span>` : ""}
                  </div>
                </div>
              `,
                )
                .join("")}
            </aside>

            <section class="stage-detail">
              ${
                selectedStage
                  ? `
                <header class="table-header-actions">
                  <div>
                    <h4>${escapeHtml(selectedStage.name ?? "")} (${selectedStage.type})</h4>
                    <p class="panel-meta" style="margin: 0.25rem 0 0 0; color: #64748b; font-size: 0.8125rem;">
                      ${selectedStage.rounds?.length ?? 0} rounds · ${selectedStage.arenas?.length ?? 0} arenas
                    </p>
                  </div>
                  ${
                    selectedStage.id !== activeStageId
                      ? `
                    <button type="button" class="btn-secondary" data-action="make-active-stage" data-stage-id="${selectedStage.id}">
                      ${t("tournament.makeActiveStage")}
                    </button>
                  `
                      : ""
                  }
                </header>

                <nav class="sub-tabs">
                  ${subTabs
                    .map(
                      (st) => `
                    <button
                      type="button"
                      class="sub-tab ${this.#stageSubTab === st ? "active" : ""}"
                      data-subtab="${st}"
                    >
                      ${st.charAt(0).toUpperCase() + st.slice(1)}
                    </button>
                  `,
                    )
                    .join("")}
                </nav>

                <div class="sub-tab-content">
                  ${this.renderStageSubTabContent(selectedStage, tournament)}
                </div>
              `
                  : `<div class="empty-state">Selecteer een fase om details te zien.</div>`
              }
            </section>
          </div>
        `
        }
      </div>
    `;
  }

  private renderStageSubTabContent(stage: ApiStage, tournament: ApiTournament): string {
    switch (this.#stageSubTab) {
      case "overview":
        return `
          <div class="stage-overview-pane">
            <p><strong>Type:</strong> ${stage.type}</p>
            <p><strong>Min/Max Pool Size:</strong> ${stage.minPoolSize ?? "—"} / ${stage.maxPoolSize ?? "—"}</p>
          </div>
        `;
      case "arenas":
        return `
          <div class="stage-arenas-pane">
            ${
              stage.arenas?.length
                ? `<ul>${stage.arenas.map((a) => `<li>Arena ${escapeHtml(a.arenaId)}</li>`).join("")}</ul>`
                : `<p class="empty-state">Geen arena's gekoppeld aan deze fase.</p>`
            }
          </div>
        `;
      case "officials":
        return `
          <div class="stage-officials-pane">
            ${
              stage.officials?.length
                ? `<ul>${stage.officials.map((o) => `<li>${escapeHtml(o.role)} (${escapeHtml(o.entryId)})</li>`).join("")}</ul>`
                : `<p class="empty-state">Geen officials toegewezen aan deze fase.</p>`
            }
          </div>
        `;
      case "rounds":
        return `
          <div class="stage-rounds-pane">
            ${
              stage.rounds?.length
                ? `<ul>${stage.rounds.map((r) => `<li>Ronde ${r.roundNumber} (${r.matches?.length ?? 0} matches)</li>`).join("")}</ul>`
                : `<p class="empty-state">Nog geen rondes aangemaakt.</p>`
            }
          </div>
        `;
      case "matches":
        return `
          <div class="stage-matches-pane">
            <p class="empty-state">Wedstrijdenoverzicht voor ${escapeHtml(stage.name ?? "")}.</p>
          </div>
        `;
      case "pool-results":
        return `
          <div class="stage-pool-results-pane">
            <pool-results></pool-results>
          </div>
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
