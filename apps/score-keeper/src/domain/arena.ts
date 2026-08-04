export interface Arena {
  id: string;
  name: string;
  fighters: Fighter[];
  bouts: Bout[];
  fighterStyles: {
    left: FighterStyle;
    right: FighterStyle;
  };
}

export interface Fighter {
  id: string;
  name: string;
}

export interface Bout {
  id: string;
  round: number;
  fighterAId: string;
  fighterBId: string;
  status: "expected" | "in-progress" | "completed";
}

export interface FighterStyle {
  backgroundColor: string;
  textColor: string;
}
