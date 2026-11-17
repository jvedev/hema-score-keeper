/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the score-keeper app (no trailing slash needed); ring links are `<base>/ring/<token>` and
   * scoreboard links `<base>/scoreboard/<token>`. Defaults to `/score-keeper` on this site's origin, where the
   * production apps are published side by side. Set it in development, where each app runs on its own Vite port
   * (for example `http://localhost:5174/score-keeper`).
   */
  readonly VITE_SCORE_KEEPER_URL?: string;
}
