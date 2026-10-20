import { parseRuleSet, toBoutOutcome, type RuleSet } from "@hema/match-engine";
import { setLocale, t, type BoutApprovalView, type BoutSetupResult, type CompetitionBoutSetup, type MatchEventDetail } from "@hema/ui";
import { SessionExpiredError, type CompetitionClient, type PersonOption } from "./competition-client";
import { buildRecordBoutPayload, reconcileAlsoCountIn, ringLabel } from "./competition-payload";
import { saveCompetitionBout, type PendingBout } from "./competition-save";

/** What the competition flow needs from the rest of the app (the fight screen lives in main.ts). */
export interface CompetitionHost {
  showCompetitionScreen(): void;
  startFight(fight: { ruleSet: RuleSet; fighterAName: string; fighterBName: string; label: string }): Promise<void>;
  leaveFight(): Promise<void>;
}

export interface CompetitionElements {
  loginForm: HTMLFormElement;
  loginError: HTMLElement;
  workspace: HTMLElement;
  userLabel: HTMLElement;
  logoutButton: HTMLButtonElement;
  setup: CompetitionBoutSetup;
  approval: BoutApprovalView;
}

/**
 * Competition bouts on the score-keeper: sign in, set up the bout, fight it on the normal fight
 * screen, then save it with the approvals registered on the device.
 */
export class CompetitionMode {
  #fighters: PersonOption[] = [];
  #people = new Map<string, PersonOption>();
  #competitionNames = new Map<string, string>();
  #setup: BoutSetupResult | null = null;
  #ruleSet: RuleSet | null = null;
  #startedAt = "";
  #pending: PendingBout | null = null;
  /** The pair whose options were asked for last; older answers are ignored. */
  #optionsKey = "";

  constructor(
    private readonly client: CompetitionClient,
    private readonly elements: CompetitionElements,
    private readonly host: CompetitionHost,
  ) {
    elements.loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#login();
    });
    elements.logoutButton.addEventListener("click", () => {
      void this.client.logout().then(() => this.open());
    });
    elements.setup.addEventListener("setup-competition-chosen", (event) => {
      void this.#guard(async () => {
        this.#fighters = await this.client.participants(event.detail.competitionId);
        elements.setup.fighters = this.#fighters;
      });
    });
    elements.setup.addEventListener("setup-fighters-chosen", (event) => {
      const { competitionId, fighterAUserId, fighterBUserId } = event.detail;
      const key = `${competitionId}|${fighterAUserId}|${fighterBUserId}`;
      this.#optionsKey = key;
      void this.#guard(async () => {
        const choice = await this.client.competitionOptions(fighterAUserId, fighterBUserId, competitionId);
        if (this.#optionsKey === key) {
          elements.setup.otherCompetitions = choice.others;
        }
      });
    });
    elements.setup.addEventListener("people-search-requested", (event) => {
      void this.#guard(async () => {
        const results = await this.client.searchPeople(event.detail.query);
        for (const person of results) {
          this.#people.set(person.userId, person);
        }
        elements.setup.peopleResults = results;
      });
    });
    elements.setup.addEventListener("bout-setup-confirmed", (event) => {
      void this.#guard(() => this.#startBout(event.detail));
    });
    elements.approval.addEventListener("bout-save-requested", (event) => {
      void this.#save(event.detail);
    });
  }

  /** Shows the login when needed, otherwise the bout setup. */
  async open(): Promise<void> {
    this.host.showCompetitionScreen();
    const session = this.client.currentSession();
    this.elements.loginForm.hidden = session !== null;
    this.elements.workspace.hidden = session === null;
    if (!session) {
      this.elements.loginForm.querySelector<HTMLInputElement>("input[name=username]")?.focus();
      return;
    }
    setLocale(session.user.language);
    this.elements.userLabel.textContent = t("scorekeeper.signedInAs", { name: session.user.name });
    if (this.#pending) {
      this.#showApproval();
      return;
    }
    this.elements.approval.hidden = true;
    this.elements.setup.hidden = false;
    await this.#guard(async () => {
      const competitions = await this.client.runningCompetitions();
      this.#competitionNames = new Map(competitions.map((competition) => [competition.id, competition.name]));
      this.elements.setup.competitions = competitions;
    });
  }

  /** Called by main.ts when the operator ends a competition fight. */
  async matchEnded(events: readonly MatchEventDetail[], elapsedSeconds: number): Promise<void> {
    if (!this.#setup || !this.#ruleSet) {
      return;
    }
    const outcome = toBoutOutcome(events, this.#ruleSet.matchParameters, elapsedSeconds);
    this.#pending = { payload: buildRecordBoutPayload(this.#setup, outcome, this.#startedAt), boutId: null };
    await this.host.leaveFight();
    await this.open();
  }

  async #login(): Promise<void> {
    const form = new FormData(this.elements.loginForm);
    this.elements.loginError.hidden = true;
    try {
      await this.client.login(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
      this.elements.loginForm.reset();
      await this.open();
    } catch (error) {
      this.elements.loginError.hidden = false;
      this.elements.loginError.textContent = error instanceof Error ? error.message : t("scorekeeper.loginFailed");
    }
  }

  async #startBout(setup: BoutSetupResult): Promise<void> {
    const choice = await this.client.competitionOptions(setup.fighterAUserId, setup.fighterBUserId, setup.competitionId);
    // Competitions may have closed or stopped accepting other bouts since the ticks were made.
    this.#setup = { ...setup, alsoCountIn: reconcileAlsoCountIn(setup.alsoCountIn, choice.others) };
    this.#ruleSet = parseRuleSet({ id: choice.startedIn.id, name: choice.startedIn.name }, choice.startedIn.rulesetJson);
    this.#startedAt = new Date().toISOString();
    await this.host.startFight({
      ruleSet: this.#ruleSet,
      fighterAName: this.#nameOf(setup.fighterAUserId),
      fighterBName: this.#nameOf(setup.fighterBUserId),
      label: ringLabel(this.#competitionNames.get(setup.competitionId) ?? choice.startedIn.name, setup.ring),
    });
  }

  #showApproval(): void {
    const payload = this.#pending!.payload;
    this.elements.setup.hidden = true;
    this.elements.approval.hidden = false;
    this.elements.approval.summary = {
      fighterA: this.#nameOf(payload.fighterAUserId),
      fighterB: this.#nameOf(payload.fighterBUserId),
      scoreA: payload.scoreA,
      scoreB: payload.scoreB,
      winnerSide: payload.winnerSide,
      refereeName: this.#nameOf(payload.refereeUserId),
    };
  }

  async #save(approvals: { refereeApproves: boolean; fighterAApproves: boolean; fighterBApproves: boolean }): Promise<void> {
    const pending = this.#pending;
    if (!pending) {
      return;
    }
    this.elements.approval.setSaving(true);
    this.elements.approval.setError(null);
    try {
      await saveCompetitionBout(this.client, pending, approvals);
      this.#pending = null;
      this.elements.approval.setSaving(false);
      await this.open();
    } catch (error) {
      this.elements.approval.setSaving(false);
      if (error instanceof SessionExpiredError) {
        // The bout stays pending (with its id if it was already recorded); after signing in
        // the approval screen comes back and saving continues where it stopped.
        await this.open();
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.elements.approval.setError(pending.boutId === null ? message : t("approval.savedButNotApproved", { error: message }));
    }
  }

  #nameOf(userId: string): string {
    return this.#fighters.find((fighter) => fighter.userId === userId)?.name ?? this.#people.get(userId)?.name ?? userId;
  }

  async #guard(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        await this.open();
        return;
      }
      console.error(error);
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }
}
