import "./warning-view";

const meta = {
  title: "Views/WarningView",
  parameters: { layout: "fullscreen" },
  render: () => {
    const element = document.createElement("warning-view");
    element.configure({
      fighterA: {
        name: "Fighter A",
        backgroundColor: "#f8e277",
        textColor: "#171306",
      },
      fighterB: {
        name: "Fighter B",
        backgroundColor: "#020621",
        textColor: "#ffffff",
      },
      penalties: [
        {
          description: "Unsportsmanlike conduct",
          penalties: [0, 1, 2, 3],
          disqualify: true,
        },
      ],
    });
    requestAnimationFrame(() => element.open(30));
    return element;
  },
};

export default meta;
export const Default = {};
