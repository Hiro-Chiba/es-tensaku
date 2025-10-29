import {
  DaifugoNpc,
  ensureNpcParticipants,
  buildCombination,
  createCard
} from "@/lib/daifugo";
import type { Card, FieldState, Participant, TableState } from "@/lib/daifugo";

function createTableState(field: Partial<FieldState>, opponents: TableState["opponents"]): TableState {
  return {
    field: {
      currentCombination: undefined,
      revolution: false,
      passesInRow: 0,
      ...field
    },
    opponents,
    turnCount: 1
  };
}

describe("ensureNpcParticipants", () => {
  it("fills the seats with Japanese NPC names", () => {
    const humans: Participant[] = [
      { id: "p1", name: "プレイヤー1", isHuman: true, controller: "human" }
    ];
    const randomValues = [0.1, 0.7, 0.2, 0.9];
    let index = 0;
    const random = () => {
      const value = randomValues[index % randomValues.length];
      index += 1;
      return value;
    };
    const players = ensureNpcParticipants(humans, 4, random);
    expect(players).toHaveLength(4);
    const npcNames = players.filter((player) => !player.isHuman).map((player) => player.name);
    const uniqueNames = new Set(npcNames);
    expect(uniqueNames.size).toBe(npcNames.length);
    expect(npcNames[0]).toMatch(/\s/);
  });
});

describe("DaifugoNpc", () => {
  const opponents = [
    { id: "r1", name: "対戦相手A", remainingCards: 5 },
    { id: "r2", name: "対戦相手B", remainingCards: 6 }
  ];

  it("prefers strong shedding combinations such as sequences", () => {
    const npc = new DaifugoNpc("npc-1", "戦略家NPC");
    const hand: Card[] = [
      createCard(5, "heart"),
      createCard(6, "heart"),
      createCard(7, "heart"),
      createCard(9, "club"),
      createCard(9, "diamond")
    ];
    const state = createTableState({}, opponents);
    const move = npc.chooseMove(hand, state);
    expect(move.action).toBe("play");
    expect(move.combination?.type).toBe("sequence");
    expect(move.combination?.cards).toHaveLength(3);
    expect(move.breakdown.shape).toBeGreaterThan(10);
  });

  it("passes when no legal move is available", () => {
    const npc = new DaifugoNpc("npc-2", "慎重派NPC");
    const hand: Card[] = [createCard(3, "club"), createCard(4, "diamond")];
    const opponentCard = createCard(11, "spade");
    const fieldCombination = buildCombination("single", [opponentCard], false);
    const field: FieldState = {
      currentCombination: fieldCombination,
      revolution: false,
      passesInRow: 1
    };
    const state = createTableState(field, opponents);
    const move = npc.chooseMove(hand, state);
    expect(move.action).toBe("pass");
  });
});
