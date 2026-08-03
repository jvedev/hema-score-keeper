import "./score-edit-view";

const meta = {
  title: "Components/ScoreEditView",
  render: () => {
    const element = document.createElement("score-edit-view");
    requestAnimationFrame(() => element.open(3, "Fighter A"));
    return element;
  },
};

export default meta;
export const Default = {};
