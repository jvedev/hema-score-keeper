import type { CompetitionListItemView } from "@hema/ui";
import type { CompetitionSummary, NeedsYouResponse } from "../api-types";
import type { Translate } from "./translate";

/** Competitions for the list, with how many of their bouts still wait for someone. */
export function toCompetitionListItems(
  competitions: readonly CompetitionSummary[],
  needs: NeedsYouResponse,
  translate: Translate,
  formatDate: (iso: string) => string,
): CompetitionListItemView[] {
  const open = new Map<string, number>();
  for (const item of [...needs.objections, ...needs.awaitingReferee]) {
    open.set(item.competitionId, (open.get(item.competitionId) ?? 0) + 1);
  }
  return competitions.map((competition) => ({
    id: competition.id,
    name: competition.name,
    status: competition.status,
    scopeLabel: translate(`scope.${competition.scope.kind}`),
    meta: formatDate(competition.date),
    openBouts: open.get(competition.id) ?? 0,
  }));
}
