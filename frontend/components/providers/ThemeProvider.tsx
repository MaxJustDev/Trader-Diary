"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { THEME_STORAGE_KEY, isThemeName, type ThemeName } from "@/lib/theme";

type ThemeContextValue = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<ThemeName>(() => {
        if (typeof window === "undefined") {
            return "neutral";
        }

        const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

        return storedTheme && isThemeName(storedTheme) ? storedTheme : "neutral";
    });

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }

    return context;
}
