export function shouldUseMockApi(): boolean {
  return import.meta.env.VITE_USE_MOCK_API !== "false";
}
