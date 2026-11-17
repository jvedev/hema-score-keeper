import { afterEach, describe, expect, it } from "vitest";
import type { ApiEntry, ApiEvent, ApiLiveRing, ApiRingRules, ApiUser } from "@hema/event-admin-api";

describe("event-view", () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = window.location.href;

  const originalConfirm = window.confirm;
  const originalLang = document.documentElement.lang;

  afterEach(() => {
    window.confirm = originalConfirm;
    document.documentElement.lang = originalLang;
    globalThis.fetch = originalFetch;
    window.fetch = originalFetch;
    window.history.replaceState({}, "", originalUrl);
    document.body.replaceChildren();
  });

  it("renders shadow DOM content", async () => {
    installEventViewMock();
    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });

  it("uses unique skill input ids for each volunteer card", async () => {
    const mock = installEventViewMock();
    mock.entries.push(
      buildVolunteerEntry("entry-1", "user-1", "Alice", [{ id: "skill-1", userId: "user-1", skillName: "JUDGE", skillLevel: 2 }]),
      buildVolunteerEntry("entry-2", "user-2", "Bob", [{ id: "skill-2", userId: "user-2", skillName: "JURY", skillLevel: 3 }]),
    );

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const officialsTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-event-tab"][data-tab="officials"]');
    officialsTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const openVolunteerViewButton = await waitForElement<HTMLButtonElement>(element, 'button[data-action="open-volunteer-view"]');
    openVolunteerViewButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const volunteerHost = await waitForElement<HTMLElement>(element, "event-editor-view");
    const ids = [...(volunteerHost?.querySelectorAll('.volunteer-modal-card input[type="radio"]') ?? [])]
      .map((input) => (input instanceof HTMLInputElement ? input.id : ""))
      .filter((id) => id.length > 0);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the volunteer card scrolled after saving a skill update", async () => {
    const mock = installEventViewMock();
    mock.entries.push(
      buildVolunteerEntry("entry-1", "user-1", "Alice", [{ id: "skill-1", userId: "user-1", skillName: "JUDGE", skillLevel: 2 }]),
      buildVolunteerEntry("entry-2", "user-2", "Bob", [{ id: "skill-2", userId: "user-2", skillName: "JURY", skillLevel: 3 }]),
      buildVolunteerEntry("entry-3", "user-3", "Carol", [{ id: "skill-3", userId: "user-3", skillName: "TABLE", skillLevel: 1 }]),
      buildVolunteerEntry("entry-4", "user-4", "Daan", [{ id: "skill-4", userId: "user-4", skillName: "OTHER", skillLevel: 1 }]),
      buildVolunteerEntry("entry-5", "user-5", "Eva", [{ id: "skill-5", userId: "user-5", skillName: "JUDGE", skillLevel: 4 }]),
      buildVolunteerEntry("entry-6", "user-6", "Finn", [{ id: "skill-6", userId: "user-6", skillName: "JURY", skillLevel: 2 }]),
    );

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const officialsTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-event-tab"][data-tab="officials"]');
    officialsTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const openVolunteerViewButton = await waitForElement<HTMLButtonElement>(element, 'button[data-action="open-volunteer-view"]');
    openVolunteerViewButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const modal = await waitForElement<HTMLElement>(element, ".modal-card");
    modal.scrollTop = 240;
    expect(modal.scrollTop).toBe(240);

    const updatedRadio = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeSkill"][value="4"]');
    updatedRadio.checked = true;
    updatedRadio.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await flush();

    const rerenderedModal = await waitForElement<HTMLElement>(element, ".modal-card");
    expect(rerenderedModal.scrollTop).toBe(240);
  });

  it("creates a skill when a rating is selected without an existing skill", async () => {
    const mock = installEventViewMock();
    mock.entries.push(buildVolunteerEntry("entry-1", "user-1", "Alice", []));

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const officialsTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-event-tab"][data-tab="officials"]');
    officialsTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const openVolunteerViewButton = await waitForElement<HTMLButtonElement>(element, 'button[data-action="open-volunteer-view"]');
    openVolunteerViewButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const updatedRadio = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeSkill"][value="4"]');
    updatedRadio.checked = true;
    updatedRadio.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await waitForCondition(() => (mock.entries[0]?.user.skills ?? []).some((skill) => skill.skillName === "JUDGE" && skill.skillLevel === 4));

    const judgeSkills = (mock.entries[0]?.user.skills ?? []).filter((skill) => skill.skillName === "JUDGE");
    expect(judgeSkills).toHaveLength(1);
    expect(judgeSkills[0]?.skillLevel).toBe(4);
  });

  it("keeps volunteer preferences separate from skill changes", async () => {
    const mock = installEventViewMock();
    mock.entries.push(buildVolunteerEntry("entry-1", "user-1", "Alice", [
      { id: "skill-1", userId: "user-1", skillName: "JUDGE", skillLevel: 2 },
    ]));

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const officialsTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-event-tab"][data-tab="officials"]');
    officialsTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const openVolunteerViewButton = await waitForElement<HTMLButtonElement>(element, 'button[data-action="open-volunteer-view"]');
    openVolunteerViewButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const checkboxBefore = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeVolunteer"]');
    expect(checkboxBefore.checked).toBe(false);

    const updatedRadio = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeSkill"][value="4"]');
    updatedRadio.checked = true;
    updatedRadio.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await flush();
    await flush();

    const checkboxAfter = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeVolunteer"]');
    expect(checkboxAfter.checked).toBe(false);
    expect(mock.entries[0]?.user.judgeVolunteer).toBe(false);
    expect((mock.entries[0]?.user.skills ?? []).find((skill) => skill.skillName === "JUDGE")?.skillLevel).toBe(4);
  });

  it("advances the current tournament stage", async () => {
    const mock = installEventViewMock();

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const stageListTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-tournament-tab"][data-tab="stages"]');
    stageListTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const overviewTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-stage-tab"][data-tab="overview"]');
    overviewTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const activeStageCard = await waitForElement<HTMLElement>(element, 'div[data-action="select-stage"][data-id="stage-1"]');
    activeStageCard.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const advanceButton = await waitForElement<HTMLButtonElement>(element, 'button[data-action="advance-stage"]');
    advanceButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await waitForCondition(() => mock.event.tournaments[0]?.currentStageId === "stage-2");
    await waitForText(element, "Actieve fase: Elimination");
  });

  it("saves an explicit bracket phase and ring order", async () => {
    const mock = installEventViewMock();
    const tournament = mock.event.tournaments[0]!;
    const stage = tournament.stages.find((candidate) => candidate.id === "stage-2")!;
    const match = {
      id: "match-1",
      roundId: "round-1",
      arenaId: null,
      entryAId: null,
      entryBId: null,
      winnerEntryId: null,
      scoreA: null,
      scoreB: null,
      ruleset: null,
      scheduledMatch: null,
    };
    stage.rounds = [{ id: "round-1", stageId: stage.id, roundNumber: 0, matches: [match] }];
    const arena = {
      id: "arena-1",
      eventId: mock.event.id,
      name: "Arena A",
      order: 0,
      leftColor: "#21c15b",
      rightColor: "#2f7dfa",
    };
    mock.event.arenas = [arena];
    mock.event.schedule = {
      id: "schedule-1",
      eventId: mock.event.id,
      startTimeMinutes: 540,
      currentTimeSlotId: null,
      timeSlots: [{
        id: "slot-1",
        scheduleId: "schedule-1",
        order: 0,
        durationMinutes: 60,
        label: "Finals",
        color: null,
        isBreak: false,
        scheduledPhases: [{
          id: "phase-1",
          stageId: stage.id,
          arenaId: arena.id,
          timeSlotId: "slot-1",
          stage: {
            ...stage,
            tournament: {
              id: tournament.id,
              eventId: tournament.eventId,
              name: tournament.name,
              color: tournament.color,
            },
          },
          arena,
          assignments: [],
        }],
      }],
    };

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const stageCard = await waitForElement<HTMLElement>(element, 'div[data-action="select-stage"][data-id="stage-2"]');
    stageCard.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();
    const matchesTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-stage-tab"][data-tab="matches"]');
    matchesTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const form = await waitForElement<HTMLFormElement>(element, 'form[data-action="match-schedule"]');
    const phaseSelect = form.querySelector<HTMLSelectElement>('select[name="scheduledPhaseId"]')!;
    const orderInput = form.querySelector<HTMLInputElement>('input[name="order"]')!;
    phaseSelect.value = "phase-1";
    orderInput.value = "3";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitForCondition(() => mock.scheduledMatches.length === 1);
    expect(mock.scheduledMatches).toEqual([{ id: "match-1", scheduledPhaseId: "phase-1", order: 3 }]);
  });

  it("allows adjusting an automatically assigned pool bout order", async () => {
    const mock = installEventViewMock();
    const tournament = mock.event.tournaments[0]!;
    const stage = tournament.stages.find((candidate) => candidate.id === "stage-1")!;
    stage.rounds = [{
      id: "pool-round",
      stageId: stage.id,
      roundNumber: 1,
      matches: [{
        id: "pool-match",
        roundId: "pool-round",
        arenaId: "arena-1",
        entryAId: null,
        entryBId: null,
        winnerEntryId: null,
        scoreA: null,
        scoreB: null,
        ruleset: null,
        scheduledMatch: { scheduledPhaseId: "pool-phase", order: 1 },
      }],
    }];

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();
    const stageCard = await waitForElement<HTMLElement>(element, 'div[data-action="select-stage"][data-id="stage-1"]');
    stageCard.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();
    const matchesTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-stage-tab"][data-tab="matches"]');
    matchesTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const form = await waitForElement<HTMLFormElement>(element, 'form[data-action="match-schedule"]');
    expect(form.querySelector<HTMLInputElement>('input[name="scheduledPhaseId"]')?.value).toBe("pool-phase");
    const orderInput = form.querySelector<HTMLInputElement>('input[name="order"]')!;
    orderInput.value = "3";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitForCondition(() => mock.scheduledMatches.length === 1);
    expect(mock.scheduledMatches).toEqual([{ id: "pool-match", scheduledPhaseId: "pool-phase", order: 3 }]);
  });

  it("activates and refreshes database-mode scoring from the tournament tab", async () => {
    const mock = installEventViewMock();
    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const liveTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-tournament-tab"][data-tab="live"]');
    liveTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await waitForText(element, "Database-mode scoring");

    const activate = await waitForElement<HTMLButtonElement>(element, 'button[data-action="activate-database-live"]');
    activate.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await waitForText(element, "Database-mode actief");
    expect(mock.databaseLiveStatus).toMatchObject({ active: true, liveTournamentId: "live-1", rings: 2, bouts: 3 });

    const project = await waitForElement<HTMLButtonElement>(element, 'button[data-action="project-database-live"]');
    project.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await waitForCondition(() => mock.databaseLiveProjectionCalls === 1);
    expect(mock.databaseLiveProjectionCalls).toBe(1);
  });

  it("loads completed live results and submits an admin correction", async () => {
    const mock = installEventViewMock();
    Object.assign(mock.databaseLiveStatus, { active: true, liveTournamentId: "live-1", rings: 1, bouts: 1 });
    mock.databaseLiveResults.push({
      boutId: "live-bout-1",
      sourceMatchId: "match-1",
      label: "Bout 1",
      fighterLeft: "Alice",
      fighterRight: "Bob",
      score: { left: 1, right: 0, doubles: 0 },
      exchanges: [{
        clientExchangeId: "exchange-1",
        kind: "EXCHANGE",
        leftPoints: 1,
        rightPoints: 0,
        isDouble: false,
        firstScorer: "LEFT",
        round: 1,
      }],
    });
    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();
    const liveTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-tournament-tab"][data-tab="live"]');
    liveTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await waitForText(element, "Bout 1 · 1-0");

    const form = await waitForElement<HTMLFormElement>(element, 'form[data-action="database-live-correction"]');
    form.querySelector<HTMLInputElement>('input[name="leftPoints"]')!.value = "2";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await waitForCondition(() => mock.databaseLiveCorrectionCalls === 1 && mock.lastDatabaseLiveCorrection !== undefined);
    expect(mock.lastDatabaseLiveCorrection).toEqual({
      exchanges: [{
        clientExchangeId: "exchange-1",
        kind: "EXCHANGE",
        leftPoints: 2,
        rightPoints: 0,
        firstScorer: "LEFT",
        round: 1,
      }],
    });
    mock.restore();
    element.remove();
  });

  it("rejects duplicate exchange IDs before submitting a correction", async () => {
    const mock = installEventViewMock();
    Object.assign(mock.databaseLiveStatus, { active: true, liveTournamentId: "live-1", rings: 1, bouts: 1 });
    mock.databaseLiveResults.push({
      boutId: "live-bout-1",
      sourceMatchId: "match-1",
      label: "Bout 1",
      fighterLeft: "Alice",
      fighterRight: "Bob",
      score: { left: 1, right: 0, doubles: 0 },
      exchanges: [
        { clientExchangeId: "exchange-1", kind: "EXCHANGE", leftPoints: 1, rightPoints: 0, isDouble: false, firstScorer: "LEFT", round: 1 },
        { clientExchangeId: "exchange-2", kind: "EXCHANGE", leftPoints: 0, rightPoints: 1, isDouble: false, firstScorer: "RIGHT", round: 1 },
      ],
    });
    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();
    const liveTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-tournament-tab"][data-tab="live"]');
    liveTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    const form = await waitForElement<HTMLFormElement>(element, 'form[data-action="database-live-correction"]');
    const ids = form.querySelectorAll<HTMLInputElement>('input[name="clientExchangeId"]');
    ids[1]!.value = ids[0]!.value;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitForText(element, "Elke exchange moet een unieke ID hebben.");
    expect(mock.databaseLiveCorrectionCalls).toBe(0);
    mock.restore();
    element.remove();
  });

  it("rejects blank correction points instead of treating them as zero", async () => {
    const mock = installEventViewMock();
    Object.assign(mock.databaseLiveStatus, { active: true, liveTournamentId: "live-1", rings: 1, bouts: 1 });
    mock.databaseLiveResults.push({
      boutId: "live-bout-1",
      sourceMatchId: "match-1",
      label: "Bout 1",
      fighterLeft: "Alice",
      fighterRight: "Bob",
      score: { left: 1, right: 0, doubles: 0 },
      exchanges: [{
        clientExchangeId: "exchange-1",
        kind: "EXCHANGE",
        leftPoints: 1,
        rightPoints: 0,
        isDouble: false,
        firstScorer: "LEFT",
        round: 1,
      }],
    });
    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();
    const liveTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-tournament-tab"][data-tab="live"]');
    liveTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    const form = await waitForElement<HTMLFormElement>(element, 'form[data-action="database-live-correction"]');
    form.querySelector<HTMLInputElement>('input[name="leftPoints"]')!.value = "";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await waitForText(element, "Controleer type, punten en ronde van elke exchange.");
    expect(mock.databaseLiveCorrectionCalls).toBe(0);
    mock.restore();
    element.remove();
  });

  it("shows each live ring's table and scoreboard links and who is scoring", async () => {
    const mock = installEventViewMock();
    activateLiveWithRings(mock);
    const element = await openLiveTab({ scoreKeeperUrl: "http://localhost:5174/score-keeper/" });

    const ring = await waitForElement<HTMLElement>(element, 'article.live-ring[data-ring-id="ring-1"]');
    expect(ring.querySelector("[data-ring-keeper-link]")?.getAttribute("link")).toBe("http://localhost:5174/score-keeper/ring/keeper%2Fone");
    expect(ring.querySelector("[data-ring-scoreboard-link]")?.getAttribute("link")).toBe("http://localhost:5174/score-keeper/scoreboard/board-one");
    expect(ring.querySelector("[data-ring-keeper]")?.textContent).toContain("Alice is scoring this ring");
    const second = await waitForElement<HTMLElement>(element, 'article.live-ring[data-ring-id="ring-2"]');
    expect(second.querySelector("[data-ring-keeper]")?.textContent).toContain("Nobody is scoring this ring");
  });

  it("defaults ring links to the same-origin score-keeper app", async () => {
    const mock = installEventViewMock();
    activateLiveWithRings(mock);
    const element = await openLiveTab();

    const ring = await waitForElement<HTMLElement>(element, 'article.live-ring[data-ring-id="ring-2"]');
    expect(ring.querySelector("[data-ring-keeper-link]")?.getAttribute("link")).toBe(`${window.location.origin}/score-keeper/ring/keeper-two`);
  });

  it("makes a new table link only after confirming, naming the current keeper", async () => {
    const mock = installEventViewMock();
    activateLiveWithRings(mock);
    const element = await openLiveTab();
    const messages: string[] = [];
    let answer = false;
    window.confirm = (message?: string) => {
      messages.push(message ?? "");
      return answer;
    };

    clickElement(await waitForElement(element, 'button[data-action="rotate-live-ring-keeper-link"][data-ring-id="ring-1"]'));
    await waitForCondition(() => messages.length === 1);
    await flush();
    expect(messages[0]).toContain("Alice");
    expect(mock.liveRingCalls.rotateKeeper).toEqual([]);

    answer = true;
    clickElement(await waitForElement(element, 'button[data-action="rotate-live-ring-keeper-link"][data-ring-id="ring-1"]'));
    await waitForCondition(() => mock.liveRingCalls.rotateKeeper.length === 1);
    await waitForText(element, "New link made for Ring 1.");
    const ring = await waitForElement<HTMLElement>(element, 'article.live-ring[data-ring-id="ring-1"]');
    expect(ring.querySelector("[data-ring-keeper-link]")?.getAttribute("link")).toContain("/ring/keeper%2Fone-2");
    expect(ring.querySelector("[data-ring-keeper]")?.textContent).toContain("Nobody is scoring this ring");
  });

  it("makes a new scoreboard link after confirming", async () => {
    const mock = installEventViewMock();
    activateLiveWithRings(mock);
    const element = await openLiveTab();
    window.confirm = () => true;

    clickElement(await waitForElement(element, 'button[data-action="rotate-live-ring-scoreboard-link"][data-ring-id="ring-2"]'));
    await waitForCondition(() => mock.liveRingCalls.rotateScoreboard.length === 1);
    expect(mock.liveRingCalls.rotateScoreboard).toEqual(["ring-2"]);
    await waitForText(element, "New link made for Ring 2.");
    const ring = await waitForElement<HTMLElement>(element, 'article.live-ring[data-ring-id="ring-2"]');
    expect(ring.querySelector("[data-ring-scoreboard-link]")?.getAttribute("link")).toContain("/scoreboard/board-two-2");
  });

  it("saves a ring's fighter colours", async () => {
    const mock = installEventViewMock();
    activateLiveWithRings(mock);
    const element = await openLiveTab();

    const form = await waitForElement<HTMLFormElement>(element, 'form[data-action="live-ring-colors"][data-ring-id="ring-1"]');
    form.querySelector<HTMLInputElement>('input[name="leftColor"]')!.value = "#aa0000";
    form.querySelector<HTMLInputElement>('input[name="rightColor"]')!.value = "#0000bb";
    form.requestSubmit();

    await waitForCondition(() => mock.liveRingCalls.colors.length === 1);
    expect(mock.liveRingCalls.colors).toEqual([{ ringId: "ring-1", leftColor: "#aa0000", rightColor: "#0000bb" }]);
    await waitForText(element, "Colours saved for Ring 1.");
  });

  it("rejects invalid ring rules with feedback and saves valid ones", async () => {
    const mock = installEventViewMock();
    activateLiveWithRings(mock);
    const element = await openLiveTab();

    let form = await waitForElement<HTMLFormElement>(element, 'form[data-action="live-ring-rules"]');
    expect(form.querySelector<HTMLInputElement>('input[name="maxDurationSeconds"]')?.value).toBe("180");
    form.querySelector<HTMLInputElement>('input[name="maxDurationSeconds"]')!.value = "0";
    form.querySelector<HTMLInputElement>('input[name="scores"]')!.value = "1, 20";
    form.requestSubmit();
    await waitForText(element, "Round time (seconds): enter a whole number from 1 to 3600.");
    form = await waitForElement<HTMLFormElement>(element, 'form[data-action="live-ring-rules"]');
    expect(form.querySelector('input[name="maxDurationSeconds"]')?.getAttribute("aria-invalid")).toBe("true");
    expect(form.querySelector<HTMLInputElement>('input[name="scores"]')?.value).toBe("1, 20");
    expect(mock.liveRingCalls.rules).toEqual([]);

    form.querySelector<HTMLInputElement>('input[name="maxDurationSeconds"]')!.value = "120";
    form.querySelector<HTMLInputElement>('input[name="scores"]')!.value = "1, 2";
    form.querySelector<HTMLInputElement>('input[name="rounds"]')!.value = "3";
    form.querySelector<HTMLSelectElement>('select[name="overtimeAfter"]')!.value = "EVERY_ROUND";
    form.querySelector<HTMLInputElement>('input[name="suddenDeath"]')!.checked = true;
    form.requestSubmit();

    await waitForCondition(() => mock.liveRingCalls.rules.length === 1);
    expect(mock.liveRingCalls.rules[0]).toMatchObject({
      maxDurationSeconds: 120,
      scores: [1, 2],
      penalties: mock.liveRules.penalties,
      format: { rounds: 3, overtimeAfter: "EVERY_ROUND", suddenDeath: true },
    });
    await waitForText(element, "Rules saved.");
  });

  it("keeps judge skills after updating and removes duplicate judge entries", async () => {
    const mock = installEventViewMock();
    mock.entries.push(
      buildVolunteerEntry("entry-1", "user-1", "Alice", [
        { id: "skill-1", userId: "user-1", skillName: "JUDGE", skillLevel: 2 },
        { id: "skill-2", userId: "user-1", skillName: "JUDGE", skillLevel: 3 },
        { id: "skill-3", userId: "user-1", skillName: "JURY", skillLevel: 1 },
      ]),
    );

    await import("./event-view");
    const element = document.createElement("event-view");
    document.body.appendChild(element);
    await flush();

    const officialsTab = await waitForElement<HTMLButtonElement>(element, 'button[data-action="set-event-tab"][data-tab="officials"]');
    officialsTab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const openVolunteerViewButton = await waitForElement<HTMLButtonElement>(element, 'button[data-action="open-volunteer-view"]');
    openVolunteerViewButton.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await flush();

    const updatedRadio = await waitForElement<HTMLInputElement>(element, '.volunteer-card input[name="judgeSkill"][value="4"]');
    updatedRadio.checked = true;
    updatedRadio.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await waitForCondition(() => (mock.entries[0]?.user.skills ?? []).filter((skill) => skill.skillName === "JUDGE").length === 1);

    const judgeSkills = (mock.entries[0]?.user.skills ?? []).filter((skill) => skill.skillName === "JUDGE");
    expect(judgeSkills).toHaveLength(1);
    expect(judgeSkills[0]?.skillLevel).toBe(4);
    await waitForText(element, "Judge skill");
  });
});

function installEventViewMock() {
  const originalFetch = globalThis.fetch;
  const originalWindowFetch = window.fetch;
  const users: ApiUser[] = [];
  const entries: ApiEntry[] = [];
  const eventId = "event-1";
  const tournamentId = "tournament-1";
  const event = buildEvent();
  const scheduledMatches: Array<{ id: string; scheduledPhaseId: string; order: number }> = [];
  const databaseLiveStatus = { active: false, liveTournamentId: null as string | null, rings: 0, bouts: 0 };
  const databaseLiveResults: Array<{
    boutId: string;
    sourceMatchId: string;
    label: string;
    fighterLeft: string;
    fighterRight: string;
    score: { left: number; right: number; doubles: number };
    exchanges: Array<{
      clientExchangeId: string;
      kind: "EXCHANGE" | "DEDUCTION";
      leftPoints: number;
      rightPoints: number;
      isDouble: boolean;
      firstScorer: "LEFT" | "RIGHT" | null;
      round: number;
    }>;
  }> = [];
  let databaseLiveProjectionCalls = 0;
  let databaseLiveCorrectionCalls = 0;
  let lastDatabaseLiveCorrection: unknown;
  const liveRings: ApiLiveRing[] = [];
  const liveRules: ApiRingRules = {
    maxDurationSeconds: 180,
    scores: [1, 2, 3],
    maxDoubles: 0,
    maxPointsCap: 0,
    penalties: [{ description: "Warning", penalties: [0, 1, 2, 3], disqualify: false }],
    format: { rounds: 1, breakSeconds: 60, lastExchangeSeconds: 0, overtimeAfter: "LAST_ROUND", extensions: 0, extensionSeconds: 60, suddenDeath: false },
  };
  const liveRingCalls = {
    rotateKeeper: [] as string[],
    rotateScoreboard: [] as string[],
    colors: [] as Array<{ ringId: string; leftColor: string; rightColor: string }>,
    rules: [] as unknown[],
  };

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const pathname = new URL(request.url).pathname;

    if (request.method === "GET" && pathname.includes("/events")) {
      return jsonResponse([event]);
    }

    if (request.method === "GET" && pathname.includes("/users")) {
      return jsonResponse(users);
    }

    const databaseLive = pathname.match(/^\/api\/v1\/tournaments\/([^/]+)\/live$/);
    if (databaseLive && databaseLive[1] === tournamentId) {
      if (request.method === "GET") return jsonResponse(databaseLiveStatus);
      if (request.method === "POST") {
        Object.assign(databaseLiveStatus, { active: true, liveTournamentId: "live-1", rings: 2, bouts: 3 });
        return jsonResponse({ id: "live-1", projection: { rings: 2, bouts: 3, removedBouts: 0 } });
      }
    }

    const liveResults = pathname.match(/^\/api\/v1\/tournaments\/([^/]+)\/live\/results$/);
    if (liveResults && liveResults[1] === tournamentId && request.method === "GET") {
      return jsonResponse({ results: databaseLiveResults });
    }

    const liveCorrection = pathname.match(/^\/api\/v1\/live-bouts\/([^/]+)\/correction$/);
    if (liveCorrection && request.method === "POST") {
      databaseLiveCorrectionCalls += 1;
      lastDatabaseLiveCorrection = await request.json();
      return jsonResponse({ revision: 1 });
    }

    const projectLive = pathname.match(/^\/api\/v1\/live-tournaments\/([^/]+)\/project$/);
    if (projectLive && request.method === "POST") {
      databaseLiveProjectionCalls += 1;
      return jsonResponse({ rings: 2, bouts: 3, removedBouts: 0 });
    }

    const liveRingsRoute = pathname.match(/^\/api\/v1\/live-tournaments\/([^/]+)\/rings$/);
    if (liveRingsRoute && request.method === "GET") {
      return jsonResponse({ rings: liveRings });
    }

    const liveRulesRoute = pathname.match(/^\/api\/v1\/live-tournaments\/([^/]+)\/rules$/);
    if (liveRulesRoute && request.method === "PUT") {
      const body = await request.json() as ApiRingRules;
      liveRingCalls.rules.push(body);
      Object.assign(liveRules, body);
      return jsonResponse({ rules: liveRules });
    }

    const liveTournamentRoute = pathname.match(/^\/api\/v1\/live-tournaments\/([^/]+)$/);
    if (liveTournamentRoute && request.method === "GET") {
      return jsonResponse({ id: liveTournamentRoute[1], rules: liveRules, rings: [], bouts: [] });
    }

    const liveRingAction = pathname.match(/^\/api\/v1\/live-rings\/([^/]+)\/(rotate-token|rotate-scoreboard-token|colors)$/);
    if (liveRingAction) {
      const ring = liveRings.find((candidate) => candidate.id === liveRingAction[1]);
      if (!ring) return new Response(JSON.stringify({ error: "Ring not found." }), { status: 404, headers: { "content-type": "application/json" } });
      if (liveRingAction[2] === "rotate-token" && request.method === "POST") {
        liveRingCalls.rotateKeeper.push(ring.id);
        ring.keeperToken = `${ring.keeperToken}-2`;
        ring.activeKeeper = null;
        return jsonResponse({ ring });
      }
      if (liveRingAction[2] === "rotate-scoreboard-token" && request.method === "POST") {
        liveRingCalls.rotateScoreboard.push(ring.id);
        ring.scoreboardToken = `${ring.scoreboardToken}-2`;
        return jsonResponse({ ring });
      }
      if (liveRingAction[2] === "colors" && request.method === "PUT") {
        const body = await request.json() as { leftColor: string; rightColor: string };
        liveRingCalls.colors.push({ ringId: ring.id, ...body });
        Object.assign(ring, body);
        return jsonResponse({ ring });
      }
    }

    const matchSchedule = pathname.match(/^\/api\/v1\/matches\/([^/]+)\/schedule$/);
    if (matchSchedule && request.method === "PUT") {
      const body = await request.json() as { scheduledPhaseId: string; order: number };
      scheduledMatches.push({ id: matchSchedule[1]!, ...body });
      return jsonResponse({
        id: matchSchedule[1],
        roundId: "round-1",
        arenaId: null,
        entryAId: null,
        entryBId: null,
        winnerEntryId: null,
        scoreA: null,
        scoreB: null,
        ruleset: null,
        scheduledMatch: { scheduledPhaseId: body.scheduledPhaseId, order: body.order },
      });
    }

    const userMatch = pathname.match(/^\/api\/v1\/users\/([^/]+)$/);
    if (userMatch) {
      const userId = userMatch[1];
      const user = users.find((candidate) => candidate.id === userId) ?? entries.map((entry) => entry.user).find((candidate) => candidate.id === userId);
      if (!user) {
        throw new Error(`Unexpected user request: ${request.method} ${request.url}`);
      }

      if (request.method === "PATCH") {
        const body = (await request.json()) as Partial<ApiUser>;
        if (typeof body.username === "string") user.username = body.username;
        if (typeof body.judgeVolunteer === "boolean") user.judgeVolunteer = body.judgeVolunteer;
        if (typeof body.juryVolunteer === "boolean") user.juryVolunteer = body.juryVolunteer;
        if (typeof body.tableVolunteer === "boolean") user.tableVolunteer = body.tableVolunteer;
        if (typeof body.otherVolunteer === "boolean") user.otherVolunteer = body.otherVolunteer;
        return jsonResponse(user);
      }
    }

    const skillMatch = pathname.match(/^\/api\/v1\/skills\/([^/]+)$/);
    if (skillMatch) {
      const skillId = skillMatch[1];
      const skill = entries.flatMap((entry) => entry.user.skills ?? []).find((candidate) => candidate.id === skillId);
      if (!skill) {
        throw new Error(`Unexpected skill request: ${request.method} ${request.url}`);
      }

      if (request.method === "PATCH") {
        const body = (await request.json()) as { skillLevel?: number };
        if (typeof body.skillLevel === "number") {
          skill.skillLevel = body.skillLevel;
        }
        return jsonResponse(skill);
      }

      if (request.method === "DELETE") {
        for (const entry of entries) {
          const currentSkills = entry.user.skills ?? [];
          const index = currentSkills.findIndex((candidate) => candidate.id === skillId);
          if (index >= 0) {
            currentSkills.splice(index, 1);
            return new Response(null, { status: 204 });
          }
        }
      }
    }

    if (request.method === "POST" && pathname === "/api/v1/skills") {
      const body = (await request.json()) as { userId: string; skillName: string; skillLevel: number };
      const entry = entries.find((candidate) => candidate.userId === body.userId);
      if (!entry) {
        throw new Error(`Unexpected skill create request: ${request.method} ${request.url}`);
      }

      const skill = {
        id: `skill-${entry.user.skills?.length ?? 0}-${body.skillName.toLowerCase()}`,
        userId: body.userId,
        skillName: body.skillName,
        skillLevel: body.skillLevel,
      };
      entry.user.skills = [...(entry.user.skills ?? []), skill];
      return jsonResponse(skill);
    }

    if (request.method === "POST" && pathname === "/api/v1/users") {
      const body = (await request.json()) as { username: string };
      const user: ApiUser = {
        id: `user-${users.length + 1}`,
        username: body.username,
        judgeVolunteer: false,
        juryVolunteer: false,
        tableVolunteer: false,
        otherVolunteer: false,
      };
      users.push(user);
      return jsonResponse(user);
    }

    const tournamentMatch = pathname.match(/^\/api\/v1\/tournaments\/([^/]+)$/);
    if (tournamentMatch && request.method === "PATCH") {
      if (tournamentMatch[1] !== tournamentId) {
        throw new Error(`Unexpected tournament request: ${request.method} ${request.url}`);
      }
      const body = (await request.json()) as { currentStageId?: string | null };
      if (body.currentStageId !== undefined) {
        event.tournaments[0]!.currentStageId = body.currentStageId;
      }
      return jsonResponse(event.tournaments[0]);
    }

    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  };
  window.fetch = globalThis.fetch;

  function buildEvent(): ApiEvent {
    return {
      id: eventId,
      eventName: "Test event",
      ruleset: null,
      allFightersAreVolunteers: false,
      rulesets: [],
      tournaments: [
        {
          id: tournamentId,
          eventId,
          name: "Open",
          ruleset: null,
          currentStageId: "stage-1",
          order: 0,
          color: "#ffcc00",
          entries,
          stages: [
            {
              id: "stage-1",
              tournamentId,
              type: "POOL",
              name: "Pools",
              ruleset: null,
              minPoolSize: 4,
              maxPoolSize: 6,
              preferredPoolSize: 5,
              eliminationParticipantCount: null,
              timeBetweenMatchesMinutes: 2,
              rounds: [],
              arenas: [],
              officials: [],
            },
            {
              id: "stage-2",
              tournamentId,
              type: "ELIMINATION",
              name: "Elimination",
              ruleset: null,
              minPoolSize: null,
              maxPoolSize: null,
              preferredPoolSize: null,
              eliminationParticipantCount: 8,
              timeBetweenMatchesMinutes: 2,
              rounds: [],
              arenas: [],
              officials: [],
            },
          ],
        },
      ],
      arenas: [],
    };
  }

  return {
    event,
    users,
    entries,
    scheduledMatches,
    databaseLiveStatus,
    databaseLiveResults,
    liveRings,
    liveRules,
    liveRingCalls,
    get databaseLiveProjectionCalls() {
      return databaseLiveProjectionCalls;
    },
    get databaseLiveCorrectionCalls() {
      return databaseLiveCorrectionCalls;
    },
    get lastDatabaseLiveCorrection() {
      return lastDatabaseLiveCorrection;
    },
    restore() {
      globalThis.fetch = originalFetch;
      window.fetch = originalWindowFetch;
    },
  };
}

type EventViewMock = ReturnType<typeof installEventViewMock>;

function activateLiveWithRings(mock: EventViewMock): void {
  Object.assign(mock.databaseLiveStatus, { active: true, liveTournamentId: "live-1", rings: 2, bouts: 0 });
  mock.liveRings.push(
    {
      id: "ring-1",
      tournamentId: "live-1",
      name: "Ring 1",
      order: 0,
      leftColor: "#21c15b",
      rightColor: "#2f7dfa",
      keeperToken: "keeper/one",
      scoreboardToken: "board-one",
      activeKeeper: { userName: "Alice", since: "2026-11-17T10:00:00.000Z" },
    },
    {
      id: "ring-2",
      tournamentId: "live-1",
      name: "Ring 2",
      order: 1,
      leftColor: "#21c15b",
      rightColor: "#2f7dfa",
      keeperToken: "keeper-two",
      scoreboardToken: "board-two",
      activeKeeper: null,
    },
  );
}

/** Mounts `<event-view>` (English) and opens the tournament's live tab. */
async function openLiveTab(options: { scoreKeeperUrl?: string } = {}): Promise<HTMLElement> {
  document.documentElement.lang = "en";
  await import("./event-view");
  const element = document.createElement("event-view");
  if (options.scoreKeeperUrl) element.setAttribute("score-keeper-url", options.scoreKeeperUrl);
  document.body.appendChild(element);
  await flush();
  clickElement(await waitForElement(element, 'button[data-action="set-tournament-tab"][data-tab="live"]'));
  await waitForElement(element, "article.live-ring");
  return element;
}

function clickElement(element: Element): void {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
}

function buildVolunteerEntry(id: string, userId: string, username: string, skills: NonNullable<ApiUser["skills"]>): ApiEntry {
  return {
    id,
    tournamentId: "tournament-1",
    userId,
    kind: "VOLUNTEER",
    seed: null,
    user: {
      id: userId,
      username,
      judgeVolunteer: false,
      juryVolunteer: false,
      tableVolunteer: false,
      otherVolunteer: false,
      skills,
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForElement<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const element = root.querySelector(selector);
    if (element instanceof Element) {
      return element as T;
    }
    await flush();
  }

  throw new Error(`Element not found for selector: ${selector}`);
}

async function waitForText(root: ParentNode, text: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((root.textContent ?? "").includes(text)) {
      return;
    }
    await flush();
  }

  throw new Error(`Text not found: ${text}`);
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await flush();
  }

  throw new Error("Condition not met.");
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
