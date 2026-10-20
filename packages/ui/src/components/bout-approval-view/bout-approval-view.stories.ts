import "./bout-approval-view.js";

const meta = {
  title: "Components/BoutApprovalView",
  render: () => {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:360px;padding:16px;background:#10161b";
    const view = document.createElement("bout-approval-view");
    view.summary = { fighterA: "Ilse Bakker", fighterB: "Tomas Kuiper", scoreA: 3, scoreB: 5, winnerSide: "B", refereeName: "Joris Meijer" };
    wrapper.appendChild(view);
    return wrapper;
  },
};

export default meta;
export const Default = {};
