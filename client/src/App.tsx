import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Guess } from "./pages/Guess";
import { Home } from "./pages/Home";
import { InvalidShare } from "./pages/InvalidShare";
import { resolveUiLanguage, UI_LANGUAGES } from "./i18n";
import {
  buildShareFragment,
  parseShareFragment,
  shareIdentity,
  type SharePayload,
} from "./share";
import { applyTheme, readTheme, type ThemeChoice } from "./theme";

type Screen =
  | { kind: "home" }
  | { kind: "guess"; payload: SharePayload }
  | { kind: "invalid" };

function screenFromParse(
  parsed: Awaited<ReturnType<typeof parseShareFragment>>,
): Screen {
  if (parsed.kind === "empty") return { kind: "home" };
  if (parsed.kind === "invalid") return { kind: "invalid" };
  return { kind: "guess", payload: parsed.payload };
}

function screenKey(screen: Screen | null): string {
  if (!screen) return "";
  if (screen.kind === "guess") return `guess:${shareIdentity(screen.payload)}`;
  return screen.kind;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<ThemeChoice>(() => readTheme());
  const [screen, setScreen] = useState<Screen | null>(() =>
    window.location.hash ? null : { kind: "home" },
  );

  useEffect(() => {
    let cancelled = false;
    async function applyHash() {
      const parsed = await parseShareFragment(window.location.hash);
      if (!cancelled) setScreen(screenFromParse(parsed));
    }
    void applyHash();
    const onHash = () => void applyHash();
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);

  const homeHref = window.location.pathname + window.location.search;

  function navigate(next: Screen, url: string) {
    if (screenKey(screen) && screenKey(screen) !== screenKey(next)) {
      history.pushState(null, "", url);
    } else {
      history.replaceState(null, "", url);
    }
    setScreen(next);
  }

  async function play(payload: SharePayload) {
    const url = new URL(window.location.href);
    url.hash = await buildShareFragment(payload);
    navigate({ kind: "guess", payload }, url.toString());
  }

  return (
    <div className={`app${screen?.kind === "guess" ? " app-guess" : ""}`}>
      <header className="header">
        <div className="header-copy">
          <h1>
            <a
              className="brand"
              href={homeHref}
              onClick={(e) => {
                if (
                  e.button !== 0 ||
                  e.metaKey ||
                  e.ctrlKey ||
                  e.shiftKey ||
                  e.altKey
                ) {
                  return;
                }
                e.preventDefault();
                navigate({ kind: "home" }, homeHref);
              }}
            >
              {t("title")}
            </a>
          </h1>
          <p className="tagline">{t("tagline")}</p>
        </div>
        <div className="toolbar">
          <label className="lang-select">
            <select
              aria-label={t("language")}
              value={resolveUiLanguage(i18n.language)}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
            >
              {UI_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
          <div className="seg" aria-label={t("theme")}>
            {(["light", "dark", "system"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={theme === choice}
                onClick={() => {
                  setTheme(choice);
                  applyTheme(choice);
                }}
              >
                {t(
                  choice === "light"
                    ? "themeLight"
                    : choice === "dark"
                      ? "themeDark"
                      : "themeSystem",
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {screen && (
        <div hidden={screen.kind !== "home"}>
          <Home onPlay={(payload) => void play(payload)} />
        </div>
      )}
      {screen?.kind === "guess" && (
        <Guess
          key={shareIdentity(screen.payload)}
          payload={screen.payload}
        />
      )}
      {screen?.kind === "invalid" && <InvalidShare />}
    </div>
  );
}
