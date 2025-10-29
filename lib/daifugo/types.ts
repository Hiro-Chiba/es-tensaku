export type Suit = "spade" | "heart" | "diamond" | "club" | "joker";

export interface Card {
  id: string;
  suit: Suit;
  rank: number; // 3-15 (2=15), 16=Joker
}

export type CombinationType =
  | "single"
  | "pair"
  | "triple"
  | "sequence"
  | "bomb";

export interface Combination {
  type: CombinationType;
  cards: Card[];
  strength: number;
}

export interface FieldState {
  currentCombination?: Combination;
  revolution: boolean;
  passesInRow: number;
}

export interface OpponentSummary {
  id: string;
  name: string;
  remainingCards: number;
  lastAction?: "pass" | "play";
}

export interface TableState {
  field: FieldState;
  opponents: OpponentSummary[];
  turnCount: number;
}

export interface Participant {
  id: string;
  name: string;
  isHuman: boolean;
  controller: "human" | "npc";
}

export interface NpcMove {
  action: "play" | "pass";
  combination?: Combination;
  score: number;
  breakdown: Record<string, number>;
  explanation: string;
}
