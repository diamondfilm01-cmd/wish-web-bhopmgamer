const sharedTailwindConfig = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', '"Outfit"', 'sans-serif'],
        serifAccent: ['"Playfair Display"', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        magic: {
          50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe',
          400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce',
          800: '#6b21a8', 900: '#581c87', deep: '#1D0B36', midnight: '#140628', royal: '#2E0854'
        },
        accent: {
          pink: '#ec4899', hotpink: '#ff1493', glow: '#ff0080',
          gold: '#F4C542', amber: '#f59e0b', emerald: '#16A34A'
        },
        // Adaptive Theme Tokens (Defaults to Fairytale Light Mode matching 19728.png)
        background: 'var(--color-background, #f4f1fb)',
        surface: 'var(--color-surface, #ffffff)',
        'surface-variant': 'var(--color-surface-variant, #f3effb)',
        'surface-bright': 'var(--color-surface-bright, #ede6fa)',
        'surface-container-lowest': 'var(--color-surface-container-lowest, #ffffff)',
        'surface-container-low': 'var(--color-surface-container-low, #faf8ff)',
        'surface-container': 'var(--color-surface-container, #ffffff)',
        'surface-container-high': 'var(--color-surface-container-high, #f4f0fc)',
        'surface-container-highest': 'var(--color-surface-container-highest, #ebe4f8)',
        'on-surface': 'var(--color-on-surface, #1a0f30)',
        'on-surface-variant': 'var(--color-on-surface-variant, #5e4f7d)',
        outline: 'var(--color-outline, #7b6b99)',
        'outline-variant': 'var(--color-outline-variant, #e6dff5)',
        primary: '#7c3aed',
        'primary-fixed': '#c084fc',
        'primary-container': '#7c3aed',
        'on-primary': '#ffffff',
        'on-primary-container': '#ffffff',
        secondary: '#ec4899',
        'secondary-container': '#db2777',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#fce7f3',
        tertiary: '#10b981',
        'tertiary-fixed': '#34d399',
        'tertiary-container': '#059669',
        'on-tertiary-container': '#d1fae5',
        error: '#ef4444',
        'error-container': '#dc2626',
        'on-error': '#ffffff',
        'on-error-container': '#fecaca',
      },
      spacing: {
        'space-xs': '0.25rem',
        'space-sm': '0.5rem',
        'space-md': '1rem',
        'space-lg': '1.5rem',
        'space-xl': '2rem',
      },
      fontSize: {
        'display-lg': ['2rem', { lineHeight: '2.5rem', fontWeight: '800' }],
        'headline-lg': ['1.75rem', { lineHeight: '2.15rem', fontWeight: '800' }],
        'headline-md': ['1.4rem', { lineHeight: '1.85rem', fontWeight: '700' }],
        'headline-sm': ['1.15rem', { lineHeight: '1.6rem', fontWeight: '700' }],
        'body-lg': ['1.05rem', { lineHeight: '1.55rem', fontWeight: '500' }],
        'body-md': ['0.875rem', { lineHeight: '1.35rem', fontWeight: '500' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '500' }],
        'label-lg': ['0.84rem', { lineHeight: '1.2rem', fontWeight: '600' }],
        'label-md': ['0.75rem', { lineHeight: '1rem', fontWeight: '600' }],
        'label-sm': ['0.6875rem', { lineHeight: '0.875rem', fontWeight: '700' }],
      },
      animation: {
        'float-slow': 'floating 6s ease-in-out infinite',
        'float-delayed': 'floating 7s ease-in-out 2s infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite'
      },
      keyframes: {
        floating: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.8', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)', filter: 'brightness(1.2)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' }
        }
      }
    }
  }
};

if (typeof tailwind !== 'undefined') {
  tailwind.config = sharedTailwindConfig;
}
