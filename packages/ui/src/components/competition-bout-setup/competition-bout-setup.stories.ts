import type { SetupPersonView } from "../../models/competition-views.js";
import "./competition-bout-setup.js";

const people: SetupPersonView[] = [
  { userId: "joris", name: "Joris Meijer", clubName: "Zwaardkring Leiden" },
  { userId: "daan", name: "Daan Mulder", clubName: "Ochs Utrecht" },
  { userId: "sanne", name: "Sanne Visser", clubName: "Fechtschule Arnhem" },
  { userId: "lotte", name: "Lotte Smit", clubName: "Ochs Utrecht" },
];

const meta = {
  title: "Components/CompetitionBoutSetup",
  render: () => {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:360px;padding:16px;background:#10161b";
    const setup = document.createElement("competition-bout-setup");
    setup.competitions = [
      { id: "X", name: "Lowlands Longsword Ladder" },
      { id: "Y", name: "Ochs club ladder" },
    ];
    // Stand in for the app: answer the view's requests with sample data.
    setup.addEventListener("setup-competition-chosen", () => {
      setup.fighters = [
        { userId: "tomas", name: "Tomas Kuiper", clubName: "Ochs Utrecht" },
        { userId: "ilse", name: "Ilse Bakker", clubName: "Zwaardkring Leiden" },
      ];
    });
    setup.addEventListener("setup-fighters-chosen", () => {
      setup.otherCompetitions = [{ id: "Y", name: "Ochs club ladder" }];
    });
    setup.addEventListener("people-search-requested", (event) => {
      const query = event.detail.query.toLowerCase();
      setup.peopleResults = people.filter((person) => person.name.toLowerCase().includes(query));
    });
    wrapper.appendChild(setup);
    return wrapper;
  },
};

export default meta;
export const Default = {};
