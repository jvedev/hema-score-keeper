import "./invite-share.js";

const meta = {
  title: "Components/InviteShare",
  render: () => {
    const share = document.createElement("invite-share");
    share.style.cssText = "display:block;max-width:420px";
    share.link = "https://competition.example.org/join/k3J9xQ2mPz";
    return share;
  },
};

export default meta;
export const Default = {};
