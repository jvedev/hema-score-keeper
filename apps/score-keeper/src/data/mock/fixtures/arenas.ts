import type { Arena } from "../../../domain/arena";

export const arenas: Readonly<Record<string, Arena>> = {
  "arena-1": {
    id: "arena-1",
    name: "Arena 1",
    fighterStyles: {
      left: {
        backgroundColor: "#f8e63a",
        textColor: "#171306",
      },
      right: {
        backgroundColor: "#020621",
        textColor: "#ffffff",
      },
    },
  },
};
