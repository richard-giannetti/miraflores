// Light / dark appearance. "auto" follows the device; "light" and "dark" pin it on this device.
// tokens.css and styles.css switch on <html data-theme="light|dark">; no attribute means "follow the device".

export type Theme = "auto" | "light" | "dark";
export const themes: Theme[] = ["auto", "light", "dark"];

// The window-bg of each theme, for the browser / phone status bar.
const barColor = { light: "#ececec", dark: "#323232" };

export const savedTheme = (): Theme => {
  try {
    const saved = localStorage.getItem("theme");
    if (saved && (themes as string[]).includes(saved)) return saved as Theme;
  } catch {}
  return "auto";
};

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  // The two <meta name="theme-color"> tags follow the device; pin both when the theme is pinned.
  const shown = theme === "auto" ? null : barColor[theme];
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.content = shown ?? (m.media.includes("dark") ? barColor.dark : barColor.light);
  });
  try {
    if (theme === "auto") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {}
};
