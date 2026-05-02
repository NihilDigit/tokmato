"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

type Theme = "auto" | "light" | "dark";
type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: "light" | "dark";
};

const ThemeContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "tokmato:theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("auto");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // hydrate from storage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === "light" || saved === "dark" || saved === "auto") {
      setThemeState(saved);
    }
  }, []);

  // apply to html + resolve, also listen for system preference changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const r: "light" | "dark" =
        theme === "auto" ? (mql.matches ? "dark" : "light") : theme;
      setResolved(r);
      const root = document.documentElement;
      if (r === "dark") {
        root.setAttribute("data-theme", "dark");
        root.classList.add("dark");
      } else {
        root.setAttribute("data-theme", "light");
        root.classList.remove("dark");
      }
    };
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, resolvedTheme: resolved }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
