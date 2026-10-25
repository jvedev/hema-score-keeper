import { escapeHtml, t, type MessageKey } from "@hema/ui";
import type { AppContext } from "../app-context";
import { inviteState, joinFailure, joinedMessage, type InviteState } from "../mappers/join";
import type { Translate } from "../mappers/translate";
import type { ParticipantClient, Session } from "../participant-client";
import { href } from "../router";
import { renderAuthPanel } from "./auth";

export async function loadInvite(client: ParticipantClient, code: string): Promise<InviteState> {
  return inviteState(await client.invite(code).catch((caught: unknown) => caught));
}

/** The competition from the invite, with a note when the link or the competition doesn't allow joining. */
/** Exported for tests. */
export function inviteCard(state: InviteState): string {
  const home = `<a class="button" href="${href({ name: "home" })}" data-text="app.goHome"></a>`;
  if (state.kind === "invalid") {
    return `<section class="invite-card"><p class="eyebrow" data-text="app.invited"></p>
      <p class="error" data-text="app.inviteInvalid"></p>${home}</section>`;
  }
  const note = state.kind === "closed" ? `<p class="muted">${escapeHtml(t("app.inviteClosed", { name: state.name }))}</p>${home}` : "";
  return `<section class="invite-card">
      <p class="eyebrow" data-text="app.invited"></p>
      <h1>${escapeHtml(state.name)}</h1>
      <p class="chip">${escapeHtml(t(`lifecycle.${state.status}` as MessageKey))}</p>
      ${note}
    </section>`;
}

/**
 * Signs the fighter up through the invite and lands on the competition.
 * Returns false when it didn't: refused (the reason is toasted) or the login expired (sign-in is shown).
 */
export async function joinWithInvite(context: AppContext, state: InviteState, code: string): Promise<boolean> {
  if (state.kind !== "open") {
    return false;
  }
  try {
    const result = await context.client.signup(state.competitionId, code);
    context.toast(joinedMessage(result, state.name, t as Translate));
  } catch (caught) {
    const failure = joinFailure(caught, t as Translate);
    if (failure.kind === "session-expired") {
      // Back to sign-in; the address bar still holds /join/<code>, so the invite landing comes back.
      context.sessionExpired();
      return false;
    }
    context.toast(failure.message);
    if (failure.kind === "refused") {
      return false;
    }
  }
  context.navigate({ name: "competition", competitionId: state.competitionId }, true);
  return true;
}

/** `/join/:code` for a signed-in fighter: the competition and a Join button. */
export async function renderJoinScreen(container: HTMLElement, context: AppContext, code: string): Promise<void> {
  const state = await loadInvite(context.client, code);
  container.innerHTML = `<div class="panel">${inviteCard(state)}${
    state.kind === "open" ? `<div class="row"><button type="button" class="primary join" data-text="app.join"></button></div>` : ""
  }</div>`;
  relabel(container);
  const button = container.querySelector<HTMLButtonElement>("button.join");
  button?.addEventListener("click", async () => {
    button.disabled = true;
    if (!(await joinWithInvite(context, state, code))) {
      button.disabled = false;
    }
  });
}

/**
 * `/join/:code` for someone who isn't signed in: the competition, then a short sign-up (or sign in).
 * `onSignedIn` gets the session and the invite, and joins in one go.
 */
export async function renderJoinLanding(
  root: HTMLElement,
  client: ParticipantClient,
  code: string,
  onSignedIn: (session: Session, state: InviteState) => Promise<void>,
): Promise<void> {
  root.innerHTML = `<main class="login"><div class="login-card"><p class="loading">${t("app.loading")}</p></div></main>`;
  const card = root.querySelector<HTMLElement>(".login-card")!;
  let state: InviteState;
  try {
    state = await loadInvite(client, code);
  } catch (caught) {
    card.innerHTML = `<p class="error"></p>`;
    card.querySelector(".error")!.textContent = caught instanceof Error ? caught.message : String(caught);
    return;
  }
  card.innerHTML = `${inviteCard(state)}${state.kind === "open" ? `<p class="muted" data-text="app.joinSignInFirst"></p><div class="auth"></div>` : ""}`;
  relabel(card);
  const auth = card.querySelector<HTMLElement>(".auth");
  if (auth) {
    // Someone with an invite most likely has no account yet.
    renderAuthPanel(auth, client, (session) => onSignedIn(session, state), "sign-up");
  }
}

function relabel(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>("[data-text]").forEach((element) => {
    element.textContent = t(element.dataset.text as MessageKey);
  });
}
