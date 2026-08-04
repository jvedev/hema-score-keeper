import "./select-bout-view";

const meta = {
  title: "Components/SelectBoutView",
  render: () => {
    const element = document.createElement("select-bout-view");
    element.configure({
      arenaName: "Arena 1",
      fighterCount: 5,
      bouts: [
        {
          id: "bout-1",
          round: 1,
          fighterAName: "Alex Meyer",
          fighterBName: "Blake Novak",
        },
        {
          id: "bout-2",
          round: 1,
          fighterAName: "Casey Silva",
          fighterBName: "Drew Fischer",
        },
      ],
    });
    return element;
  },
};

export default meta;
export const Default = {};
