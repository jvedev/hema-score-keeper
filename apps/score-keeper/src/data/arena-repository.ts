import type { Arena } from "../domain/arena";

export interface ArenaRepository {
  getArena(arenaId: string): Promise<Arena>;
}
