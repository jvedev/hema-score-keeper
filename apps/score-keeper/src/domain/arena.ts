export interface Arena {
  id: string;
  name: string;
  selectedBout: Bout;
  fighterStyles: {
    left: FighterStyle;
    right: FighterStyle;
  };
}

export interface Bout {
  id: string;
  fighterA: Fighter;
  fighterB: Fighter;
}

export interface Fighter {
  id: string;
  name: string;
}

export interface FighterStyle {
  backgroundColor: string;
  textColor: string;
}
