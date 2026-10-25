/**
 * One in-process queue per tournament. Work that touches a tournament's backup.xlsx (an import replacing it,
 * the sync worker rewriting it) runs one task at a time, so a read-modify-write never overlaps a replace.
 */
const queues = new Map<string, Promise<unknown>>();

export function withTournamentLock<T>(tournamentId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(tournamentId) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => undefined);
  queues.set(tournamentId, tail);
  void tail.then(() => {
    if (queues.get(tournamentId) === tail) queues.delete(tournamentId);
  });
  return run;
}
