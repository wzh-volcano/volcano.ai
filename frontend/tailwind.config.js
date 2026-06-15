/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#1a1d22',
          2: '#20242a',
          3: '#262b32',
          hover: '#2c323a',
          active: '#323942',
        },
        border: {
          DEFAULT: '#2e343c',
          strong: '#3a4049',
        },
        text: {
          DEFAULT: '#d7dde5',
          dim: '#8a92a0',
          mute: '#5f6773',
        },
        accent: {
          DEFAULT: '#4a90ff',
          2: '#5b8cff',
        },
        success: '#3ec78c',
        error: '#ff6b6b',
        warning: '#f5b740',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Microsoft YaHei"', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': '11px',
      },
      borderRadius: {
        'xl': '10px',
        '2xl': '12px',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
