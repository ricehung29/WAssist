/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  // Scope every `hover:` utility behind `@media (hover: hover) and (pointer: fine)`.
  // Without this a tap on a phone leaves the hover style stuck on the last-tapped
  // element; with it, hover styling is desktop-only and touch stays clean.
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {},
  },
  plugins: [],
}
