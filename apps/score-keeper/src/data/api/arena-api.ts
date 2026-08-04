import type { ArenaRepository } from "../arena-repository";
import type { Arena } from "../../domain/arena";
import { ApiClient } from "./api-client";

interface ArenaResponse {
  id: string;
  name: string;
  fighters: Array<{
    id: string;
    name: string;
  }>;
  bouts: Array<{
    id: string;
    round: number;
    fighterAId: string;
    fighterBId: string;
    status: "expected" | "in-progress" | "completed";
  }>;
  fighterStyles: {
    left: {
      backgroundColor: string;
      textColor: string;
    };
    right: {
      backgroundColor: string;
      textColor: string;
    };
  };
}

export class ArenaApi implements ArenaRepository {
  constructor(private readonly client: ApiClient) {}

  async getArena(arenaId: string): Promise<Arena> {
    const response = await this.client.get<ArenaResponse>(
      `/api/v1/arena/${encodeURIComponent(arenaId)}`,
    );

    return {
      id: response.id,
      name: response.name,
      fighters: response.fighters.map((fighter) => ({ ...fighter })),
      bouts: response.bouts.map((bout) => ({ ...bout })),
      fighterStyles: {
        left: {
          backgroundColor: response.fighterStyles.left.backgroundColor,
          textColor: response.fighterStyles.left.textColor,
        },
        right: {
          backgroundColor: response.fighterStyles.right.backgroundColor,
          textColor: response.fighterStyles.right.textColor,
        },
      },
    };
  }
}
