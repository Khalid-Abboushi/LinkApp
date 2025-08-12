// constants/theme.ts
import { Platform } from "react-native";

export type ThemeMode = "light" | "dark";

type Shade = 100 | 300 | 500 | 600;
type ShadeScale = Record<Shade, string>;

/**
 * Unified theme type
 */
export interface AppTheme {
  mode: ThemeMode;

  colors: {
    background: string;
    surface: string;
    card: string;
    border: string;
    text: {
      primary: string;
      secondary: string;
      muted: string;
      inverse: string;
      onDark: string;
    };
    pastel: {
      mint: string;
      mauve: string;
      pink: string;
      vanilla: string;
      blue: string;
    };
    primary: string;
    accent: string;
    success: string;
    danger: string;

    brand: ShadeScale;

    // Aliases
    bg: string;
    onDark?: string;
  };

  // Flat/legacy aliases
  bg: string;
  card: string;
  cardSoft: string;
  border: string;

  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
    onDark: string;
  };

  white: string;
  black: string;

  // Scales expected by components
  brand: ShadeScale;
  accent: ShadeScale;
  success: ShadeScale;
  successScale: ShadeScale;
  warn: ShadeScale;
  danger: ShadeScale;

  radius: { sm: number; md: number; lg: number; xl: number; pill: number };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  shadow: (level: 1 | 2 | 3) => any;
}

const pastel = {
  mint: "#D3F8E2",
  mauve: "#E4C1F9",
  pink: "#F694C1",
  vanilla: "#EDE7B1",
  blue: "#A9DEF9",
};

// Helper to derive lighter tints for 100/300 if you ever swap bases
const tint = (hex: string, amt: number) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const to = (c: number) => clamp(Math.round(c + (255 - c) * amt));
  const r = to(parseInt(m[1], 16));
  const g = to(parseInt(m[2], 16));
  const b = to(parseInt(m[3], 16));
  const h = (v: number) => v.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
};

export const getTheme = (mode: ThemeMode = "light"): AppTheme => {
  const isDark = mode === "dark";

  // Text
  const textPrimary = isDark ? "#F8FAFC" : "#0F172A";
  const textSecondary = isDark ? "#E2E8F0" : "#334155";
  const textMuted = isDark ? "#CBD5E1" : "#64748B";
  const textOnDark = "#FFFFFF";

  // Surfaces
  const background = isDark ? "#0F172A" : "#FCFEFF";
  const card = isDark ? "#111827" : "#FFFFFF";
  const border = isDark ? "rgba(255,255,255,0.08)" : "#E8EEF5";

  // Brand/action bases
  const primaryBase = pastel.blue;  // #A9DEF9
  const accentBase = pastel.pink;   // #F694C1
  const successBase = "#10B981";
  const warnBase = "#F59E0B";
  const dangerBase = "#EF4444";

  // Scales (add 100/300)
  const brand: ShadeScale = {
    100: tint(primaryBase, 0.88), // very light
    300: tint(primaryBase, 0.60),
    500: primaryBase,
    600: "#77C6EF",
  };
  const accentScale: ShadeScale = {
    100: tint(accentBase, 0.88),
    300: tint(accentBase, 0.60),
    500: accentBase,
    600: "#E884B0",
  };
  const successScale: ShadeScale = {
    100: "#D1FAE5",
    300: "#6EE7B7",
    500: successBase,
    600: "#059669",
  };
  const warnScale: ShadeScale = {
    100: "#FEF3C7",
    300: "#FCD34D",
    500: warnBase,
    600: "#D97706",
  };
  const dangerScale: ShadeScale = {
    100: "#FEE2E2",
    300: "#FCA5A5",
    500: dangerBase,
    600: "#DC2626",
  };

  // Soft card used in a few components
  const cardSoft = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";

  return {
    mode,

    colors: {
      background,
      surface: card,
      card,
      border,
      text: {
        primary: textPrimary,
        secondary: textSecondary,
        muted: textMuted,
        inverse: textOnDark,
        onDark: textOnDark,
      },
      pastel,
      primary: brand[500],
      accent: accentScale[500],
      success: successScale[500],
      danger: dangerScale[500],
      brand,

      // Aliases
      bg: background,
      onDark: textOnDark,
    },

    // Flat/legacy aliases
    bg: background,
    card,
    cardSoft,
    border,

    text: {
      primary: textPrimary,
      secondary: textSecondary,
      muted: textMuted,
      inverse: textOnDark,
      onDark: textOnDark,
    },

    white: "#FFFFFF",
    black: "#000000",

    // Expose scales
    brand,
    accent: accentScale,
    success: successScale,
    successScale,
    warn: warnScale,
    danger: dangerScale,

    radius: { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 },
    spacing: { xs: 6, sm: 10, md: 14, lg: 18, xl: 26 },
    shadow: (level) => {
      if (Platform.OS === "android") return { elevation: level * 3 };
      const intensity = [0, 0.08, 0.12, 0.18][level];
      return {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 + level * 2 },
        shadowOpacity: intensity,
        shadowRadius: 6 + level * 3,
      };
    },
  };
};
