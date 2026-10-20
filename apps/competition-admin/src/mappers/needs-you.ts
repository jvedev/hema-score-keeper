import type { NeedsYouItemView } from "@hema/ui";
import type { NeedsYouResponse } from "../api-types";
import type { Route } from "../router";
import type { Translate } from "./translate";

export function needsYouCount(needs: NeedsYouResponse): number {
  return needs.objections.length + needs.awaitingReferee.length;
}

/** The app opens on "Needs you" only when something needs the admin. */
export function startRoute(needs: NeedsYouResponse): Route {
  return needsYouCount(needs) > 0 ? { name: "needs-you" } : { name: "competitions" };
}

export function toNeedsYouItems(needs: NeedsYouResponse, translate: Translate): NeedsYouItemView[] {
  return [
    ...needs.objections.map((item): NeedsYouItemView => {
      const name = item.objectedBy === "A" ? item.fighterA : item.fighterB;
      return {
        kind: "objection",
        boutId: item.boutId,
        competitionName: item.competitionName,
        fighterA: item.fighterA,
        fighterB: item.fighterB,
        scoreA: item.scoreA,
        scoreB: item.scoreB,
        detail: item.reason ? translate("admin.objectedBy", { name, reason: item.reason }) : translate("admin.objectedNoReason", { name }),
        since: item.objectedAt,
      };
    }),
    ...needs.awaitingReferee.map(
      (item): NeedsYouItemView => ({
        kind: "awaiting-referee",
        boutId: item.boutId,
        competitionName: item.competitionName,
        fighterA: item.fighterA,
        fighterB: item.fighterB,
        scoreA: item.scoreA,
        scoreB: item.scoreB,
        detail: translate("admin.waitingFor", { name: item.refereeName }),
        since: item.recordedAt,
      }),
    ),
  ];
}
