/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/blocks/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Plus Jakarta Sans Variable',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif'
        ]
      },
      colors: {
        brand: {
          navy: '#18181B',
          gold: '#71717A',
          goldLight: '#A1A1AA',
          cream: '#F4F4F5'
        },
        glass: {
          canvas: '#F4F5F7',
          canvasDeep: '#EBEEF2',
          ink: '#0F1115',
          graphite: '#18181B',
          muted: '#52525B',
          silver: '#E4E4E7'
        }
      },
      boxShadow: {
        glass: '0 1px 2px rgba(15, 17, 21, 0.04), 0 8px 24px -8px rgba(15, 17, 21, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        'glass-lg':
          '0 2px 4px rgba(15, 17, 21, 0.04), 0 24px 48px -12px rgba(15, 17, 21, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
      },
      keyframes: {
        'glass-fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'glass-fade-up': 'glass-fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both'
      }
    }
  },
  plugins: []
};
