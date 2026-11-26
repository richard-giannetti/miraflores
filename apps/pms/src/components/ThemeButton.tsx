import { useEffect, useState } from "react";
import { t, type Lang } from "../lib/i18n";
import { applyTheme, savedTheme, themes, type Theme } from "../lib/theme";
import { Icon, type IconName } from "./Icon";

const icon: Record<Theme, IconName> = { auto: "contrast", light: "today", dark: "moon" };

// One icon button that steps through Automatic → Light → Dark. The choice is kept on this device.
export function ThemeButton({ lang }: { lang: Lang }) {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  useEffect(() => applyTheme(theme), [theme]);
  // Keep every copy of the button (sidebar, top bar, login) in step.
  useEffect(() => {
    const sync = () => setTheme(savedTheme());
    window.addEventListener("themechange", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("themechange", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const next = themes[(themes.indexOf(theme) + 1) % themes.length];
  const label = `${t(lang, "appearance")}: ${t(lang, `theme_${theme}`)}`;
  return (
    <button
      className="icon-btn"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
        window.dispatchEvent(new Event("themechange"));
      }}
      aria-label={label}
      title={label}
    >
      <Icon name={icon[theme]} />
    </button>
  );
}
