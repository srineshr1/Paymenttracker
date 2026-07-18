/**
 * Spentd design system
 * Light: warm paper / ink / copper
 * Dark: deep ink / cream / gold
 * Typography: Fraunces (display) · Outfit (UI) · IBM Plex Mono (figures)
 */

export type ThemeMode = "light" | "dark";

export type ColorTokens = {
  bg: string;
  bgElevated: string;
  bgCard: string;
  bgMuted: string;
  bgInverse: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  accent: string;
  accentSoft: string;
  accentStrong: string;
  accentOn: string;
  debit: string;
  credit: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  success: string;
  pinKey: string;
  pinKeyPressed: string;
  tabBar: string;
  overlay: string;
  shadow: string;
  heroWash: string;
};

export const darkColors: ColorTokens = {
  bg: "#0A0B0D",
  bgElevated: "#12141A",
  bgCard: "#161A22",
  bgMuted: "#1C212B",
  bgInverse: "#F4F0E8",
  border: "rgba(244,240,232,0.07)",
  borderStrong: "rgba(244,240,232,0.14)",
  text: "#F4F0E8",
  textSecondary: "rgba(244,240,232,0.64)",
  textMuted: "rgba(244,240,232,0.38)",
  textInverse: "#0A0B0D",
  accent: "#C9A46C",
  accentSoft: "rgba(201,164,108,0.16)",
  accentStrong: "#E0C08A",
  accentOn: "#0A0B0D",
  debit: "#E8A0A0",
  credit: "#8FCBB0",
  danger: "#D97B7B",
  dangerSoft: "rgba(217,123,123,0.14)",
  warning: "#D4B05A",
  success: "#8FCBB0",
  pinKey: "#1A1F2A",
  pinKeyPressed: "#252B38",
  tabBar: "#0F1116",
  overlay: "rgba(5,6,8,0.72)",
  shadow: "#000000",
  heroWash: "#1A1620",
};

export const lightColors: ColorTokens = {
  bg: "#F6F2EB",
  bgElevated: "#FFFcf7",
  bgCard: "#FFFFFF",
  bgMuted: "#EFE9DF",
  bgInverse: "#14161C",
  border: "rgba(20,22,28,0.08)",
  borderStrong: "rgba(20,22,28,0.14)",
  text: "#16181E",
  textSecondary: "rgba(22,24,30,0.62)",
  textMuted: "rgba(22,24,30,0.4)",
  textInverse: "#F6F2EB",
  accent: "#9A6B2F",
  accentSoft: "rgba(154,107,47,0.12)",
  accentStrong: "#7A5220",
  accentOn: "#FFFFFF",
  debit: "#B54A4A",
  credit: "#2F8A66",
  danger: "#B54A4A",
  dangerSoft: "rgba(181,74,74,0.1)",
  warning: "#A67C1A",
  success: "#2F8A66",
  pinKey: "#FFFFFF",
  pinKeyPressed: "#F0EAE0",
  tabBar: "#FFFcf7",
  overlay: "rgba(22,24,30,0.45)",
  shadow: "#2A2418",
  heroWash: "#F0E6D4",
};

/** @deprecated use useTheme().colors — kept for gradual migration */
export const colors = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Shape language — intentionally uneven so UI doesn’t look templatized */
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 28,
  xxl: 36,
  pill: 999,
  sharp: 6,
} as const;

export const typography = {
  /** Editorial display — page titles, brand */
  fontDisplay: "Fraunces_600SemiBold",
  fontDisplayBold: "Fraunces_700Bold",
  /** Clean UI sans */
  fontSans: "Outfit_400Regular",
  fontSansMedium: "Outfit_500Medium",
  fontSansSemi: "Outfit_600SemiBold",
  fontSansBold: "Outfit_700Bold",
  /** Tabular figures for money */
  fontMono: "IBMPlexMono_400Regular",
  fontMonoMed: "IBMPlexMono_500Medium",
  fontMonoSemi: "IBMPlexMono_600SemiBold",
} as const;

export function cardShadow(mode: ThemeMode, color: string) {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: mode === "light" ? 10 : 8 },
    shadowOpacity: mode === "light" ? 0.1 : 0.35,
    shadowRadius: mode === "light" ? 24 : 18,
    elevation: mode === "light" ? 4 : 8,
  };
}
