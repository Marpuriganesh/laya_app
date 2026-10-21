import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from "react";
import { resolveTheme, getNextTheme, isValidTheme, type Theme } from "./theme_utils";

export type { Theme };

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export interface ThemeProviderState {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const initialState: ThemeProviderState = {
  theme: "dark",
  resolvedTheme: "dark",
  setTheme: () => null,
  toggleTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export const ThemeProvider: FC<ThemeProviderProps> = ({
  children,
  defaultTheme = "dark",
  storageKey = "sketch-app-theme",
}) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(storageKey);
        if (isValidTheme(stored)) {
          return stored;
        }
      } catch {
        // localStorage might be unavailable or restricted
      }
    }
    return defaultTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const isSystemDark =
        window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
      return resolveTheme(theme, isSystemDark);
    }
    return "dark";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    const isSystemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
    const active = resolveTheme(theme, isSystemDark);

    root.classList.add(active);
    root.style.colorScheme = active;
    setResolvedTheme(active);
  }, [theme]);

  // Synchronize theme across multiple windows / detached subwindows
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Cross-window BroadcastChannel listener (instant Webview/PWA broadcast)
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel("sketch_studio_theme_sync");
        bc.onmessage = (event) => {
          if (event.data && isValidTheme(event.data)) {
            setThemeState(event.data);
          }
        };
      } catch {
        // BroadcastChannel unavailable
      }
    }

    // 2. Storage event listener (standard web fallback)
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && isValidTheme(event.newValue)) {
        setThemeState(event.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      if (bc) {
        try {
          bc.close();
        } catch {
          // Ignore
        }
      }
      window.removeEventListener("storage", handleStorage);
    };
  }, [storageKey]);

  const setTheme = (newTheme: Theme) => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, newTheme);
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("sketch_studio_theme_sync");
          bc.postMessage(newTheme);
          bc.close();
        }
      }
    } catch {
      // Ignore storage errors
    }
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    const nextTheme: Theme = getNextTheme(resolvedTheme);
    setTheme(nextTheme);
  };

  return (
    <ThemeProviderContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeProviderContext.Provider>
  );
};

export const useTheme = (): ThemeProviderState => {
  const context = useContext(ThemeProviderContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
