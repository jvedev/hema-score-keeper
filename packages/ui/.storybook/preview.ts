import type { Preview } from "@storybook/web-components-vite";
import "../src/styles/tokens.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "scorebox",
      values: [{ name: "scorebox", value: "#0d1117" }],
    },
    layout: "centered",
  },
};

export default preview;
