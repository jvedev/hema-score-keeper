import { shouldUseMockApi } from "../data/use-mock-api";

export interface CurrentUser {
  email: string;
  displayName: string;
}

let currentUser: CurrentUser | null = shouldUseMockApi()
  ? { email: "you@example.com", displayName: "You" }
  : null;
let currentIdToken: string | null = null;

export function getCurrentUser(): CurrentUser | null {
  return currentUser;
}

export function requireCurrentUser(): CurrentUser {
  if (!currentUser) {
    throw new Error("No signed-in user.");
  }
  return currentUser;
}

export function getIdToken(): string | null {
  return currentIdToken;
}

export function setSession(idToken: string, user: CurrentUser): void {
  currentIdToken = idToken;
  currentUser = user;
}
