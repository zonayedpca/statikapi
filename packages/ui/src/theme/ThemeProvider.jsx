import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const THEME_KEY = 'statik-theme';
const ThemeCtx = createContext({ theme: 'system', setTheme: () => {} });

function apply(theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  const html = document.documentElement;
  html.classList.toggle('dark', dark);
  html.setAttribute('data-theme', theme);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'system';
    } catch {
      return 'system';
    }
  });

  // apply on mount & whenever theme changes
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
    apply(theme);
  }, [theme]);

  // keep in sync if user changes OS theme while in "system"
  useEffect(() => {
    if (theme !== 'system') return;
    const mm = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mm.addEventListener('change', onChange);
    return () => mm.removeEventListener('change', onChange);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme: (t) => setThemeState(t) }), [theme]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
