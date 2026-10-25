import "./my-competition-list.js";

const meta = {
  title: "Components/MyCompetitionList",
  render: () => {
    const list = document.createElement("my-competition-list");
    list.style.cssText = "display:grid;max-width:420px";
    list.items = [
      { id: "c1", name: "Lowlands Longsword Ladder", status: "RUNNING", myStatus: "ACTIVE", rank: 3, rating: 1624, lastChange: 16 },
      { id: "c2", name: "Ochs club ladder", status: "RUNNING", myStatus: "ACTIVE", rank: 1, rating: 1710, lastChange: -8 },
      { id: "c3", name: "Winter Open Sabre", status: "REGISTRATION_OPEN", myStatus: "PENDING", rank: null, rating: null, lastChange: null },
      { id: "c4", name: "Old Ladder", status: "CLOSED", myStatus: "LEFT", rank: 5, rating: 990, lastChange: null },
    ];
    return list;
  },
};

export default meta;
export const Default = {};
