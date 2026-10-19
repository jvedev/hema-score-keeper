import { en } from "./messages/en.js";
import { nl } from "./messages/nl.js";

export type Locale = "en" | "nl";
export type MessageKey = keyof typeof en;

/** Fired on window whenever setLocale changes the language; views re-render on it. */
export const LOCALE_CHANGE_EVENT = "hema-locale-change";

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, nl };

/** The page language (`<html lang>`): Dutch for any "nl" variant, English otherwise. */
export function currentLocale(): Locale {
  return document.documentElement.lang.toLowerCase().startsWith("nl") ? "nl" : "en";
}

export function setLocale(locale: Locale): void {
  document.documentElement.lang = locale;
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: { locale } }));
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = catalogs[currentLocale()][key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** "15 Oct 2026, 20:40" / "15 okt 2026, 20:40". `timeZone` exists for tests. */
export function formatDateTime(iso: string, style: "date" | "dateTime" = "dateTime", timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(style === "dateTime" ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
    ...(timeZone ? { timeZone } : {}),
  };
  return new Intl.DateTimeFormat(currentLocale() === "nl" ? "nl-NL" : "en-GB", options).format(new Date(iso));
}

/** "+16", "−14" (a real minus sign), "0". */
export function formatSigned(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return value < 0 ? `−${Math.abs(value)}` : "0";
}
