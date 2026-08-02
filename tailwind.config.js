/** @type {import('tailwindcss').Config} */

// Every colour resolves through a CSS variable holding an "R G B" triple, so
// the light/dark switch is a single attribute on <html> and opacity modifiers
// such as bg-signal/10 keep working.
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

module.exports = {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: withAlpha("--canvas"),
        surface: withAlpha("--surface"),
        inset: withAlpha("--inset"),
        line: {
          DEFAULT: withAlpha("--line"),
          strong: withAlpha("--line-strong"),
        },
        ink: {
          DEFAULT: withAlpha("--ink"),
          2: withAlpha("--ink-2"),
          3: withAlpha("--ink-3"),
        },
        signal: {
          DEFAULT: withAlpha("--signal"),
          soft: withAlpha("--signal-soft"),
        },
        verify: withAlpha("--verify"),
        fault: withAlpha("--fault"),
        caution: withAlpha("--caution"),
      },
      fontFamily: {
        // No webfonts: the app runs offline, so the stack is built from faces
        // that ship with the OS. Segoe UI Variable carries the interface,
        // Cascadia carries anything the user could paste into a terminal.
        sans: [
          "Segoe UI Variable Text",
          "Segoe UI",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        display: [
          "Segoe UI Variable Display",
          "Segoe UI",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          "Cascadia Code",
          "Cascadia Mono",
          "JetBrains Mono",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        eyebrow: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.14em" }],
      },
      borderRadius: {
        DEFAULT: "6px",
        lg: "8px",
        xl: "10px",
        "2xl": "14px",
      },
      boxShadow: {
        panel:
          "0 1px 2px rgb(0 0 0 / 0.16), 0 8px 24px -12px rgb(0 0 0 / 0.28)",
        lifted: "0 16px 48px -16px rgb(0 0 0 / 0.45)",
        "signal-glow":
          "0 0 0 1px rgb(var(--signal) / 0.35), 0 0 18px -4px rgb(var(--signal) / 0.5)",
      },
    },
  },
  plugins: [],
};
