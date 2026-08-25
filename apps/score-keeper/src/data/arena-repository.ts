import type { Arena } from "@hema/match-engine";

export interface ArenaRepository {
  getArena(arenaId: string): Promise<Arena>;
}
