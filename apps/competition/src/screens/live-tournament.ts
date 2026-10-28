import { escapeHtml, t } from "@hema/ui";
import type { LiveTournamentBout, LiveTournamentFighterView } from "../api-types";
import type { AppContext } from "../app-context";
import { SessionExpiredError } from "../participant-client";

const REFRESH_MS = 7_000;

/** The linked fighter's schedule and the latest imported pool results. */
export async function renderLiveTournamentScreen(container: HTMLElement, context: AppContext, tournamentId: string): Promise<() => void> {
  const initial = await context.client.liveTournamentFighterView(tournamentId);
  container.classList.add("wide");
  container.innerHTML = `<div>
      <p class="eyebrow">${t("liveTournament.kicker")}</p>
      <h1 data-title></h1>
    </div>
    <section class="live-tournament-status panel" aria-live="polite">
      <div><strong data-fighter></strong><span data-updated class="muted"></span></div>
      <button type="button" data-refresh>${t("liveTournament.refresh")}</button>
      <p class="error" data-error role="alert" hidden></p>
    </section>
    <section class="live-push-settings panel">
      <div><strong>${t("liveTournament.notifications")}</strong><p class="muted" data-push-status>${t("liveTournament.pushInfo")}</p></div>
      <button type="button" data-push>${t("liveTournament.enableNotifications")}</button>
      <p class="error" data-push-error role="alert" hidden></p>
    </section>
    <section class="block">
      <h2>${t("liveTournament.schedule")}</h2>
      <div class="live-fixtures" data-schedule></div>
    </section>
    <section class="block">
      <h2>${t("liveTournament.results")}</h2>
      <div class="live-pools" data-pools></div>
    </section>`;

  const title = container.querySelector<HTMLElement>("[data-title]")!;
  const fighter = container.querySelector<HTMLElement>("[data-fighter]")!;
  const updated = container.querySelector<HTMLElement>("[data-updated]")!;
  const error = container.querySelector<HTMLElement>("[data-error]")!;
  const schedule = container.querySelector<HTMLElement>("[data-schedule]")!;
  const pools = container.querySelector<HTMLElement>("[data-pools]")!;
  const refreshButton = container.querySelector<HTMLButtonElement>("[data-refresh]")!;
  const pushButton = container.querySelector<HTMLButtonElement>("[data-push]")!;
  const pushStatus = container.querySelector<HTMLElement>("[data-push-status]")!;
  const pushError = container.querySelector<HTMLElement>("[data-push-error]")!;
  let lastUpdated = Date.now();
  let refreshing = false;

  const draw = (view: LiveTournamentFighterView): void => {
    title.textContent = view.tournament.name;
    fighter.textContent = view.fighter.name;
    updated.textContent = t("liveTournament.updated", { seconds: Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000)) });
    schedule.innerHTML = view.schedule.length === 0
      ? `<p class="muted">${t("liveTournament.noUpcoming")}</p>`
      : view.schedule.map((bout) => fixtureCard(bout)).join("");
    pools.innerHTML = view.pools.length === 0
      ? `<p class="muted">${t("liveTournament.noResults")}</p>`
      : view.pools.map((pool) => `<section class="live-pool">
          <h3>${escapeHtml(pool.name)}</h3>
          <div class="live-fixtures">${pool.bouts.map((bout) => fixtureCard(bout)).join("")}</div>
        </section>`).join("");
  };

  const refresh = async (): Promise<void> => {
    if (refreshing || !container.isConnected) return;
    refreshing = true;
    refreshButton.disabled = true;
    error.hidden = true;
    try {
      const fresh = await context.client.liveTournamentFighterView(tournamentId);
      lastUpdated = Date.now();
      draw(fresh);
    } catch (caught) {
      if (caught instanceof SessionExpiredError) {
        context.sessionExpired();
        return;
      }
      error.textContent = caught instanceof Error ? caught.message : String(caught);
      error.hidden = false;
      updated.textContent = t("liveTournament.stale", { seconds: Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000)) });
    } finally {
      refreshing = false;
      refreshButton.disabled = false;
    }
  };

  draw(initial);
  refreshButton.addEventListener("click", () => void refresh());
  const updatePushButton = async (): Promise<void> => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) {
      pushButton.disabled = true;
      pushStatus.textContent = t("liveTournament.pushUnsupported");
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      pushButton.disabled = true;
      pushStatus.textContent = t("liveTournament.pushUnsupported");
      return;
    }
    const subscription = await registration.pushManager.getSubscription();
    pushButton.textContent = subscription ? t("liveTournament.disableNotifications") : t("liveTournament.enableNotifications");
    if (Notification.permission === "denied") {
      pushButton.disabled = true;
      pushStatus.textContent = t("liveTournament.pushDenied");
    } else {
      pushButton.disabled = false;
      pushStatus.textContent = subscription ? t("liveTournament.pushEnabled") : t("liveTournament.pushInfo");
    }
  };
  const setPush = async (): Promise<void> => {
    pushButton.disabled = true;
    pushError.hidden = true;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error(t("liveTournament.pushUnsupported"));
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await context.client.removePushSubscription(existing.endpoint);
        await existing.unsubscribe();
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          await updatePushButton();
          return;
        }
        const key = await context.client.pushPublicKey();
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(key),
        });
        const keys = subscription.toJSON().keys;
        if (!keys?.p256dh || !keys.auth) throw new Error(t("liveTournament.pushFailed"));
        try {
          await context.client.savePushSubscription({
            endpoint: subscription.endpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
          });
        } catch (error) {
          await subscription.unsubscribe();
          throw error;
        }
      }
    } catch (caught) {
      pushError.textContent = caught instanceof Error ? caught.message : String(caught);
      pushError.hidden = false;
    } finally {
      await updatePushButton();
    }
  };
  const handlePush = (): void => void setPush();
  pushButton.addEventListener("click", handlePush);
  void updatePushButton().catch((caught: unknown) => {
    pushError.textContent = caught instanceof Error ? caught.message : String(caught);
    pushError.hidden = false;
  });
  const timer = window.setInterval(() => void refresh(), REFRESH_MS);
  return () => {
    window.clearInterval(timer);
    pushButton.removeEventListener("click", handlePush);
  };
}

function decodeApplicationServerKey(key: string): Uint8Array<ArrayBuffer> {
  const standard = key.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(standard.padEnd(Math.ceil(standard.length / 4) * 4, "="));
  const decoded = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let index = 0; index < bytes.length; index += 1) decoded[index] = bytes.charCodeAt(index);
  return decoded;
}

function fixtureCard(bout: LiveTournamentBout): string {
  const onDeck = "isOnDeck" in bout && bout.isOnDeck === true;
  const score = bout.score ? `${bout.score.left} : ${bout.score.right}` : "—";
  const state = bout.status === "RUNNING" ? t("liveTournament.inProgress") : bout.status === "DONE" ? t("liveTournament.done") : t("liveTournament.pending");
  const rounds = bout.display?.roundsWon ? ` · ${bout.display.roundsWon.left}–${bout.display.roundsWon.right}` : "";
  return `<article class="live-fixture${onDeck ? " is-on-deck" : ""}" data-state="${bout.status}">
    <div class="live-fixture__meta"><span>${escapeHtml(bout.ringName)}</span><span>${escapeHtml(bout.label)}</span></div>
    ${onDeck ? `<strong class="live-on-deck">${t("liveTournament.onDeck")}</strong>` : ""}
    <div class="live-fixture__fighters">
      <strong>${escapeHtml(bout.fighterLeft)}</strong><span aria-hidden="true">×</span><strong>${escapeHtml(bout.fighterRight)}</strong>
    </div>
    <div class="live-fixture__result"><span>${state}</span><strong>${escapeHtml(score)}${escapeHtml(rounds)}</strong></div>
  </article>`;
}
