const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");

export async function fetchSheetValues(
  spreadsheetId: string,
  range = "A1:ZZ1000",
): Promise<string[][]> {
  const url = `${baseUrl}/google-sheets/values?${new URLSearchParams({ spreadsheetId, range })}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Unable to read the sheet (status ${response.status}).`);
  }
  const data = (await response.json()) as { values?: string[][] };
  return data.values ?? [];
}

export async function writeSheetValues(
  spreadsheetId: string,
  range: string,
  values: unknown[][],
): Promise<void> {
  const response = await fetch(`${baseUrl}/google-sheets/values`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spreadsheetId, range, values }),
  });
  if (!response.ok) {
    throw new Error(`Unable to write to the sheet (status ${response.status}).`);
  }
}
