# 3-Tier Cloudscape Page Background with Preserved Hero Section

Transform the entire page background to match the 3-tier composition of the reference photo (`file_f63881.png`), while strictly preserving the hero section's existing photo and content untouched, allowing the hero box to float seamlessly atop the cosmic sky.

### User Review & Critical Decisions

> [!IMPORTANT]
> **Key User Requirement Confirmed**:
> - **Hero Photo Untouched**: The photo and content currently inside the hero section (`file_ab2082.png`, headline, badges, CTAs) will **NOT** be changed or replaced.
> - **Top Sky Behind Hero**: The entire page background behind and surrounding the hero section (and header) will display the **upper portion of the reference photo**—a deep cosmic violet starry nebula.
> - **Middle Cloudscape Behind Templates**: The body background spanning the category bar, template marketplace, and showcase sections will feature the **middle portion**—airy lavender and soft pastel puffy clouds.
> - **Bottom Cloudscape for Footer**: The bottom section of the page will display the **lower portion**—rich royal purple rolling clouds.
> - **Frosted Glass Visibility**: Cards and navigation will feature semi-transparent frosted glass (`backdrop-blur-xl`) so the cloudscape is visible underneath.

---

### 1. Overview & Core Concept

- **What It Does**: Provides a cohesive, celestial cloudscape background across the entire WishMagic experience that perfectly mirrors the vertical gradient and cloud forms of the user's reference image (`file_f63881.png`). The hero section remains intact as an elevated focal point resting cleanly above the starry nebula background.
- **Target Audience / Persona**: Users creating and exploring digital celebration wishes who expect an enchanting, premium, whimsical aesthetic with effortless text readability.
- **Key Value**: Delivers the visual ambiance from the user's reference photo across the entire site without altering any existing hero promotional imagery or carousel assets.

---

### 2. User Experience & Visual Design

#### Page Background Gradient & Asset Structure
The page background will be structured into three contiguous visual tiers that flow naturally:

```
┌────────────────────────────────────────────────────────────────────────┐
│  TIER 1: TOP ZONE (Behind Header & Hero Section)                       │
│  - Deep cosmic night sky (#0E031F to #2A0845)                          │
│  - Twinkling stars, crescent moon, and magenta nebula glow             │
│  - Existing Hero Card & Photo floats centered with crisp contrast      │
├────────────────────────────────────────────────────────────────────────┤
│  TIER 2: MIDDLE ZONE (Behind Category Bar & Templates Gallery)         │
│  - Soft pastel lavender & rose clouds (#C8B6E2 to #E8DEF8)             │
│  - Layered SVG vector cloud puffs with gentle horizontal parallax      │
│  - Template cards rendered in frosted glass to reveal clouds beneath   │
├────────────────────────────────────────────────────────────────────────┤
│  TIER 3: BOTTOM ZONE (Behind How It Works, Testimonials & Footer)      │
│  - Rich twilight royal violet cloud waves (#3B185F to #16082B)         │
│  - Deep glowing cloud silhouettes with illuminated violet rim borders  │
│  - Footer links and copyright in high-contrast crisp text              │
└────────────────────────────────────────────────────────────────────────┘
```

#### Visual Identity & Theme
- **Color Palette**:
  - *Tier 1 (Top / Hero Backdrop)*: Deep cosmic indigo `#0E031F`, midnight violet `#2A0845`, magenta starlight accent `#EC4899`.
  - *Tier 2 (Middle / Templates)*: Ethereal lavender `#D8B4F8`, soft violet mist `#EDE4F9`, cloud pearl white `rgba(255, 255, 255, 0.85)`.
  - *Tier 3 (Bottom / Footer)*: Deep royal purple `#3B185F`, twilight base `#16082B`.
- **Hero Card Stance**:
  - Retains the existing hero photo (`file_ab2082.png`), headline, badge, and CTA buttons.
  - Border and shadow tuned to an ultra-clean glass shell with `box-shadow: 0 25px 60px -12px rgba(14, 3, 31, 0.65)` and `border: 1px solid rgba(255, 255, 255, 0.2)` so it floats effortlessly over the starry sky.
- **Frosted Glass Styling**:
  - `backdrop-filter: blur(20px)`
  - Semi-transparent fills (`rgba(255, 255, 255, 0.72)` in light mode, `rgba(32, 16, 56, 0.75)` in dark mode).
  - Subtle top border highlight (`inset 0 1px 1px rgba(255, 255, 255, 0.4)`).

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Preserve Hero Photo and Internal Elements**:
  - *Chosen Approach*: Keep the existing hero photo (`file_ab2082.png`) and DOM structure completely intact. Modify only the page canvas behind the hero element (`#body-ambient-clouds` and `.page-background-top`).
  - *Why*: Direct compliance with the user's explicit instruction: *"hero section me jo photo hai use change nahi krna hai lekin poori website me jhn hero section hai uske background me photo ke upr ke hisse jaisa banana hai"*.
  - *Alternatives Considered*: Swapping the hero photo with a cropped slice of the reference photo was rejected because the user explicitly forbade changing the hero photo.

- **Decision 2: 3-Tier Multi-Layer Background Implementation**:
  - *Chosen Approach*: Implement a fixed/relative 3-tier CSS background canvas composed of:
    1. A seamless vertical gradient matching the reference photo's color stops.
    2. High-resolution reference cloud slice overlays (`tier-top-nebula.png`, `tier-mid-clouds.png`, `tier-bottom-clouds.png`) with smooth CSS feather blending.
    3. Lightweight vector cloud SVG accents for subtle interactive floating animations.
  - *Why*: Delivers exact visual fidelity to the reference photo across all viewport sizes without visible seams or pixelation.

- **Decision 3: Card Transparency & Readability**:
  - *Chosen Approach*: Apply calibrated frosted glass (`backdrop-filter: blur(20px)`) to template cards, category pills, and container sections, while maintaining 100% opaque solid background for the account dropdown menu and critical dialogs.
  - *Why*: Ensures the clouds peek through the content cards while preserving WCAG AA contrast standards for typography and functional dropdowns.

---

### 4. Technical Architecture & Component Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Page Layout Architecture                        │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ #global-cloudscape-canvas (Fixed Background Layer)             │   │
│   │  ├─ .cloudscape-top    (Tier 1: Starry Nebula Sky)             │   │
│   │  ├─ .cloudscape-middle (Tier 2: Lavender Clouds)               │   │
│   │  └─ .cloudscape-bottom (Tier 3: Twilight Purple Waves)         │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Foreground Content (z-index: 10)                               │   │
│   │  ├─ Floating Glass Header (blur(24px))                         │   │
│   │  ├─ Hero Section (Original Photo & Text Unchanged)             │   │
│   │  │   └─ Hero Box with elevated shadow over Tier 1 Sky          │   │
│   │  ├─ Category Tabs (Frosted Pill Controls)                      │   │
│   │  ├─ Marketplace Cards (Glass Shells revealing Tier 2 Clouds)   │   │
│   │  └─ Footer Section (Blended into Tier 3 Twilight Purple)       │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

#### Component & Style Modifications
- `public/css/cloud-background.css`:
  - Update `.site-ambient-canvas` and 3-tier background rules to render the starry cosmic top behind the hero, the lavender cloudscape behind the main content, and the deep purple bottom.
  - Keep `.hero-desktop-canvas` styled so its current image (`file_ab2082.png`) displays crisply inside the container.
- `public/index.html`:
  - Verify container hierarchy so `#ambient-clouds-root` covers the full page with the 3 distinct tiers.
  - Maintain `#hero-desktop-section` intact with its current image and text overlays.
- `data/site_settings.json`:
  - Retain `"heroImageUrl": "/assets/file_ab2082.png"` and update background tokens to align with the new 3-tier cloud theme.
