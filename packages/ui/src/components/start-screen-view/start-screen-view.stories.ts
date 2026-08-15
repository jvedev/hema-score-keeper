import "./start-screen-view";

const meta = {
  title: "Components/StartScreenView",
  render: () => {
    const element = document.createElement("start-screen-view");
    element.configure({
      loading: false,
      error: null,
      eventOptions: [
        { id: "event-1", name: "Summer Open" },
        { id: "event-2", name: "Winter Cup" },
      ],
      selectedEventId: "event-1",
      arenaOptions: [
        { id: "arena-1", name: "Ring 1" },
        { id: "arena-2", name: "Ring 2" },
      ],
      selectedArenaId: "arena-1",
      activeStageLabel: "Open · Pool",
      fightSummary: "2 fights",
      inactiveMessage: null,
      fights: [
        {
          id: "match-1",
          roundLabel: "Round 1",
          fighterAName: "Alex Meyer",
          fighterBName: "Blake Novak",
          statusLabel: "Ready",
        },
        {
          id: "match-2",
          roundLabel: "Round 1",
          fighterAName: "Casey Silva",
          fighterBName: "Drew Fischer",
          statusLabel: "Ready",
        },
      ],
    });
    return element;
  },
};

export default meta;
export const Default = {};
