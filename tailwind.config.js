/** @type {import('tailwindcss').Config} */
// 색은 docs/04_DESKTOP_UI_GUIDE.md 토큰을 CSS 변수로 참조한다(단일 정본: src/app/styles/tokens.css).
// 간격은 문서의 8px 그리드를 명시한다. ADR-001 참고.
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "brand-ink": "var(--brand-ink)",
        "brand-coral": "var(--brand-coral)",
        "brand-coral-dark": "var(--brand-coral-dark)",
        "brand-sky": "var(--brand-sky)",
        "brand-paper": "var(--brand-paper)",
        "brand-canvas": "var(--brand-canvas)",
        "surface-0": "var(--surface-0)",
        "surface-1": "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
      },
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        6: "24px",
        8: "32px",
        12: "48px",
      },
      height: {
        topbar: "56px",
        input: "40px",
        btn: "40px",
        "btn-lg": "48px",
      },
      width: {
        sidebar: "220px",
        "sidebar-collapsed": "64px",
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Pretendard", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
