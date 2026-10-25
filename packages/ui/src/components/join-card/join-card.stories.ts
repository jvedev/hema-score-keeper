import "./join-card.js";
import type { JoinCardView } from "../../models/competition-views.js";

const base: JoinCardView = {
  id: "c1",
  name: "Lowlands Longsword Ladder",
  status: "RUNNING",
  scopeLabel: "Country: Netherlands",
  placesLeft: 5,
  signupsNeedApproval: false,
  myStatus: null,
  joinable: true,
};

const meta = {
  title: "Components/JoinCard",
  render: () => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:grid;gap:12px;max-width:380px";
    for (const view of [
      base,
      { ...base, name: "Winter Open Sabre", status: "REGISTRATION_OPEN", signupsNeedApproval: true, placesLeft: 1 },
      { ...base, myStatus: "PENDING", signupsNeedApproval: true, placesLeft: null },
      { ...base, myStatus: "ACTIVE" },
      { ...base, joinable: false },
    ] as JoinCardView[]) {
      const card = document.createElement("join-card");
      card.competition = view;
      wrap.append(card);
    }
    return wrap;
  },
};

export default meta;
export const AllStates = {};
