import css from "./competition-bout-setup.css?raw";
import { t, type MessageKey } from "../../i18n/i18n.js";
import type { BoutSetupResult, SetupCompetitionView, SetupPersonView } from "../../models/competition-views.js";
import { escapeHtml } from "../../utils/escape-html.js";
import { BaseComponent } from "../base-component/base-component.js";

export type OfficialRole = "referee" | "jury" | "table";

export interface PeopleSearchRequestedDetail {
  query: string;
  role: OfficialRole;
}

const ROLES: ReadonlyArray<{ role: OfficialRole; label: MessageKey; max: number }> = [
  { role: "referee", label: "setup.referee", max: 1 },
  { role: "jury", label: "setup.jury", max: 4 },
  { role: "table", label: "setup.table", max: 2 },
];

/**
 * Sets up a competition bout on the score-keeper: the competition it is fought for, both
 * fighters, the referee, up to four jury members, up to two table officials, the ring and
 * the other competitions it also counts in. The app answers its events with data:
 * `setup-competition-chosen` → `fighters`, `setup-fighters-chosen` → `otherCompetitions`,
 * `people-search-requested` → `peopleResults`. Fires `bout-setup-confirmed` with the result.
 */
export class CompetitionBoutSetup extends BaseComponent {
  #competitions: SetupCompetitionView[] = [];
  #fighters: SetupPersonView[] = [];
  #others: SetupCompetitionView[] = [];
  #results: SetupPersonView[] = [];
  #competitionId = "";
  #fighterA = "";
  #fighterB = "";
  #officials: Record<OfficialRole, SetupPersonView[]> = { referee: [], jury: [], table: [] };
  #unticked = new Set<string>();
  #ring = "";
  #searchingRole: OfficialRole | null = null;

  set competitions(competitions: SetupCompetitionView[]) {
    this.#competitions = competitions;
    this.#drawSelects();
  }

  set fighters(fighters: SetupPersonView[]) {
    this.#fighters = fighters;
    this.#drawSelects();
    this.#update();
  }

  set otherCompetitions(competitions: SetupCompetitionView[]) {
    this.#others = competitions;
    this.#unticked.clear();
    this.#drawOthers();
  }

  set peopleResults(results: SetupPersonView[]) {
    this.#results = results;
    this.#drawResults();
  }

  connectedCallback(): void {
    this.render(css, this.#frame());
    this.registerEvent(this.root, "change", (event) => this.#onChange(event.target as HTMLElement));
    this.registerEvent(this.root, "input", (event) => this.#onInput(event.target as HTMLInputElement));
    this.registerEvent<MouseEvent>(this.root, "click", (event) => this.#onClick(event.target as HTMLElement));
    this.onLocaleChange(() => {
      this.render(css, this.#frame());
      this.#drawAll();
    });
    this.#drawAll();
  }

  #frame(): string {
    const pickers = ROLES.map(
      ({ role, label }) => `<section class="picker" data-role="${role}">
        <h3>${t(label)}</h3>
        <div class="chips"></div>
        <input type="search" autocomplete="off" placeholder="${t("setup.searchPerson")}" aria-label="${t(label)}" />
        <div class="results" role="listbox"></div>
      </section>`,
    ).join("");
    return `<h2>${t("setup.title")}</h2>
      <label class="field">${t("setup.competition")}<select class="competition"></select></label>
      <div class="pair">
        <label class="field">${t("setup.fighterA")}<select class="fighter-a"></select></label>
        <label class="field">${t("setup.fighterB")}<select class="fighter-b"></select></label>
      </div>
      ${pickers}
      <label class="field">${t("setup.ring")}<input class="ring" type="text" autocomplete="off" /></label>
      <fieldset class="others" hidden><legend>${t("setup.alsoCountsIn")}</legend><div class="boxes"></div></fieldset>
      <p class="hint" aria-live="polite"></p>
      <button type="button" class="start">${t("setup.start")}</button>`;
  }

  #drawAll(): void {
    this.#drawSelects();
    for (const { role } of ROLES) {
      this.#drawChips(role);
    }
    this.#drawResults();
    this.#drawOthers();
    const ring = this.root.querySelector<HTMLInputElement>("input.ring");
    if (ring) {
      ring.value = this.#ring;
    }
    this.#update();
  }

  #drawSelects(): void {
    const competition = this.root.querySelector<HTMLSelectElement>("select.competition");
    if (!competition) {
      return;
    }
    competition.innerHTML = options(t("setup.chooseCompetition"), this.#competitions.map((item) => [item.id, item.name]), this.#competitionId);
    const fighterOptions = this.#fighters.map((fighter): [string, string] => [fighter.userId, fighter.name]);
    this.queryRoot<HTMLSelectElement>("select.fighter-a").innerHTML = options(t("setup.chooseFighter"), fighterOptions, this.#fighterA);
    this.queryRoot<HTMLSelectElement>("select.fighter-b").innerHTML = options(t("setup.chooseFighter"), fighterOptions, this.#fighterB);
  }

  #drawChips(role: OfficialRole): void {
    const picker = this.root.querySelector<HTMLElement>(`[data-role="${role}"]`);
    if (!picker) {
      return;
    }
    picker.querySelector(".chips")!.innerHTML = this.#officials[role]
      .map(
        (person) => `<span class="chip">${escapeHtml(person.name)}<button type="button" data-remove="${escapeHtml(person.userId)}" aria-label="${escapeHtml(t("setup.remove", { name: person.name }))}">×</button></span>`,
      )
      .join("");
    const max = ROLES.find((item) => item.role === role)!.max;
    const input = picker.querySelector<HTMLInputElement>("input")!;
    input.disabled = this.#officials[role].length >= max;
    if (input.disabled) {
      input.value = "";
    }
  }

  #drawResults(): void {
    for (const { role } of ROLES) {
      const list = this.root.querySelector<HTMLElement>(`[data-role="${role}"] .results`);
      if (!list) {
        continue;
      }
      if (role !== this.#searchingRole) {
        list.innerHTML = "";
        continue;
      }
      const taken = this.#takenIds();
      const offered = this.#results.filter((person) => !taken.has(person.userId));
      list.innerHTML =
        offered.length === 0
          ? `<p class="none">${t("setup.noPeople")}</p>`
          : offered
              .map(
                (person) => `<button type="button" role="option" data-pick="${escapeHtml(person.userId)}">${escapeHtml(person.name)}${person.clubName ? `<span class="club">${escapeHtml(person.clubName)}</span>` : ""}</button>`,
              )
              .join("");
    }
  }

  #drawOthers(): void {
    const fieldset = this.root.querySelector<HTMLFieldSetElement>(".others");
    if (!fieldset) {
      return;
    }
    fieldset.hidden = this.#others.length === 0;
    fieldset.querySelector(".boxes")!.innerHTML = this.#others
      .map(
        (competition) => `<label class="box"><input type="checkbox" data-other="${escapeHtml(competition.id)}" ${this.#unticked.has(competition.id) ? "" : "checked"} />${escapeHtml(competition.name)}</label>`,
      )
      .join("");
  }

  #onChange(target: HTMLElement): void {
    if (target.matches("select.competition")) {
      this.#competitionId = (target as HTMLSelectElement).value;
      this.#fighters = [];
      this.#fighterA = "";
      this.#fighterB = "";
      this.#others = [];
      this.#drawSelects();
      this.#drawOthers();
      if (this.#competitionId) {
        this.#emit("setup-competition-chosen", { competitionId: this.#competitionId });
      }
    } else if (target.matches("select.fighter-a, select.fighter-b")) {
      const value = (target as HTMLSelectElement).value;
      if (target.matches(".fighter-a")) {
        this.#fighterA = value;
      } else {
        this.#fighterB = value;
      }
      this.#dropFightersFromOfficials();
      if (this.#fighterA && this.#fighterB && this.#fighterA !== this.#fighterB) {
        this.#emit("setup-fighters-chosen", { competitionId: this.#competitionId, fighterAUserId: this.#fighterA, fighterBUserId: this.#fighterB });
      }
    } else if (target.matches("input[data-other]")) {
      const id = target.dataset.other!;
      if ((target as HTMLInputElement).checked) {
        this.#unticked.delete(id);
      } else {
        this.#unticked.add(id);
      }
    }
    this.#update();
  }

  #onInput(target: HTMLInputElement): void {
    if (target.matches("input.ring")) {
      this.#ring = target.value;
      return;
    }
    const role = target.closest<HTMLElement>("[data-role]")?.dataset.role as OfficialRole | undefined;
    if (!role) {
      return;
    }
    const query = target.value.trim();
    this.#searchingRole = role;
    this.#results = [];
    this.#drawResults();
    if (query.length >= 2) {
      this.#emit("people-search-requested", { query, role } satisfies PeopleSearchRequestedDetail);
    }
  }

  #onClick(target: HTMLElement): void {
    const pickButton = target.closest<HTMLElement>("[data-pick]");
    const removeButton = target.closest<HTMLElement>("[data-remove]");
    if (pickButton) {
      const role = pickButton.closest<HTMLElement>("[data-role]")!.dataset.role as OfficialRole;
      const person = this.#results.find((candidate) => candidate.userId === pickButton.dataset.pick);
      if (person) {
        this.#officials[role] = role === "referee" ? [person] : [...this.#officials[role], person];
        this.#searchingRole = null;
        this.queryRoot<HTMLInputElement>(`[data-role="${role}"] input`).value = "";
        this.#drawChips(role);
        this.#drawResults();
      }
    } else if (removeButton) {
      const role = removeButton.closest<HTMLElement>("[data-role]")!.dataset.role as OfficialRole;
      this.#officials[role] = this.#officials[role].filter((person) => person.userId !== removeButton.dataset.remove);
      this.#drawChips(role);
    } else if (target.closest("button.start") && this.#problem() === null) {
      this.#emit("bout-setup-confirmed", this.#result());
    }
    this.#update();
  }

  #takenIds(): Set<string> {
    return new Set([this.#fighterA, this.#fighterB, ...ROLES.flatMap(({ role }) => this.#officials[role].map((person) => person.userId))]);
  }

  #dropFightersFromOfficials(): void {
    for (const { role } of ROLES) {
      const before = this.#officials[role].length;
      this.#officials[role] = this.#officials[role].filter((person) => person.userId !== this.#fighterA && person.userId !== this.#fighterB);
      if (this.#officials[role].length !== before) {
        this.#drawChips(role);
      }
    }
  }

  #problem(): MessageKey | null {
    if (!this.#competitionId) {
      return "setup.needsCompetition";
    }
    if (!this.#fighterA || !this.#fighterB) {
      return "setup.needsFighters";
    }
    if (this.#fighterA === this.#fighterB) {
      return "setup.sameFighter";
    }
    if (this.#officials.referee.length === 0) {
      return "setup.needsReferee";
    }
    return null;
  }

  #update(): void {
    const start = this.root.querySelector<HTMLButtonElement>("button.start");
    const hint = this.root.querySelector<HTMLElement>(".hint");
    if (!start || !hint) {
      return;
    }
    const problem = this.#problem();
    start.disabled = problem !== null;
    hint.textContent = problem === null ? "" : t(problem);
  }

  #result(): BoutSetupResult {
    return {
      competitionId: this.#competitionId,
      fighterAUserId: this.#fighterA,
      fighterBUserId: this.#fighterB,
      refereeUserId: this.#officials.referee[0]!.userId,
      juryUserIds: this.#officials.jury.map((person) => person.userId),
      tableUserIds: this.#officials.table.map((person) => person.userId),
      ring: this.#ring.trim() === "" ? null : this.#ring.trim(),
      alsoCountIn: this.#others.filter((competition) => !this.#unticked.has(competition.id)).map((competition) => competition.id),
    };
  }

  #emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }
}

function options(placeholder: string, items: Array<[string, string]>, selected: string): string {
  return `<option value="">${escapeHtml(placeholder)}</option>${items
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
    .join("")}`;
}

if (!customElements.get("competition-bout-setup")) {
  customElements.define("competition-bout-setup", CompetitionBoutSetup);
}

declare global {
  interface HTMLElementTagNameMap {
    "competition-bout-setup": CompetitionBoutSetup;
  }
  interface HTMLElementEventMap {
    "setup-competition-chosen": CustomEvent<{ competitionId: string }>;
    "setup-fighters-chosen": CustomEvent<{ competitionId: string; fighterAUserId: string; fighterBUserId: string }>;
    "people-search-requested": CustomEvent<PeopleSearchRequestedDetail>;
    "bout-setup-confirmed": CustomEvent<BoutSetupResult>;
  }
}
