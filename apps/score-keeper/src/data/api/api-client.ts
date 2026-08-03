export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`API request to "${url}" failed with status ${status}.`);
    this.name = "ApiError";
  }
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async get<ResponseType>(path: string): Promise<ResponseType> {
    const url = new URL(path, this.baseUrl);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new ApiError(response.status, url.toString());
    }

    return response.json() as Promise<ResponseType>;
  }
}
