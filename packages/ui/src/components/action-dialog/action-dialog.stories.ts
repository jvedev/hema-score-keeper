import "./action-dialog";

const meta = {
  title: "Components/ActionDialog",
  render: () => {
    const element = document.createElement("action-dialog");
    element.setAttribute("heading", "Hit");
    element.setAttribute(
      "description",
      "Select the target area and applicable afterblow rules.",
    );
    requestAnimationFrame(() => element.open());
    return element;
  },
};

export default meta;
export const Default = {};
