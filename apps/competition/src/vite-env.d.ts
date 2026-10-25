/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API; defaults to /api/v1 (proxied to the backend by the dev server). */
  readonly VITE_API_BASE_URL?: string;
}
