import type { Arena } from "../../../domain/arena";

export const arenas: Readonly<Record<string, Arena>> = {
  "arena-1": {
    id: "arena-1",
    name: "Arena 1",
    fighterStyles: {
      left: {
        backgroundColor: "#3a8cf8",
        textColor: "#e4e4e5",
      },
      right: {
        backgroundColor: "#ec0b29",
        textColor: "#020621",
      },
    },
  },
};
