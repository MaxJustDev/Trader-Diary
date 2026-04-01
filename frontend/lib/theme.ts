export const THEME_STORAGE_KEY = "traderdiary-theme";

export const THEMES = ["neutral", "dark"] as const;

export type ThemeName = (typeof THEMES)[number];

export function isThemeName(value: string): value is ThemeName {
    return (THEMES as readonly string[]).includes(value);
}
