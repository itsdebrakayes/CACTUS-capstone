import { ThemeProvider as NextThemeProvider } from "next-themes";

export function ThemeProvider({ children, defaultTheme = "light" }: { children: React.ReactNode; defaultTheme?: string }) {
  return <NextThemeProvider attribute="class" defaultTheme={defaultTheme}>{children}</NextThemeProvider>;
}