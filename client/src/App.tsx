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
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  function goHome() {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setScreen({ kind: "home" });
  }

  async function play(payload: SharePayload) {
    const url = new URL(window.location.href);
    url.hash = await buildShareFragment(payload);
    history.replaceState(null, "", url.toString());
    setScreen({ kind: "guess", payload });
  }

  return (
    <div className={`app${screen?.kind === "guess" ? " app-guess" : ""}`}>
      <header className="header">
        <div className="header-copy">
          <a
            className="brand"
            href={window.location.pathname}
            onClick={(e) => {
              e.preventDefault();
              goHome();
            }}
          >
            <h1>{t("title")}</h1>
          </a>
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

      {screen?.kind === "home" && <Home onPlay={(payload) => void play(payload)} />}
      {screen?.kind === "guess" && (
        <Guess
          key={shareIdentity(screen.payload)}
          payload={screen.payload}
          onHome={goHome}
        />
      )}
      {screen?.kind === "invalid" && <InvalidShare onHome={goHome} />}
    </div>
  );
}
