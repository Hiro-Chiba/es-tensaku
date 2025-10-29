import { generateJapaneseNpcName } from "./names";
import type { Card, Combination, FieldState, NpcMove, Participant, TableState } from "./types";
import {
  combinationPriority,
  describeCombination,
  generateAllPotentialCombinations,
  generateLegalCombinations,
  getRankWeight,
  removeCards,
  stringifyCards
} from "./utils";

interface EvaluatedMove {
  combination: Combination;
  score: number;
  breakdown: Record<string, number>;
  explanation: string;
}

function estimateMinimumTurns(hand: Card[], revolution: boolean, memo = new Map<string, number>()): number {
  if (hand.length === 0) {
    return 0;
  }
  const key = `${revolution ? "R" : "N"}:${stringifyCards(hand)}`;
  const cached = memo.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const combinations = generateAllPotentialCombinations(hand, revolution);
  let best = hand.length;
  for (const combo of combinations) {
    const rest = removeCards(hand, combo.cards);
    const turns = 1 + estimateMinimumTurns(rest, revolution, memo);
    if (turns < best) {
      best = turns;
    }
  }
  memo.set(key, best);
  return best;
}

function computeControlScore(combo: Combination, hand: Card[], field: FieldState): number {
  const revolution = field.revolution;
  const highestInHand = hand.reduce((max, card) => Math.max(max, getRankWeight(card.rank, revolution)), 0);
  const highestInCombo = combo.cards.reduce((max, card) => Math.max(max, getRankWeight(card.rank, revolution)), 0);
  const ratio = highestInCombo / Math.max(1, highestInHand);
  let control = ratio * 12;
  if (!field.currentCombination) {
    control += 4;
  }
  if (combo.type === "bomb") {
    control += 8;
  }
  if (combo.type === "sequence" && combo.cards.length >= 4) {
    control += 5;
  }
  return control;
}

function computePressureScore(combo: Combination, state: TableState): number {
  const criticalOpponents = state.opponents.filter((opponent) => opponent.remainingCards <= 3);
  if (criticalOpponents.length === 0) {
    return 0;
  }
  let score = 0;
  for (const opponent of criticalOpponents) {
    const urgency = 12 - opponent.remainingCards * 2;
    score += urgency;
  }
  if (combo.type !== "single") {
    score += 3;
  }
  if (combo.type === "bomb") {
    score += 6;
  }
  return score;
}

function computeShapeScore(combo: Combination, remainingTurns: number): number {
  const coverage = combinationPriority[combo.type] * 6 + combo.cards.length * 2;
  const smoothness = Math.max(0, 12 - remainingTurns * 2);
  return coverage + smoothness - remainingTurns * 1.3;
}

function computeEndgameBonus(remaining: Card[], opponents: TableState["opponents"]): number {
  if (remaining.length === 0) {
    return 120;
  }
  if (opponents.length === 0) {
    return remaining.length <= 2 ? 20 : 0;
  }
  const smallestOpponent = Math.min(...opponents.map((opponent) => opponent.remainingCards));
  if (remaining.length <= 2 && smallestOpponent > remaining.length) {
    return 25;
  }
  if (remaining.length <= 4) {
    return 12;
  }
  return 0;
}

function evaluateCombination(hand: Card[], combo: Combination, state: TableState): EvaluatedMove {
  const remaining = removeCards(hand, combo.cards);
  const revolution = state.field.revolution;
  const memo = new Map<string, number>();
  const remainingTurns = estimateMinimumTurns(remaining, revolution, memo);
  const shapeScore = computeShapeScore(combo, remainingTurns);
  const controlScore = computeControlScore(combo, hand, state.field);
  const pressureScore = computePressureScore(combo, state);
  const endgameBonus = computeEndgameBonus(remaining, state.opponents);
  const total = shapeScore + controlScore + pressureScore + endgameBonus;
  const explanation = `${describeCombination(combo)} を選択。残り手数予測: ${remainingTurns} 手`;
  return {
    combination: combo,
    score: total,
    breakdown: {
      shape: shapeScore,
      control: controlScore,
      pressure: pressureScore,
      endgame: endgameBonus
    },
    explanation
  };
}

function evaluatePass(state: TableState): EvaluatedMove {
  const threat = state.opponents.reduce((acc, opponent) => {
    if (opponent.remainingCards <= 2) {
      return acc + 18;
    }
    if (opponent.remainingCards <= 4) {
      return acc + 10;
    }
    if (opponent.remainingCards <= 7) {
      return acc + 4;
    }
    return acc;
  }, 0);
  const patience = Math.max(0, 12 - state.field.passesInRow * 3);
  const score = patience - threat;
  return {
    combination: {
      type: "single",
      cards: [],
      strength: 0
    },
    score,
    breakdown: {
      patience,
      threat: -threat
    },
    explanation: "今回はパスして様子を見る"
  };
}

export class DaifugoNpc {
  constructor(public readonly id: string, public readonly name: string) {}

  chooseMove(hand: Card[], state: TableState): NpcMove {
    const legal = generateLegalCombinations(hand, state.field);
    if (legal.length === 0) {
      const pass = evaluatePass(state);
      return {
        action: "pass",
        score: pass.score,
        breakdown: pass.breakdown,
        explanation: pass.explanation
      };
    }
    const evaluations = legal.map((combo) => evaluateCombination(hand, combo, state));
    evaluations.sort((a, b) => b.score - a.score);
    const best = evaluations[0];
    const passScore = evaluatePass(state).score;
    if (best.score <= passScore + 2) {
      return {
        action: "pass",
        score: passScore,
        breakdown: {
          patience: passScore
        },
        explanation: "強い手がないためパス"
      };
    }
    return {
      action: "play",
      combination: best.combination,
      score: best.score,
      breakdown: best.breakdown,
      explanation: best.explanation
    };
  }
}

let npcSequence = 0;

function generateNpcId(): string {
  npcSequence += 1;
  return `npc-${npcSequence.toString(36)}`;
}

export function ensureNpcParticipants(
  participants: Participant[],
  desiredCount: number,
  random = Math.random
): Participant[] {
  const result = [...participants];
  const usedNames = new Set(participants.map((player) => player.name));
  while (result.length < desiredCount) {
    const name = generateJapaneseNpcName(usedNames, random);
    result.push({
      id: generateNpcId(),
      name,
      isHuman: false,
      controller: "npc"
    });
  }
  return result;
}
