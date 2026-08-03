import type { ArenaRepository } from "../arena-repository";
import type { Arena } from "../../domain/arena";
import { arenas } from "./fixtures/arenas";

export class MockArenaRepository implements ArenaRepository {
  async getArena(arenaId: string): Promise<Arena> {
    const arena = arenas[arenaId];
    if (!arena) {
      throw new Error(`Mock arena "${arenaId}" does not exist.`);
    }

    return structuredClone(arena);
  }
}
