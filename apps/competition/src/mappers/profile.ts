import type { Account, Club, Language } from "../api-types";

/** The profile: name and club are shown, not edited (only the language is). */
export interface ProfileView {
  name: string;
  username: string;
  clubName: string | null;
  language: Language;
}

export function toProfile(account: Account, clubs: readonly Club[]): ProfileView {
  return {
    name: account.name,
    username: account.username,
    clubName: account.clubId ? (clubs.find((club) => club.id === account.clubId)?.name ?? null) : null,
    language: account.language === "nl" ? "nl" : "en",
  };
}
