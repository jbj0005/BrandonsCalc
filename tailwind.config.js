/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        vin: ['"IBM Plex Mono"', 'Courier New', 'monospace'],
        mono: ['"IBM Plex Mono"', 'Courier New', 'monospace'],
      },
      letterSpacing: {
        'vin': '0.15em',
        'vin-compact': '0.08em',
      },
      zIndex: {
        // Layer system matching styles.css
        '100': '100',  // Layer 1: Interactive elements
        '200': '200',  // Layer 2: Dropdowns
        '300': '300',  // Layer 3: Sticky navigation
        '400': '400',  // Layer 4: Tooltips
        '500': '500',  // Layer 5: Modal backdrops
        '600': '600',  // Layer 6: Modal content
        '700': '700',  // Layer 7: Modal controls
        '800': '800',  // Layer 8: Toast notifications / Nested modal backdrops
        '900': '900',  // Layer 9: Nested modal content
        '1000': '1000', // Layer 10: Nested modal controls
      },
      colors: {
        primary: {
          start: 'var(--primary-start)',
          end: 'var(--primary-end)',
        },
      },
      backdropBlur: {
        'glass': '10px',
      },
      backgroundColor: {
        'glass': 'rgba(255, 255, 255, 0.1)',
      },
      boxShadow: {
        'ios': '0 4px 16px rgba(0, 0, 0, 0.1)',
        'ios-elevated': '0 8px 24px rgba(0, 0, 0, 0.15)',
      },
    },
  },
  plugins: [],
}
