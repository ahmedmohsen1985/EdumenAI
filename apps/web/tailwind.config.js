/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#182237',
          gold: '#b58f53',
          goldLight: '#d4b37a',
          cream: '#f8f6f1'
        }
      }
    }
  },
  plugins: []
};
