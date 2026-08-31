export function getBackendApiUrl(): string {
  return import.meta.env.VITE_COMPETITION_API_URL ?? "http://127.0.0.1:3001";
}

export function shouldUseSheetsApi(): boolean {
  return import.meta.env.VITE_USE_SHEETS_API === "true";
}
