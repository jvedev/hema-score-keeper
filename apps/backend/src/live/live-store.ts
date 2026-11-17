import type { Selectable } from "kysely";
import type { BackendDatabase, DbExecutor } from "../db.js";

export type LiveExchangeRow = Selectable<BackendDatabase["LiveExchange"]>;

/** The exchanges that count for a bout (not undone), in the order they were scored. */
export async function activeExchanges(db: DbExecutor, boutId: string): Promise<LiveExchangeRow[]> {
  return db
    .selectFrom("LiveExchange")
    .selectAll()
    .where("boutId", "=", boutId)
    .where("undoneAt", "is", null)
    .orderBy("seq")
    .execute();
}
