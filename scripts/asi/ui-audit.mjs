/**
 * Objective UI proxies for Tier-3 upgrades: WCAG text contrast on rules that set
 * both color and background, !important count, font-size sprawl, CSS weight.
 * It does not model the cascade, so treat it as a regression detector, not a beauty score.
 *
 * CLI: node scripts/asi/ui-audit.mjs [rootDir]
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const UI_CSS_FILES = ["app/globals.css", "app/sidebar-contrast.css"];
export const MIN_TEXT_CONTRAST = 4.5;

const NAMED = { white: [255, 255, 255], black: [0, 0, 0] };

export function parseColor(raw) {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/\s*!important\s*$/, "").trim();
  if (NAMED[value]) return NAMED[value];
  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      if (digits.length === 4 && digits[3] !== "f") return null;
      digits = digits.slice(0, 3).split("").map(char => char + char).join("");
    } else if (digits.length === 8) {
      if (digits.slice(6) !== "ff") return null;
      digits = digits.slice(0, 6);
    } else if (digits.length !== 6) return null;
    return [0, 2, 4].map(index => parseInt(digits.slice(index, index + 2), 16));
  }
  const rgb = value.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (rgb) {
    if (rgb[4] !== undefined) {
      const alpha = rgb[4].endsWith("%") ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
      if (alpha < 1) return null;
    }
    return [rgb[1], rgb[2], rgb[3]].map(Number);
  }
  return null;
}

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export function parseRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  for (const chunk of clean.split("}")) {
    const open = chunk.lastIndexOf("{");
    if (open < 0) continue;
    let selector = chunk.slice(0, open);
    const outer = selector.lastIndexOf("{");
    if (outer >= 0) selector = selector.slice(outer + 1);
    const decls = [];
    for (const part of chunk.slice(open + 1).split(";")) {
      const colon = part.indexOf(":");
      if (colon < 0) continue;
      decls.push([part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim()]);
    }
    rules.push({ selector: selector.trim(), decls });
  }
  return rules;
}

function collectVars(rules) {
  const rootVars = new Map();
  const anyVars = new Map();
  for (const rule of rules) {
    const isRoot = /^(?::root|html|body)$/.test(rule.selector);
    for (const [name, value] of rule.decls) {
      if (!name.startsWith("--")) continue;
      anyVars.set(name, value);
      if (isRoot) rootVars.set(name, value);
    }
  }
  return new Map([...anyVars, ...rootVars]);
}

function resolveVars(value, vars, depth = 0) {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name, fallback) => (
    depth > 4 ? "" : resolveVars(vars.get(name) ?? fallback ?? "", vars, depth + 1)
  ));
}

function lastDecl(decls, names) {
  for (let index = decls.length - 1; index >= 0; index -= 1) if (names.includes(decls[index][0])) return decls[index][1];
  return null;
}

export function auditCss(css) {
  const rules = parseRules(css);
  const vars = collectVars(rules);
  const pairs = [];
  const fontSizes = new Set();
  for (const rule of rules) {
    for (const [name, value] of rule.decls) if (name === "font-size") fontSizes.add(value.replace(/\s*!important/, ""));
    const fg = lastDecl(rule.decls, ["color"]);
    const bg = lastDecl(rule.decls, ["background-color", "background"]);
    if (!fg || !bg) continue;
    const fgColor = parseColor(resolveVars(fg, vars));
    const bgColor = parseColor(resolveVars(bg, vars));
    if (!fgColor || !bgColor) continue;
    pairs.push({ selector: rule.selector.slice(0, 160), ratio: contrastRatio(fgColor, bgColor) });
  }
  const fails = pairs.filter(pair => pair.ratio < MIN_TEXT_CONTRAST).sort((a, b) => a.ratio - b.ratio);
  return {
    cssBytes: Buffer.byteLength(css, "utf8"),
    rules: rules.length,
    colorPairs: pairs.length,
    contrastFails: fails.length,
    minContrast: pairs.length ? Math.min(...pairs.map(pair => pair.ratio)) : null,
    importantCount: (css.match(/!important/g) || []).length,
    fontSizeVariants: fontSizes.size,
    worst: fails.slice(0, 15),
  };
}

export function auditProject(root, files = UI_CSS_FILES) {
  const present = files.filter(file => existsSync(join(root, file)));
  const css = present.map(file => readFileSync(join(root, file), "utf8")).join("\n");
  return { files: present, ...auditCss(css) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const root = resolve(process.argv[2] || process.cwd());
  console.log(JSON.stringify(auditProject(root), null, 2));
}
