/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the participant app (no trailing slash needed); invite links are `<base>/join/<code>`. */
  readonly VITE_PARTICIPANT_APP_URL?: string;
  /** Base URL of the score-keeper app (no trailing slash needed); ring links are `<base>/ring/<token>`. */
  readonly VITE_SCORE_KEEPER_URL?: string;
}
