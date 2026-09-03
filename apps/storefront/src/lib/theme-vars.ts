import type { Brand } from "@kiln/shared";
import { contrastText, luminance, mix } from "./colors";
import { fontStack } from "./brand";

/** CSS custom properties derived from the brand palette (the globals.css fallbacks use the same names). */
export function brandCssVars(brand: Brand): Record<string, string> {
  const bg = brand.backgroundColor || "#faf6f2";
  const text = brand.textColor || "#1a1a1a";
  const primary = brand.primaryColor || "#1a1a1a";
  const secondary = brand.secondaryColor || "#b8552f";
  const light = luminance(bg) > 0.4;
  return {
    "--brand-primary": primary,
    "--brand-primary-contrast": contrastText(primary),
    "--brand-secondary": secondary,
    "--brand-bg": bg,
    "--brand-bg-elevated": light ? mix(bg, "#ffffff", 0.45) : mix(bg, "#ffffff", 0.06),
    "--brand-text": text,
    "--brand-muted": mix(text, bg, 0.42),
    "--brand-rule": mix(text, bg, 0.84),
    "--brand-rule-strong": mix(text, bg, 0.68),
    "--font-display": fontStack(brand.displayFont || "Playfair Display"),
    "--font-body": fontStack(brand.bodyFont || "Inter"),
  };
}
export const cssVarsToStyle = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");
