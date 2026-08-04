import type { Arena } from "../../../domain/arena";

export const arenas: Readonly<Record<string, Arena>> = {
  "arena-1": {
    id: "arena-1",
    name: "Arena 1",
    selectedBout: {
      id: "bout-1",
      fighterA: {
        id: "fighter-1",
        name: "Alex Morgan",
      },
      fighterB: {
        id: "fighter-2",
        name: "Sam Taylor",
      },
    },
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
