import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const COOKIE_NAME = "ui_theme";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function readThemeCookie(): Theme {
  const match = document.cookie.match(/(?:^|;\s*)ui_theme=([^;]+)/);
  return match?.[1] === "dark" ? "dark" : "light";
}

function writeThemeCookie(theme: Theme) {
  document.cookie = `${COOKIE_NAME}=${theme}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => readThemeCookie());

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    writeThemeCookie(theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
