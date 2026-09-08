import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ko from "./locales/ko.json";

export const UI_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number]["code"];

const codes = new Set<string>(UI_LANGUAGES.map((l) => l.code));

export function resolveUiLanguage(lng: string): UiLanguage {
  const base = lng.split("-")[0] ?? "en";
  return codes.has(base) ? (base as UiLanguage) : "en";
}

const stored = localStorage.getItem("qwenty-lang");
const start = stored && codes.has(stored)
  ? (stored as UiLanguage)
  : resolveUiLanguage(navigator.language);

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ko: { translation: ko },
  },
  lng: start,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("qwenty-lang", resolveUiLanguage(lng));
  document.documentElement.lang = resolveUiLanguage(lng);
});

document.documentElement.lang = start;

export function generateLanguageLabel(lng: string): string {
  const resolved = resolveUiLanguage(lng);
  return UI_LANGUAGES.find((l) => l.code === resolved)?.label ?? "English";
}
