import "./todo-list.js";

const meta = {
  title: "Components/TodoList",
  render: () => {
    const list = document.createElement("todo-list");
    list.style.cssText = "display:grid;max-width:560px";
    const day = 24 * 60 * 60 * 1000;
    list.items = [
      { kind: "approve", boutId: "b1", competitionName: "Lowlands Ladder", opponentName: "Tomas Kuiper", ownScore: 6, opponentScore: 4, since: new Date(Date.now() - 2 * day).toISOString() },
      { kind: "objection", boutId: "b2", competitionName: "Ochs club ladder", opponentName: "Sanne Visser", ownScore: 2, opponentScore: 5, since: new Date(Date.now() - day).toISOString() },
      { kind: "referee", boutId: "b3", competitionName: "Lowlands Ladder", opponentName: "Joris Meijer – Sanne Visser", ownScore: 3, opponentScore: 3, since: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
    ];
    return list;
  },
};

export default meta;
export const Default = {};
