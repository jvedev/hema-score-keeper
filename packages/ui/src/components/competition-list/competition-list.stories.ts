import "./competition-list.js";

const meta = {
  title: "Components/CompetitionList",
  render: () => {
    const list = document.createElement("competition-list");
    list.style.cssText = "display:grid;width:300px";
    list.items = [
      { id: "dr1", name: "Spring Rapier Cup", status: "DRAFT", scopeLabel: "Area", meta: "No ruleset yet", openBouts: 0 },
      { id: "reg1", name: "Winter Open Sabre 2026", status: "REGISTRATION_OPEN", scopeLabel: "Open", meta: "13 Dec · 9 signed up", openBouts: 0 },
      { id: "run1", name: "Lowlands Longsword Ladder", status: "RUNNING", scopeLabel: "Country", meta: "48 fighters", openBouts: 3 },
      { id: "run2", name: "Ochs club ladder", status: "RUNNING", scopeLabel: "Club", meta: "14 fighters", openBouts: 2 },
      { id: "cl1", name: "Summer Messer Day", status: "CLOSED", scopeLabel: "Area", meta: "Jul 2026 · 22 fighters", openBouts: 0 },
      { id: "arc1", name: "Old Ladder", status: "ARCHIVED", scopeLabel: "Club", meta: "2024", openBouts: 0 },
    ];
    list.setAttribute("selected", "run1");
    return list;
  },
};

export default meta;
export const Default = {};
