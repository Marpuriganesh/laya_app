export type Theme = "dark" | "light" | "system";

/**
 * Resolves the effective theme mode ("dark" or "light") given a preference and system state.
 */
export function resolveTheme(
  theme: Theme,
  isSystemDark: boolean
): "dark" | "light" {
  if (theme === "system") {
    return isSystemDark ? "dark" : "light";
  }
  return theme;
}

/**
 * Returns the toggled theme (alternating between "dark" and "light").
 */
export function getNextTheme(
  current: "dark" | "light"
): "dark" | "light" {
  return current === "dark" ? "light" : "dark";
}

/**
 * Validates whether a stored string is a valid Theme value.
 */
export function isValidTheme(val: unknown): val is Theme {
  return val === "dark" || val === "light" || val === "system";
}
