# Starlit Memories — WishMagic Template

A cinematic, star-themed interactive wish template for birthdays, anniversaries, and cosmic celebrations.

## Template Metadata
- **Template ID:** `tpl_starlit_memories`
- **Family:** `tpl_starlit_memories`
- **Version:** `1.0.0`
- **Protocol:** `UTP v1.0`
- **Author:** WishMagic Studio

## Features
- **Twinkling Star System:** Dynamic star generation with CSS keyframe animations.
- **Intersection Animations:** Sections reveal themselves with smooth transitions as the user scrolls.
- **Memory Constellations:** A responsive grid of polaroid-style photos with hover effects.
- **Cosmic Countdown:** Interactive countdown timer to the celebration date.
- **Universal Data Binding:** Supports live updates via the standard UTP data contract.

## Configuration Fields
| Field ID | Label | Type | Binding |
|----------|-------|------|---------|
| `recipient_name` | Recipient Name | `text` | `#recipient-name` (Text) |
| `sender_name` | From | `text` | `#sender-name` (Text) |
| `event_date` | Celebration Date | `date` | `#celebration-countdown` (Value) |
| `main_message` | Starry Message | `textarea` | `#main-message` (Text) |
| `cover_photo` | Cover Photo | `image` | `#hero-backdrop` (BG Image) |
| `memories` | Starlit Memories | `image-multiple` | `#memory-grid` (Collection) |
| `star_color` | Star Glow Color | `color` | `--star-glow` (CSS Variable) |

## Relationship Variants
Supported variants: `girlfriend`, `best_friend`. Each variant provides context-specific default messages while preserving the cosmic visual design.

## Technical Details
- **Entry Point:** `index.html`
- **Styling:** Tailwind CSS (via CDN) + `style.css`
- **Interactions:** Pure Vanilla JavaScript (`script.js`)
- **Compatibility:** Mobile-first, Desktop-ready. Requires Runtime API 1.0.

## Validation Status
- [x] UTP Manifest Schema Valid
- [x] Unique Field IDs
- [x] Asset Inventory Consistent
- [x] Data Binding Verified
- [x] Responsive Layout Implemented
