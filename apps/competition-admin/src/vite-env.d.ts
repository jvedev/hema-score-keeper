/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string;
  /** Base URL of the participant app (no trailing slash needed); invite links are `<base>/join/<code>`. */
  readonly VITE_PARTICIPANT_APP_URL?: string;
}
