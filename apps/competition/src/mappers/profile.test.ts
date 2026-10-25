import { describe, expect, it } from "vitest";
import type { Account, Club } from "../api-types";
import { toProfile } from "./profile";

const clubs: Club[] = [{ id: "club-1", name: "HEMA Utrecht", slug: "hema-utrecht", area: null, countryCode: null }];
const account: Account = { id: "u1", clubId: "club-1", name: "Eva", username: "eva", role: "USER", language: "nl" };

describe("profile", () => {
  it("shows name, username, club and language", () => {
    expect(toProfile(account, clubs)).toEqual({ name: "Eva", username: "eva", clubName: "HEMA Utrecht", language: "nl" });
  });

  it("has no club name without a (known) club, and falls back to English", () => {
    expect(toProfile({ ...account, clubId: null, language: "fr" }, clubs)).toMatchObject({ clubName: null, language: "en" });
    expect(toProfile({ ...account, clubId: "gone" }, clubs).clubName).toBeNull();
  });
});
