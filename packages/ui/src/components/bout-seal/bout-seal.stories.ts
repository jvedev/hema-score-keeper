import "./bout-seal.js";

const meta = {
  title: "Components/BoutSeal",
  render: () => `
    <div style="display:flex;gap:24px;align-items:center;font:14px system-ui;color:#e4e9ec">
      <span><bout-seal size="lg"></bout-seal> Scored</span>
      <span><bout-seal size="lg" status="COUNTED" referee-approved fighter-a-approved></bout-seal> Counted</span>
      <span><bout-seal size="lg" status="OBJECTED" referee-approved></bout-seal> Objected</span>
      <span><bout-seal size="lg" status="FINAL"></bout-seal> Final</span>
      <span><bout-seal size="lg" status="VOIDED"></bout-seal> Voided</span>
    </div>`,
};

export default meta;
export const AllStates = {};
