import "./needs-you-list.js";

const meta = {
  title: "Components/NeedsYouList",
  render: () => {
    const list = document.createElement("needs-you-list");
    list.style.cssText = "display:grid;max-width:560px";
    const day = 24 * 60 * 60 * 1000;
    list.items = [
      { kind: "objection", boutId: "b1", competitionName: "Lowlands Ladder", fighterA: "Daan Mulder", fighterB: "Tomas Kuiper", scoreA: 4, scoreB: 6, detail: "Daan objected: last exchange was a double", since: new Date(Date.now() - 2 * day).toISOString() },
      { kind: "awaiting-referee", boutId: "b2", competitionName: "Ochs club ladder", fighterA: "Joris Meijer", fighterB: "Sanne Visser", scoreA: 2, scoreB: 2, detail: "Waiting for Joris Meijer", since: new Date(Date.now() - 4 * day).toISOString() },
    ];
    return list;
  },
};

export default meta;
export const Default = {};
