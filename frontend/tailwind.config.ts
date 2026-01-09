import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Jokari Brand Colors
        primary: {
          50: '#fffde6',
          100: '#fffacc',
          200: '#fff599',
          300: '#ffef66',
          400: '#ffea33',
          500: '#ffed00', // Jokari Yellow
          600: '#e6d500',
          700: '#ccbe00',
          800: '#b3a600',
          900: '#998f00',
        },
        accent: {
          50: '#e8eaf5',
          100: '#c5c9e6',
          200: '#9fa5d4',
          300: '#7981c2',
          400: '#5c66b4',
          500: '#24388d', // Jokari Blue
          600: '#1f317d',
          700: '#1a296a',
          800: '#152157',
          900: '#0f1844',
        },
        neutral: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0a0a0a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'card': '0 0 0 1px rgba(0, 0, 0, 0.05), 0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
export default config
