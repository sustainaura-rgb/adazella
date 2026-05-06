/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand palette — refined for premium feel
        brand: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        // Accent palette — for charts + highlights (Tradezella-inspired)
        accent: {
          purple: "#a855f7",
          pink:   "#ec4899",
          orange: "#f97316",
          amber:  "#f59e0b",
          emerald:"#10b981",
          cyan:   "#06b6d4",
          blue:   "#3b82f6",
          rose:   "#f43f5e",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      fontSize: {
        // Heroic numbers for KPI tiles
        "kpi": ["2.5rem", { lineHeight: "1", letterSpacing: "-0.04em", fontWeight: "800" }],
        "kpi-lg": ["3.5rem", { lineHeight: "1", letterSpacing: "-0.05em", fontWeight: "800" }],
      },
      backgroundImage: {
        // Premium gradient backgrounds (use as bg-gradient-mesh in components)
        "gradient-mesh": "radial-gradient(circle at 0% 0%, rgba(99,102,241,0.15) 0px, transparent 50%), radial-gradient(circle at 100% 0%, rgba(168,85,247,0.12) 0px, transparent 50%), radial-gradient(circle at 50% 100%, rgba(236,72,153,0.08) 0px, transparent 50%)",
        "gradient-card": "linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(168,85,247,0.05) 100%)",
        "gradient-brand": "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
        "gradient-success": "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
        "gradient-warning": "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)",
        "gradient-danger":  "linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)",
        "dot-pattern": "radial-gradient(circle, rgba(99,102,241,0.08) 1px, transparent 1px)",
      },
      backgroundSize: {
        "dot-grid": "20px 20px",
      },
      boxShadow: {
        // Premium depth (Tradezella-style)
        "soft":   "0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.04)",
        "premium": "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.04), 0 0 0 1px rgba(99,102,241,0.06)",
        "premium-lg": "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.06), 0 0 0 1px rgba(99,102,241,0.08)",
        "glow": "0 0 32px rgba(99,102,241,0.4)",
        "glow-sm": "0 0 16px rgba(99,102,241,0.3)",
        "inner-soft": "inset 0 1px 2px rgba(0,0,0,0.04)",
      },
      backdropBlur: {
        "xs": "2px",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-subtle": "pulseSubtle 3s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
    },
  },
  plugins: [],
};
