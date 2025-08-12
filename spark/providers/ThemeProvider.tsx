import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { getTheme, type AppTheme, type ThemeMode } from "@/constants/theme";

const defaultTheme = getTheme("light");
type Ctx = { theme: AppTheme; mode: ThemeMode };
const ThemeContext = createContext<Ctx>({ theme: defaultTheme, mode: "light" });

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const scheme = useColorScheme();
  const mode: ThemeMode = (scheme ?? "light") as ThemeMode;
  const value = useMemo<Ctx>(() => ({ theme: getTheme(mode), mode }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext).theme;
