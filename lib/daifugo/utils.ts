import type { Card, Combination, CombinationType, FieldState, Suit } from "./types";

const RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const NORMAL_WEIGHT = new Map<number, number>();
const REVOLUTION_WEIGHT = new Map<number, number>();

for (const [index, rank] of RANKS.entries()) {
  NORMAL_WEIGHT.set(rank, index + 1);
  if (rank === 16) {
    REVOLUTION_WEIGHT.set(rank, RANKS.length + 1);
  } else {
    REVOLUTION_WEIGHT.set(rank, RANKS.length - index);
  }
}

export const combinationPriority: Record<CombinationType, number> = {
  single: 1,
  pair: 2,
  triple: 3,
  sequence: 3,
  bomb: 5
};

let cardSequence = 0;

function generateCardId(): string {
  cardSequence += 1;
  return `card-${cardSequence.toString(36)}`;
}

export function createCard(rank: number, suit: Suit): Card {
  return {
    id: generateCardId(),
    rank,
    suit
  };
}

export function cloneCards(cards: Card[]): Card[] {
  return cards.map((card) => ({ ...card }));
}

export function getRankWeight(rank: number, revolution: boolean): number {
  if (revolution) {
    return REVOLUTION_WEIGHT.get(rank) ?? rank;
  }
  return NORMAL_WEIGHT.get(rank) ?? rank;
}

export function sortCards(cards: Card[], revolution: boolean): Card[] {
  return [...cards].sort((a, b) => getRankWeight(a.rank, revolution) - getRankWeight(b.rank, revolution));
}

export function stringifyCards(cards: Card[]): string {
  return cards
    .slice()
    .sort((a, b) => (a.rank - b.rank !== 0 ? a.rank - b.rank : a.suit.localeCompare(b.suit)))
    .map((card) => `${card.rank}${card.suit}`)
    .join("|");
}

export function removeCards(hand: Card[], cardsToRemove: Card[]): Card[] {
  const ids = new Set(cardsToRemove.map((card) => card.id));
  return hand.filter((card) => !ids.has(card.id));
}

export function groupByRank(cards: Card[]): Map<number, Card[]> {
  const map = new Map<number, Card[]>();
  for (const card of cards) {
    const bucket = map.get(card.rank);
    if (bucket) {
      bucket.push(card);
    } else {
      map.set(card.rank, [card]);
    }
  }
  return map;
}

export function buildCombination(type: CombinationType, cards: Card[], revolution: boolean): Combination {
  const sorted = sortCards(cards, revolution);
  const strength = sorted.reduce((acc, card) => acc + getRankWeight(card.rank, revolution), 0) / sorted.length;
  return {
    type,
    cards: sorted,
    strength
  };
}

export function combinationBeats(candidate: Combination, current: Combination, revolution: boolean): boolean {
  if (candidate.type === "bomb" && current.type !== "bomb") {
    return true;
  }
  if (candidate.type !== current.type) {
    return false;
  }
  if (candidate.cards.length !== current.cards.length) {
    return false;
  }
  const candidateStrength = candidate.cards[candidate.cards.length - 1];
  const currentStrength = current.cards[current.cards.length - 1];
  return getRankWeight(candidateStrength.rank, revolution) > getRankWeight(currentStrength.rank, revolution);
}

export function generateSingleCombinations(hand: Card[], revolution: boolean): Combination[] {
  return hand.map((card) => buildCombination("single", [card], revolution));
}

export function generateGroupCombinations(hand: Card[], size: number, type: CombinationType, revolution: boolean): Combination[] {
  const groups = groupByRank(hand);
  const combinations: Combination[] = [];
  for (const cards of groups.values()) {
    if (cards.length >= size) {
      const selected = cards.slice(0, size);
      combinations.push(buildCombination(type, selected, revolution));
    }
  }
  return combinations;
}

export function generateSequenceCombinations(hand: Card[], revolution: boolean): Combination[] {
  const perSuit = new Map<Suit, Card[]>();
  for (const card of hand) {
    if (card.suit === "joker" || card.rank >= 15) continue; // Jokerと2は階段に使わない
    const cards = perSuit.get(card.suit) ?? [];
    cards.push(card);
    perSuit.set(card.suit, cards);
  }
  const combinations: Combination[] = [];
  for (const cards of perSuit.values()) {
    const sorted = sortCards(cards, revolution);
    for (let i = 0; i < sorted.length; i += 1) {
      const sequence = [sorted[i]];
      let lastRank = sorted[i].rank;
      for (let j = i + 1; j < sorted.length; j += 1) {
        const card = sorted[j];
        if (card.rank === lastRank) {
          continue;
        }
        if (card.rank === lastRank + 1) {
          sequence.push(card);
          lastRank = card.rank;
        } else {
          break;
        }
        if (sequence.length >= 3) {
          combinations.push(buildCombination("sequence", [...sequence], revolution));
        }
      }
    }
  }
  return combinations;
}

export function generateAllPotentialCombinations(hand: Card[], revolution: boolean): Combination[] {
  const singles = generateSingleCombinations(hand, revolution);
  const pairs = generateGroupCombinations(hand, 2, "pair", revolution);
  const triples = generateGroupCombinations(hand, 3, "triple", revolution);
  const bombs = generateGroupCombinations(hand, 4, "bomb", revolution);
  const sequences = generateSequenceCombinations(hand, revolution);
  const unique = new Map<string, Combination>();
  for (const combo of [...singles, ...pairs, ...triples, ...sequences, ...bombs]) {
    const key = `${combo.type}:${stringifyCards(combo.cards)}`;
    if (!unique.has(key)) {
      unique.set(key, combo);
    }
  }
  return [...unique.values()];
}

export function generateLegalCombinations(hand: Card[], field: FieldState): Combination[] {
  const revolution = field.revolution;
  const allCombos = generateAllPotentialCombinations(hand, revolution);
  if (!field.currentCombination) {
    return allCombos;
  }
  const legal: Combination[] = [];
  for (const combo of allCombos) {
    if (combo.type === "bomb" && field.currentCombination.type !== "bomb") {
      legal.push(combo);
      continue;
    }
    if (combinationBeats(combo, field.currentCombination, revolution)) {
      legal.push(combo);
    }
  }
  return legal;
}

export function describeCombination(combination: Combination): string {
  const names: Record<CombinationType, string> = {
    single: "シングル",
    pair: "ペア",
    triple: "トリプル",
    sequence: "階段",
    bomb: "ボム"
  };
  const cards = combination.cards.map((card) => `${card.rank}${card.suit[0].toUpperCase()}`).join(", ");
  return `${names[combination.type]}: ${cards}`;
}
