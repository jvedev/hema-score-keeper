import "./score-view";

const meta = {
  title: "Views/ScoreView",
  parameters: { layout: "fullscreen" },
  render: () => {
    const element = document.createElement("score-view");
    requestAnimationFrame(() => element.open(150));
    return element;
  },
};

export default meta;
export const Default = {};
