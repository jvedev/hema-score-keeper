import { t } from "@hema/ui";
import type { AppContext } from "../app-context";
import { buildCorrection, toBoutDetailView } from "../mappers/bout";
import type { ObjectionResolution } from "../api-types";

export async function renderObjectionScreen(container: HTMLElement, context: AppContext, boutId: string): Promise<void> {
  const bout = await context.client.bout(boutId);
  if (bout.status !== "OBJECTED") {
    // Already settled (by a co-admin, or the fighter withdrew): show the bout instead.
    context.navigate({ name: "bout", competitionId: bout.competitionIds[0] ?? "", boutId }, true);
    return;
  }
  container.innerHTML = `<button type="button" class="back-link">‹ ${t("admin.needsYou")}</button><objection-review></objection-review>`;
  container.querySelector(".back-link")!.addEventListener("click", () => context.navigate({ name: "needs-you" }));

  const review = container.querySelector("objection-review")!;
  review.bout = toBoutDetailView(bout);

  const resolve = async (body: ObjectionResolution) => {
    review.setBusy(true);
    review.setError(null);
    try {
      await context.client.resolveObjection(boutId, body);
    } catch (error) {
      review.setBusy(false);
      review.setError(error instanceof Error ? error.message : String(error));
      return;
    }
    context.toast(t("admin.objectionResolved"));
    // The objection is resolved; failing to count what's left only decides where to go next.
    const remaining = await context.refreshNeedsYou().catch(() => 1);
    context.navigate(remaining > 0 ? { name: "needs-you" } : { name: "competitions" });
  };
  review.addEventListener("objection-restore-requested", () => void resolve({ kind: "restore" }));
  review.addEventListener("objection-void-requested", (event) => void resolve({ kind: "void", reason: event.detail.reason }));
  review.addEventListener("objection-correct-requested", (event) => void resolve(buildCorrection(bout, event.detail)));
}
