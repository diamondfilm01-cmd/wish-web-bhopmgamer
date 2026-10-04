// WishMagic Advanced Theme Engine
// Part 4: Reusable Theme Presets, CSS Tokens, Contrast Protection, & DOM Injector

// 8 Rich Theme Presets
const WISH_THEME_PRESETS = {
  magical: {
    id: 'magical',
    name: 'Magical',
    icon: '🪄',
    tagline: 'Dreamy starlight & enchanted glow',
    colors: {
      primary: '#ec4899',
      secondary: '#8b5cf6',
      accent: '#fbbf24',
      background: 'radial-gradient(circle at 50% 15%, #2a0845 0%, #17042b 55%, #0d0118 100%)',
      surface: 'rgba(255, 255, 255, 0.12)',
      text: '#ffffff',
      mutedText: '#e9d5ff',
      border: 'rgba(236, 72, 153, 0.35)',
      glow: 'rgba(236, 72, 153, 0.45)'
    },
    typography: {
      headingFont: 'Outfit, sans-serif',
      bodyFont: 'Plus Jakarta Sans, sans-serif',
      headingWeight: '800',
      fontStyle: 'normal'
    },
    background: {
      type: 'gradient',
      value: 'radial-gradient(circle at 50% 15%, #2a0845 0%, #17042b 55%, #0d0118 100%)',
      overlay: 'none'
    },
    surfaces: {
      style: 'glass',
      radius: 'rounded',
      radiusPx: '20px',
      blur: '20px',
      shadow: '0 20px 40px -10px rgba(139, 92, 246, 0.25)'
    },
    buttons: {
      style: 'gradient',
      radius: 'pill',
      radiusPx: '9999px',
      shadow: '0 10px 25px -5px rgba(236, 72, 153, 0.4)'
    },
    effects: {
      master: true,
      particles: true,
      particleType: 'sparkles',
      intensity: 'soft',
      glow: true,
      confetti: true,
      hearts: false
    }
  },

  romantic: {
    id: 'romantic',
    name: 'Romantic',
    icon: '🌹',
    tagline: 'Velvet rose, warm gold & heartfelt love',
    colors: {
      primary: '#f43f5e',
      secondary: '#fb7185',
      accent: '#f59e0b',
      background: 'radial-gradient(circle at 50% 15%, #3f091c 0%, #20040e 55%, #0d0106 100%)',
      surface: 'rgba(255, 255, 255, 0.10)',
      text: '#fff1f2',
      mutedText: '#fecdd3',
      border: 'rgba(244, 63, 94, 0.35)',
      glow: 'rgba(244, 63, 94, 0.4)'
    },
    typography: {
      headingFont: 'Playfair Display, serif',
      bodyFont: 'Plus Jakarta Sans, sans-serif',
      headingWeight: '700',
      fontStyle: 'italic'
    },
    background: {
      type: 'glow',
      value: 'radial-gradient(circle at 50% 15%, #3f091c 0%, #20040e 55%, #0d0106 100%)',
      overlay: 'dark'
    },
    surfaces: {
      style: 'frosted',
      radius: 'rounded',
      radiusPx: '24px',
      blur: '24px',
      shadow: '0 20px 45px -10px rgba(244, 63, 94, 0.25)'
    },
    buttons: {
      style: 'gradient',
      radius: 'pill',
      radiusPx: '9999px',
      shadow: '0 10px 25px -5px rgba(244, 63, 94, 0.45)'
    },
    effects: {
      master: true,
      particles: true,
      particleType: 'hearts',
      intensity: 'soft',
      glow: true,
      confetti: true,
      hearts: true
    }
  },

  cute: {
    id: 'cute',
    name: 'Cute',
    icon: '🎀',
    tagline: 'Sweet bubblegum, soft peach & joy',
    colors: {
      primary: '#ec4899',
      secondary: '#f472b6',
      accent: '#38bdf8',
      background: 'radial-gradient(circle at 50% 15%, #4a0d33 0%, #230417 55%, #0f010a 100%)',
      surface: 'rgba(255, 255, 255, 0.14)',
      text: '#ffffff',
      mutedText: '#fbcfe8',
      border: 'rgba(244, 114, 182, 0.4)',
      glow: 'rgba(244, 114, 182, 0.35)'
    },
    typography: {
      headingFont: 'Plus Jakarta Sans, sans-serif',
      bodyFont: 'Plus Jakarta Sans, sans-serif',
      headingWeight: '800',
      fontStyle: 'normal'
    },
    background: {
      type: 'gradient',
      value: 'radial-gradient(circle at 50% 15%, #4a0d33 0%, #230417 55%, #0f010a 100%)',
      overlay: 'none'
    },
    surfaces: {
      style: 'soft',
      radius: 'pill',
      radiusPx: '28px',
      blur: '16px',
      shadow: '0 15px 35px -8px rgba(236, 72, 153, 0.25)'
    },
    buttons: {
      style: 'gradient',
      radius: 'pill',
      radiusPx: '9999px',
      shadow: '0 10px 25px -5px rgba(244, 114, 182, 0.4)'
    },
    effects: {
      master: true,
      particles: true,
      particleType: 'sparkles',
      intensity: 'expressive',
      glow: true,
      confetti: true,
      hearts: true
    }
  },

  elegant: {
    id: 'elegant',
    name: 'Elegant',
    icon: '👑',
    tagline: 'Champagne gold, refined ivory & timeless serenity',
    colors: {
      primary: '#d97706',
      secondary: '#fbbf24',
      accent: '#e5e7eb',
      background: 'radial-gradient(circle at 50% 15%, #291e07 0%, #140e02 55%, #080501 100%)',
      surface: 'rgba(255, 255, 255, 0.08)',
      text: '#fef3c7',
      mutedText: '#fde68a',
      border: 'rgba(245, 158, 11, 0.35)',
      glow: 'rgba(245, 158, 11, 0.25)'
    },
    typography: {
      headingFont: 'Playfair Display, serif',
      bodyFont: 'Plus Jakarta Sans, sans-serif',
      headingWeight: '700',
      fontStyle: 'normal'
    },
    background: {
      type: 'glow',
      value: 'radial-gradient(circle at 50% 15%, #291e07 0%, #140e02 55%, #080501 100%)',
      overlay: 'dark'
    },
    surfaces: {
      style: 'clean',
      radius: 'soft',
      radiusPx: '14px',
      blur: '20px',
      shadow: '0 20px 40px -10px rgba(217, 119, 6, 0.2)'
    },
    buttons: {
      style: 'gradient',
      radius: 'soft',
      radiusPx: '14px',
      shadow: '0 10px 25px -5px rgba(245, 158, 11, 0.35)'
    },
    effects: {
      master: true,
      particles: true,
      particleType: 'stardust',
      intensity: 'minimal',
      glow: true,
      confetti: false,
      hearts: false
    }
  },

  royal: {
    id: 'royal',
    name: 'Royal',
    icon: '💜',
    tagline: 'Imperial amethyst & gold sovereign splendor',
    colors: {
      primary: '#7c3aed',
      secondary: '#f59e0b',
      accent: '#ec4899',
      background: 'radial-gradient(circle at 50% 15%, #2e0854 0%, #18032e 55%, #090112 100%)',
      surface: 'rgba(255, 255, 255, 0.10)',
      text: '#f3e8ff',
      mutedText: '#d8b4fe',
      border: 'rgba(124, 58, 237, 0.4)',
      glow: 'rgba(124, 58, 237, 0.4)'
    },
    typography: {
      headingFont: 'Playfair Display, serif',
      bodyFont: 'Plus Jakarta Sans, sans-serif',
      headingWeight: '800',
      fontStyle: 'normal'
    },
    background: {
      type: 'cosmic',
      value: 'radial-gradient(circle at 50% 15%, #2e0854 0%, #18032e 55%, #090112 100%)',
      overlay: 'none'
    },
    surfaces: {
      style: 'elevated',
      radius: 'rounded',
      radiusPx: '22px',
      blur: '24px',
      shadow: '0 25px 50px -12px rgba(124, 58, 237, 0.35)'
    },
    buttons: {
      style: 'gradient',
      radius: 'pill',
      radiusPx: '9999px',
      shadow: '0 12px 28px -6px rgba(124, 58, 237, 0.45)'
    },
    effects: {
      master: true,
      particles: true,
      particleType: 'sparkles',
      intensity: 'soft',
      glow: true,
      confetti: true,
      hearts: false
    }
  },

  dark: {
    id: 'dark',
    name: 'Dark',
    icon: '🌌',
    tagline: 'Obsidian depth, cyber cyan & neon aurora',
    colors: {
      primary: '#06b6d4',
      secondary: '#6366f1',
      accent: '#f43f5e',
      background: 'radial-gradient(circle at 50% 15%, #081e36 0%, #030a14 55%, #010307 100%)',
      surface: 'rgba(15, 23, 42, 0.65)',
      text: '#f8fafc',
      mutedText: '#94a3b8',
      border: 'rgba(6, 182, 212, 0.35)',
      glow: 'rgba(6, 182, 212, 0.35)'
    },
    typography: {
      headingFont: 'Outfit, sans-serif',
      bodyFont: 'Plus Jakarta Sans, sans-serif',
      headingWeight: '800',
      fontStyle: 'normal'
    },
    background: {
      type: 'cosmic',
      value: 'radial-gradient(circle at 50% 15%, #081e36 0%, #030a14 55%, #010307 100%)',
      overlay: 'none'
    },
    surfaces: {
      style: 'glass',
      radius: 'soft',
      radiusPx: '16px',
      blur: '20px',
      shadow: '0 20px 40px -10px rgba(6, 182, 212, 0.2)'
    },
    buttons: {
      style: 'gradient',
      radius: 'rounded',
      radiusPx: '16px',
      shadow: '0 10px 25px -5px rgba(6, 182, 212, 0.4)'
    },
    effects: {
      master: true,
      particles: true,
      particleType: 'stardust',
      intensity: 'soft',
      glow: true,
      confetti: true,
      hearts: false
    }
  },

  pastel: {
    id: 'pastel',
    name: 'Pastel',
    icon: '🌸',
    tagline: 'Whisper lilac, soft peony & dreamy calm',
    colors: {
      primary: '#a855f7',
      secondary: '#f472b6',
      accent: '#38bdf8',
      background: 'radial-gradient(circle at 50% 15%, #331545 0%, #1a0a24 55%, #0d0412 100%)',
      surface: 'rgba(255, 255, 255, 0.12)',
      text: '#fdf4ff',
      mutedText: '#f0abfc',
      border: 'rgba(216, 180, 254, 0.35)',
      glow: 'rgba(168, 85, 247, 0.3)'
    },
    typography: {
      headingFont: 'Plus Jakarta Sans, sans-serif',
      bodyFont: 'Plus Jakarta Sans, sans-serif',
      headingWeight: '700',
      fontStyle: 'normal'
    },
    background: {
      type: 'gradient',
      value: 'radial-gradient(circle at 50% 15%, #331545 0%, #1a0a24 55%, #0d0412 100%)',
      overlay: 'none'
    },
    surfaces: {
      style: 'soft',
      radius: 'rounded',
      radiusPx: '22px',
      blur: '18px',
      shadow: '0 16px 36px -8px rgba(168, 85, 247, 0.2)'
    },
    buttons: {
      style: 'soft',
      radius: 'pill',
      radiusPx: '9999px',
      shadow: '0 10px 22px -5px rgba(168, 85, 247, 0.3)'
    },
    effects: {
      master: true,
      particles: true,
      particleType: 'sparkles',
      intensity: 'minimal',
      glow: true,
      confetti: false,
      hearts: false
    }
  },

  celebration: {
    id: 'celebration',
    name: 'Celebration',
    icon: '🎉',
    tagline: 'Burst of joyous confetti, sun gold & vivid excitement',
    colors: {
      primary: '#e11d48',
      secondary: '#f59e0b',
      accent: '#10b981',
      background: 'radial-gradient(circle at 50% 15%, #3d0718 0%, #20030c 55%, #0d0104 100%)',
      surface: 'rgba(255, 255, 255, 0.12)',
      text: '#ffffff',
      mutedText: '#fecdd3',
      border: 'rgba(225, 29, 72, 0.4)',
      glow: 'rgba(225, 29, 72, 0.4)'
    },
    typography: {
      headingFont: 'Outfit, sans-serif',
      bodyFont: 'Plus Jakarta Sans, sans-serif',
      headingWeight: '900',
      fontStyle: 'normal'
    },
    background: {
      type: 'gradient',
      value: 'radial-gradient(circle at 50% 15%, #3d0718 0%, #20030c 55%, #0d0104 100%)',
      overlay: 'none'
    },
    surfaces: {
      style: 'glass',
      radius: 'rounded',
      radiusPx: '24px',
      blur: '20px',
      shadow: '0 20px 45px -10px rgba(225, 29, 72, 0.3)'
    },
    buttons: {
      style: 'gradient',
      radius: 'pill',
      radiusPx: '9999px',
      shadow: '0 12px 28px -6px rgba(225, 29, 72, 0.45)'
    },
    effects: {
      master: true,
      particles: true,
      particleType: 'confetti',
      intensity: 'expressive',
      glow: true,
      confetti: true,
      hearts: false
    }
  }
};

// 8 Popular Curated Color Palettes
const WISH_COLOR_PALETTES = [
  { id: 'rose-gold', name: 'Rose Gold', primary: '#f43f5e', secondary: '#fb7185', accent: '#f59e0b', bgPreview: 'linear-gradient(135deg, #f43f5e, #fb7185)' },
  { id: 'burgundy-gold', name: 'Burgundy Gold', primary: '#be123c', secondary: '#f59e0b', accent: '#fbbf24', bgPreview: 'linear-gradient(135deg, #be123c, #f59e0b)' },
  { id: 'blue-gold', name: 'Blue Gold', primary: '#0284c7', secondary: '#f59e0b', accent: '#38bdf8', bgPreview: 'linear-gradient(135deg, #0284c7, #f59e0b)' },
  { id: 'lavender', name: 'Lavender', primary: '#8b5cf6', secondary: '#c084fc', accent: '#ec4899', bgPreview: 'linear-gradient(135deg, #8b5cf6, #c084fc)' },
  { id: 'peach', name: 'Peach Sunset', primary: '#f97316', secondary: '#fb7185', accent: '#fde047', bgPreview: 'linear-gradient(135deg, #f97316, #fb7185)' },
  { id: 'emerald', name: 'Emerald Gem', primary: '#059669', secondary: '#10b981', accent: '#f59e0b', bgPreview: 'linear-gradient(135deg, #059669, #10b981)' },
  { id: 'midnight', name: 'Midnight Aurora', primary: '#06b6d4', secondary: '#6366f1', accent: '#a855f7', bgPreview: 'linear-gradient(135deg, #06b6d4, #6366f1)' },
  { id: 'champagne', name: 'Champagne', primary: '#d97706', secondary: '#fbbf24', accent: '#ffffff', bgPreview: 'linear-gradient(135deg, #d97706, #fbbf24)' }
];

// 4 Curated Typography Pairings
const WISH_TYPOGRAPHY_PAIRINGS = {
  modern: {
    id: 'modern',
    name: 'Modern Geometric',
    headingFont: 'Outfit, sans-serif',
    bodyFont: 'Plus Jakarta Sans, sans-serif',
    sample: 'Bold & Striking'
  },
  elegant: {
    id: 'elegant',
    name: 'Classic Elegant',
    headingFont: 'Playfair Display, serif',
    bodyFont: 'Plus Jakarta Sans, sans-serif',
    sample: 'Timeless Luxury'
  },
  romantic: {
    id: 'romantic',
    name: 'Romantic Script',
    headingFont: 'Playfair Display, serif',
    fontStyle: 'italic',
    bodyFont: 'Plus Jakarta Sans, sans-serif',
    sample: 'Poetic & Intimate'
  },
  playful: {
    id: 'playful',
    name: 'Playful Rounded',
    headingFont: 'Plus Jakarta Sans, sans-serif',
    bodyFont: 'Plus Jakarta Sans, sans-serif',
    sample: 'Warm & Cheerful'
  }
};

// -----------------------------------------------------------------------------
// CONTRAST & ACCESSIBILITY UTILITIES
// -----------------------------------------------------------------------------
function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function getRelativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const lum1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

// Automatically protects text legibility based on background color luminance
function ensureReadableTextColor(bgHex, preferredTextHex) {
  if (!bgHex) return preferredTextHex || '#ffffff';
  const ratio = getContrastRatio(bgHex, preferredTextHex || '#ffffff');
  if (ratio < 4.5) {
    const bgRgb = hexToRgb(bgHex);
    const lum = getRelativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
    return lum > 0.5 ? '#170629' : '#ffffff';
  }
  return preferredTextHex;
}

// -----------------------------------------------------------------------------
// CSS TOKEN GENERATOR
// -----------------------------------------------------------------------------
function generateThemeCSS(themeConfig) {
  if (!themeConfig) return '';

  const colors = themeConfig.colors || {};
  const typography = themeConfig.typography || {};
  const surfaces = themeConfig.surfaces || {};
  const buttons = themeConfig.buttons || {};
  const background = themeConfig.background || {};
  const effects = themeConfig.effects || {};

  const primary = colors.primary || '#ec4899';
  const secondary = colors.secondary || '#8b5cf6';
  const accent = colors.accent || '#fbbf24';
  const text = colors.text || '#ffffff';
  const mutedText = colors.mutedText || '#e9d5ff';
  const border = colors.border || 'rgba(236, 72, 153, 0.35)';
  const glow = colors.glow || 'rgba(236, 72, 153, 0.4)';

  const headingFont = typography.headingFont || 'Outfit, sans-serif';
  const bodyFont = typography.bodyFont || 'Plus Jakarta Sans, sans-serif';
  const headingWeight = typography.headingWeight || '800';
  const fontStyle = typography.fontStyle || 'normal';

  const surfaceRadius = surfaces.radiusPx || '20px';
  const buttonRadius = buttons.radiusPx || '9999px';

  // Surface Style Variations
  let surfaceCSS = `
    background: ${colors.surface || 'rgba(255, 255, 255, 0.12)'} !important;
    backdrop-filter: blur(${surfaces.blur || '16px'}) !important;
    -webkit-backdrop-filter: blur(${surfaces.blur || '16px'}) !important;
    border: 1px solid ${border} !important;
    border-radius: ${surfaceRadius} !important;
    box-shadow: ${surfaces.shadow || '0 15px 35px -8px rgba(0,0,0,0.3)'} !important;
  `;

  if (surfaces.style === 'clean') {
    surfaceCSS = `
      background: rgba(255, 255, 255, 0.08) !important;
      border: 1px solid ${border} !important;
      border-radius: ${surfaceRadius} !important;
      box-shadow: none !important;
    `;
  } else if (surfaces.style === 'frosted') {
    surfaceCSS = `
      background: rgba(255, 255, 255, 0.18) !important;
      backdrop-filter: blur(28px) !important;
      -webkit-backdrop-filter: blur(28px) !important;
      border: 1px solid rgba(255, 255, 255, 0.25) !important;
      border-radius: ${surfaceRadius} !important;
      box-shadow: ${surfaces.shadow || '0 20px 40px -10px rgba(0,0,0,0.4)'} !important;
    `;
  } else if (surfaces.style === 'elevated') {
    surfaceCSS = `
      background: rgba(20, 6, 36, 0.8) !important;
      border: 1px solid ${border} !important;
      border-radius: ${surfaceRadius} !important;
      box-shadow: 0 25px 50px -12px ${glow} !important;
    `;
  }

  // Button Style Variations
  let buttonCSS = `
    background: linear-gradient(135deg, ${primary} 0%, ${secondary} 100%) !important;
    color: #ffffff !important;
    border-radius: ${buttonRadius} !important;
    box-shadow: ${buttons.shadow || '0 10px 25px -5px rgba(0,0,0,0.3)'} !important;
    border: none !important;
  `;

  if (buttons.style === 'outline') {
    buttonCSS = `
      background: transparent !important;
      color: ${primary} !important;
      border: 2px solid ${primary} !important;
      border-radius: ${buttonRadius} !important;
      box-shadow: none !important;
    `;
  } else if (buttons.style === 'glass') {
    buttonCSS = `
      background: rgba(255, 255, 255, 0.15) !important;
      backdrop-filter: blur(12px) !important;
      color: #ffffff !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      border-radius: ${buttonRadius} !important;
      box-shadow: 0 8px 20px rgba(0,0,0,0.2) !important;
    `;
  } else if (buttons.style === 'filled') {
    buttonCSS = `
      background: ${primary} !important;
      color: #ffffff !important;
      border-radius: ${buttonRadius} !important;
      border: none !important;
    `;
  }

  // Background styling
  let backgroundCSS = '';
  if (background.value) {
    backgroundCSS = `
      body {
        background: ${background.value} !important;
        background-attachment: fixed !important;
      }
    `;
  }

  return `
    :root {
      --wish-primary: ${primary};
      --wish-secondary: ${secondary};
      --wish-accent: ${accent};
      --wish-text: ${text};
      --wish-muted-text: ${mutedText};
      --wish-border: ${border};
      --wish-glow: ${glow};
      --wish-radius: ${surfaceRadius};
      --wish-btn-radius: ${buttonRadius};
      --wish-heading-font: ${headingFont};
      --wish-body-font: ${bodyFont};
    }

    ${backgroundCSS}

    /* Headings & Typography */
    h1, h2, h3, .font-display, .font-serif-luxury, .font-serif-accent, .font-serif-gold {
      font-family: ${headingFont} !important;
      font-weight: ${headingWeight} !important;
      font-style: ${fontStyle} !important;
    }

    body, p, span, div {
      font-family: ${bodyFont};
    }

    /* Gradient Headings */
    .bg-clip-text {
      background-image: linear-gradient(135deg, ${text} 0%, ${secondary} 60%, ${accent} 100%) !important;
    }

    /* Primary and Accent Text */
    .text-pink-400, .text-rose-400, .text-amber-400, .text-cyan-400, .text-purple-300, .text-pink-300 {
      color: ${primary} !important;
    }
    .text-amber-300, .text-amber-200 {
      color: ${accent} !important;
    }

    /* Buttons */
    button.bg-gradient-to-r, a.bg-gradient-to-r, .btn-primary-wish {
      ${buttonCSS}
    }

    /* Surfaces / Cards / Modals */
    .backdrop-blur-md, .backdrop-blur-xl, .backdrop-blur-2xl, .bg-white\\/10, .bg-amber-950\\/40, .bg-rose-950\\/60, .bg-cyan-950\\/70 {
      ${surfaceCSS}
    }

    /* Borders */
    .border-white\\/20, .border-purple-200, .border-rose-400\\/30, .border-cyan-400\\/30, .border-amber-400\\/30 {
      border-color: ${border} !important;
    }

    /* Reduced Motion Respect */
    @media (prefers-reduced-motion: reduce) {
      *, ::before, ::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
      .animate-cake, .animate-bounce, .animate-pulse, .animate-spin {
        animation: none !important;
      }
    }
  `;
}

// Contrast evaluation helper with WCAG standard grading
function evaluateColorContrast(bgHex, textHex) {
  if (!bgHex || !textHex) return { ratio: 21, status: 'pass', label: 'Optimal Contrast (AAA)', isAccessible: true };
  const ratio = getContrastRatio(bgHex, textHex);
  const rounded = Math.round(ratio * 10) / 10;
  
  if (ratio >= 7.0) {
    return { ratio: rounded, status: 'pass', label: `Excellent Contrast (${rounded}:1 AAA)`, isAccessible: true };
  } else if (ratio >= 4.5) {
    return { ratio: rounded, status: 'pass', label: `Accessible Contrast (${rounded}:1 AA)`, isAccessible: true };
  } else if (ratio >= 3.0) {
    return { ratio: rounded, status: 'warning', label: `Fair Contrast (${rounded}:1 - Readable on large text)`, isAccessible: true };
  } else {
    return { ratio: rounded, status: 'fail', label: `Low Contrast (${rounded}:1 - Auto-protected)`, isAccessible: false };
  }
}

// Factory to clone or customize a theme preset
function createThemeConfig(presetId, overrides = {}) {
  const base = WISH_THEME_PRESETS[presetId] || WISH_THEME_PRESETS.magical;
  const config = JSON.parse(JSON.stringify(base));

  if (overrides.colors) Object.assign(config.colors, overrides.colors);
  if (overrides.typography) Object.assign(config.typography, overrides.typography);
  if (overrides.background) Object.assign(config.background, overrides.background);
  if (overrides.surfaces) Object.assign(config.surfaces, overrides.surfaces);
  if (overrides.buttons) Object.assign(config.buttons, overrides.buttons);
  if (overrides.effects) Object.assign(config.effects, overrides.effects);

  return config;
}

// -----------------------------------------------------------------------------
// LIVE CANVAS PARTICLE ENGINE
// -----------------------------------------------------------------------------
function applyParticleEffectsToDocument(doc, themeConfig) {
  if (!doc) return;
  const effects = themeConfig && themeConfig.effects ? themeConfig.effects : null;
  let canvas = doc.getElementById('wishmagic-particle-canvas');

  if (!effects || !effects.master || !effects.particles || effects.intensity === 'off' || effects.intensity === 'minimal') {
    if (canvas) {
      canvas.style.display = 'none';
      if (canvas._stopParticles) canvas._stopParticles();
    }
    return;
  }

  if (!canvas) {
    canvas = doc.createElement('canvas');
    canvas.id = 'wishmagic-particle-canvas';
    canvas.className = 'fixed inset-0 pointer-events-none z-0';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '1';
    doc.body.insertBefore(canvas, doc.body.firstChild);
  }

  canvas.style.display = 'block';
  canvas.style.opacity = effects.intensity === 'expressive' ? '0.75' : '0.45';

  // Stop any existing loop before reconfiguring
  if (canvas._stopParticles) {
    canvas._stopParticles();
  }

  initLiveCanvasParticles(canvas, doc, themeConfig);
}

function initLiveCanvasParticles(canvas, doc, themeConfig) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const win = doc.defaultView || window;
  let animId = null;
  let particles = [];
  
  function resize() {
    canvas.width = win.innerWidth || doc.documentElement.clientWidth || 800;
    canvas.height = win.innerHeight || doc.documentElement.clientHeight || 600;
  }
  resize();
  win.addEventListener('resize', resize);

  const particleType = (themeConfig.effects && themeConfig.effects.particleType) || 'sparkles';
  const intensity = (themeConfig.effects && themeConfig.effects.intensity) || 'soft';
  const count = intensity === 'expressive' ? 45 : 24;

  const primaryCol = (themeConfig.colors && themeConfig.colors.primary) || '#ec4899';
  const accentCol = (themeConfig.colors && themeConfig.colors.accent) || '#fbbf24';

  particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 3 + 1.5,
      speedY: Math.random() * 0.6 + 0.2,
      speedX: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.8 + 0.2,
      alphaChange: (Math.random() * 0.02 + 0.01) * (Math.random() > 0.5 ? 1 : -1),
      color: Math.random() > 0.4 ? primaryCol : accentCol,
      type: particleType
    });
  }

  function drawHeart(c, x, y, size, color, alpha) {
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, alpha));
    c.fillStyle = color;
    c.translate(x, y);
    c.beginPath();
    const d = size * 1.5;
    c.moveTo(0, 0);
    c.bezierCurveTo(-d / 2, -d / 2, -d, d / 3, 0, d);
    c.bezierCurveTo(d, d / 3, d / 2, -d / 2, 0, 0);
    c.fill();
    c.restore();
  }

  function drawStar(c, cx, cy, spikes, outerRadius, innerRadius, color, alpha) {
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, alpha));
    c.fillStyle = color;
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    c.beginPath();
    c.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      c.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      c.lineTo(x, y);
      rot += step;
    }
    c.lineTo(cx, cy - outerRadius);
    c.closePath();
    c.fill();
    c.restore();
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.y -= p.speedY;
      p.x += p.speedX;
      p.alpha += p.alphaChange;

      if (p.alpha <= 0.1 || p.alpha >= 0.9) {
        p.alphaChange = -p.alphaChange;
      }

      if (p.y < -20) {
        p.y = canvas.height + 10;
        p.x = Math.random() * canvas.width;
      }
      if (p.x < -20) p.x = canvas.width + 10;
      if (p.x > canvas.width + 20) p.x = -10;

      if (p.type === 'hearts') {
        drawHeart(ctx, p.x, p.y, p.size, p.color, p.alpha);
      } else if (p.type === 'confetti') {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size * 2, p.size);
        ctx.restore();
      } else {
        // Sparkles & Stardust
        drawStar(ctx, p.x, p.y, 4, p.size * 1.8, p.size * 0.7, p.color, p.alpha);
      }
    }

    animId = win.requestAnimationFrame(loop);
  }

  loop();

  canvas._stopParticles = function() {
    if (animId) win.cancelAnimationFrame(animId);
    win.removeEventListener('resize', resize);
  };
}

// -----------------------------------------------------------------------------
// DOM & IFRAME INJECTOR
// -----------------------------------------------------------------------------
function applyThemeToDocument(doc, themeConfig) {
  if (!doc) return;

  const css = generateThemeCSS(themeConfig);
  let styleEl = doc.getElementById('wishmagic-theme-engine-styles');
  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.id = 'wishmagic-theme-engine-styles';
    doc.head.appendChild(styleEl);
  }
  styleEl.textContent = css;

  // Manage particles in template
  applyParticleEffectsToDocument(doc, themeConfig);
}

// Export for module and browser global usage
if (typeof window !== 'undefined') {
  window.WishThemeEngine = {
    presets: WISH_THEME_PRESETS,
    palettes: WISH_COLOR_PALETTES,
    typography: WISH_TYPOGRAPHY_PAIRINGS,
    getContrastRatio,
    ensureReadableTextColor,
    evaluateColorContrast,
    createThemeConfig,
    generateThemeCSS,
    applyThemeToDocument,
    applyParticleEffectsToDocument
  };
}
