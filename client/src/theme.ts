export type ThemeChoice = "light" | "dark" | "system";

const KEY = "qwenty-theme";

export function readTheme(): ThemeChoice {
  const value = localStorage.getItem(KEY);
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function applyTheme(choice: ThemeChoice): void {
  localStorage.setItem(KEY, choice);
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
