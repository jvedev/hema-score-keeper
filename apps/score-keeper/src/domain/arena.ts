export interface Arena {
  id: string;
  name: string;
  fighterStyles: {
    left: FighterStyle;
    right: FighterStyle;
  };
}

export interface FighterStyle {
  backgroundColor: string;
  textColor: string;
}
