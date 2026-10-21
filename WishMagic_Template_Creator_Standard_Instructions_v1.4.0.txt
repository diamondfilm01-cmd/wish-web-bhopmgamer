# WishMagic Universal Template Creator Standard Instructions (UTP v1.4.0)
## Complete AI Studio / Gemini / ChatGPT / Claude Master Prompt & Implementation Guide for Festival-Compatible, Multi-Variant Celebration Templates

> **Protocol Version**: `1.4.0` (100% Backward Compatible with UTP `1.0.0`, `1.1.0`, `1.2.0`, and `1.3.0`)
> **Target Platform**: WishMagic (Cloudflare Workers + Cloudflare D1 + Backblaze B2 + ImgBB)
> **Companion Specification**: `wishmagic_universal_template_protocol_v1_4_0.md`

---

## 1. Purpose of This Standard

This document is the authoritative **AI Template Creator Instruction Standard (UTP v1.4.0)** for generating production-ready WishMagic template packages (`wishmagic.json`, `index.html`, `css/style.css`, `js/template.js`, and optional `assets/`).

With **UTP v1.4.0**, every generated template package supports:
1. **Festival Scheduler & Campaign Compatibility (`festivalMetadata`)**:
   - Templates can declare descriptive festival compatibility metadata (`festivalTags`, `suitableRelationships`, `campaignCompatibility`, `displayBadge`, and advisory `suggestedPublicationPreferences`).
   - **Strict Server Scheduling Boundary**: Templates **never** hardcode authoritative festival dates or enforce client-only date locks. The platform's **Festival Scheduler** resolves the effective festival date `F` (via verified Panchang/Gazette calendar tables, deterministic calendar rules, external providers, or year-scoped administrator manual overrides) and enforces the authoritative publication window:
     - **Start Date**: `F - daysBefore` (default `15` calendar days, inclusive)
     - **End Date**: `F + 3 calendar days` (inclusive)
     - **First Blocked Date**: `F + 4 calendar days` (`startOfDay(end_date + 1 day, timezone)`)
   - During the active campaign window, customers can create wishes immediately and their generated wish URLs (`/w/:slug`) work **immediately** without waiting for the festival date. After the 3rd post-festival day, new campaign wishes are blocked while existing wish links remain intact under the wish lifecycle.
2. **Multi-Relationship Variants & Authoritative Variant Visibility (`variants[]` & `enabledVariants`)**:
   - One template ZIP can include tailored relationship variants (`family`, `brother`, `sister`, `best_friend`, `mother`, `father`, `boyfriend`, `girlfriend`, `husband`, `wife`, `partner`, `parents`, `friend`, `crush`, `fiance`, `colleague`, `teacher`, `kids`), each with its own default messages, color theme, visibility overrides, and button labels.
3. **Hierarchical Sections, Subsections & Customer Photo Slot Hiding (`data-wm-section`, `data-wm-subsection`, `data-wm-photo-slot`)**:
   - Up to 3 levels of section/subsection nesting, plus `[data-wm-photo-slot="photo_X"]` wrappers so when an admin or customer disables a section or unused photo slot, it is physically removed from the DOM (`el.remove()`) and the layout reflows cleanly.
4. **Central Link Manager & Logical Link Identifiers (`global.*` & `template.*`)**:
   - Buttons use `data-wm-action` and `data-wm-link` (`"template.customize"`, `"template.create"`, `"global.explore"`, `"global.browseTemplates"`, `"global.home"`, etc.) so future domain updates work automatically without editing template ZIPs.

---

## 2. Copy-Paste Master Prompt for AI Studio / Gemini / ChatGPT / Claude (UTP v1.4.0)

Copy everything between `[COPY START]` and `[COPY END]` below when asking an AI tool to generate a new WishMagic template:

```markdown
[COPY START]
You are a senior front-end creative engineer building a self-contained, interactive HTML/CSS/JS celebration or festival template package for the "WishMagic" platform following the **WishMagic Universal Template Protocol (UTP v1.4.0)**.

When I upload your generated ZIP package into the WishMagic Admin Panel, the platform will parse `wishmagic.json` and `index.html`, validate all field bindings (`data-wm-field`), section/subsection hierarchy (`data-wm-section`, `data-wm-subsection`), customer-hideable photo slots (`data-wm-photo-slot`), configurable buttons/actions (`data-wm-action`, `data-wm-link`), logical link identifiers (`global.*` and `template.*`), relationship `variants[]`, and UTP v1.4.0 `festivalMetadata`.

You MUST strictly follow all 12 rules below:

### RULE 1: STANDARD ZIP PACKAGE STRUCTURE (FLAT ROOT)
Generate the template files using this exact relative directory structure at the package root:
- `wishmagic.json`       (MANDATORY — UTP v1.4.0 manifest declaring `"schemaVersion": "1.4.0"`, `template`, `compatibility`, optional `festivalMetadata`, `fields`, hierarchical `sections` with `subsections`, `actions`, `capabilities`, and optional `variants[]`)
- `index.html`           (MANDATORY — Default entry HTML with matching `data-wm-field`, `data-wm-section`, `data-wm-subsection`, `data-wm-photo-slot`, `data-wm-action`, optional `data-wm-link`, and optional `data-wm-modal` attributes)
- `css/style.css`        (Stylesheet defining `:root` variables `--wm-primary`, `--wm-secondary`, `--wm-accent`, `--wm-bg`, `--wm-text` and responsive desktop + mobile layouts)
- `js/template.js`       (Interactive logic, countdown/gallery/surprise handlers, and UTP v1.4.0 live hydration bridge)
- `assets/images/...`    (Optional local default images and per-variant thumbnails)
- `assets/audio/...`     (Optional local default background music)
- `assets/video/...`     (Optional local default video clips)
- `variants/...`         (Optional — ONLY if a variant uses a dedicated HTML entry file instead of sharing `index.html`)

CRITICAL PATH & SECURITY RULES:
- Use ONLY safe relative paths inside the package (`css/style.css`, `js/template.js`, `assets/images/cover.jpg`).
- NEVER use local computer paths (`C:\...`, `file://`), parent directory traversal (`../`), leading root slashes (`/etc/...`), or executable files (`.php`, `.exe`, `.sh`, `.py`, `.bat`).
- Every local file referenced in `index.html`, `css/style.css`, or `wishmagic.json` MUST exist inside the package.

### RULE 2: THREE-WAY AGREEMENT FOR EVERY CUSTOMIZABLE FIELD (`fields[]` <-> `data-wm-field`)
Every customizable field in `wishmagic.json` MUST have 3-way agreement between:
1. **Manifest Declaration (`wishmagic.json -> fields[]`)**: Declares `id`, `type`, `label`, `required`, `defaultValue`, `placeholder`, `section`, optional `subsection`, and `binding`.
2. **HTML Binding (`index.html`)**: Has a matching element with `data-wm-field="<id>"` and `data-wm-type="<type>"`.
3. **Runtime Hydration (`js/template.js`)**: Uses `/js/wishmagic-template-protocol.js` so all text fields render safely via `textContent` (preventing XSS) and update live in the Customizer.

### RULE 3: HIERARCHICAL SECTIONS & SUBSECTIONS (`sections[]` <-> `data-wm-section` & `data-wm-subsection`)
- Declare every major visual section in `wishmagic.json` under `"sections"` with `{ "id", "label", "order", "required", "toggleable", "defaultEnabled", "emptyParentPolicy", "fields", "actions", "subsections" }`.
- Bind top-level sections in HTML with `data-wm-section="<section_id>"` and child subsections (up to 3 levels deep) with `data-wm-subsection="<subsection_id>"`.
- Guard all DOM lookups in `js/template.js` (`if (!el) return;`) because disabled sections and subsections are physically removed from the DOM (`el.remove()`).

### RULE 4: MANDATORY PHOTO SLOT WRAPPERS (`data-wm-photo-slot`) & AUTO-REFLOWING GRIDS
- Wrap every individual photo card/polaroid (including its `<img data-wm-field="photo_X" data-wm-type="image">` and any paired caption) inside a self-contained wrapper with `data-wm-photo-slot="photo_X"` (and `data-wm-subsection="gallery_photo_X"`).
- Style the parent gallery container with flexible auto-reflowing CSS (`display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem;`) so if a customer hides an unused photo slot, the remaining photos center and reflow with zero empty gaps.

### RULE 5: CENTRALIZED LOGICAL LINKS & ACTION REGISTRY (`actions[]` <-> `data-wm-action` & `data-wm-link`)
- NEVER hardcode `https://wishmagic.pages.dev` or admin routes inside buttons or links.
- Every interactive CTA button or link must have `data-wm-action="<action_id>"` (and optional `data-wm-link="<logical_link_id>"`) in HTML and a matching entry in `wishmagic.json` under `"actions"`.
- Supported action `"type"` values ONLY:
  1. `"template_link"` with `"logicalLink": "template.customize"`, `"template.create"`, or `"template.preview"` (opens the creation/preview flow for THIS template preserving `template`, `variant`, `rel`, and `campaign`).
  2. `"global_link"` with `"logicalLink": "global.explore"`, `"global.browseTemplates"`, `"global.home"`, `"global.createWish"`, `"global.marketplace"`, `"global.pricing"`, `"global.help"`, or `"global.contact"`.
  3. `"customizer"` (`target: "/customize.html"`, aliases to `"template.customize"`).
  4. `"section"` (`target: "<section_or_subsection_id>"`).
  5. `"modal"` (`target: "<modal_id>"` matching `[data-wm-modal="<modal_id>"]` or `id="<modal_id>"`).
  6. `"internal_url"` (validated internal WishMagic route such as `"/templates.html"`).
  7. `"external_url"` (`target: "https://..."` — HTTPS only).
  8. `"none"` (`target: ""`).

### RULE 6: RELATIONSHIP VARIANTS (`variants[]`)
If the template supports multiple relationships (`family`, `best_friend`, `brother`, `sister`, `mother`, `father`, `boyfriend`, `girlfriend`, `husband`, `wife`, `partner`, `parents`, `friend`, `crush`, `fiance`, `colleague`, `teacher`, `kids`), declare each variant in `variants[]` with unique `id`, `slug`, `relationship`, `relationshipLabel`, `enabled: true`, `status: "published"`, tailored `theme`, `messages`, optional `visibilityOverrides`, and optional `actions` overrides. Do NOT force all relationships to share identical copy or colors.

### RULE 7: UTP v1.4.0 FESTIVAL METADATA & SERVER SCHEDULING BOUNDARIES (`festivalMetadata`)
If the template is designed for or compatible with a festival (e.g., Diwali, Holi, Raksha Bandhan, Bhai Dooj, Karwa Chauth, Navratri, Ganesh Chaturthi, Eid, Christmas, New Year, Valentine's Day, Friendship Day), include the optional `festivalMetadata` block in `wishmagic.json`:
```json
"festivalMetadata": {
  "festivalTags": ["diwali", "deepavali"],
  "suitableRelationships": ["family", "brother", "sister", "best_friend"],
  "campaignCompatibility": "evergreen_and_festival",
  "displayBadge": "✨ Diwali Special",
  "suggestedPublicationPreferences": {
    "suggestedDaysBefore": 15,
    "suggestedDaysAfter": 3,
    "advisoryOnly": true
  }
}
```
CRITICAL FESTIVAL SCHEDULING BOUNDARY:
- NEVER include `authoritativeFestivalDate`, `effectiveFestivalDate`, `fixedFestivalDate`, `forceActive`, `bypassSchedule`, or `overrideServerSchedule` in `wishmagic.json`.
- NEVER hardcode JavaScript logic in `js/template.js` that blocks or expires the template on a fixed calendar date. The WishMagic server's Festival Scheduler owns all festival dates and publication windows (`F - 15 days` to `F + 3 days` inclusive).

### RULE 8: THEME & DESIGN TOKENS (`css/style.css`)
Define `--wm-primary`, `--wm-secondary`, `--wm-accent`, `--wm-bg`, and `--wm-text` on `:root` in `css/style.css` with complete visual defaults.

### RULE 9: ACCESSIBILITY & RESPONSIVE DESIGN
- Include `<meta name="viewport" content="width=device-width, initial-scale=1.0">` in `index.html`.
- Ensure full keyboard accessibility (`tabindex`, `:focus-visible`, semantic `<button>` / `<a>`), readable contrast, `@media (prefers-reduced-motion: reduce)` support, and clean rendering at both `1280px+` desktop and `375px` mobile viewports.

### RULE 10: CAPABILITIES DECLARATION (`capabilities`)
Declare ONLY capabilities genuinely implemented in the package from: `"photos"`, `"multiplePhotos"`, `"gallery"`, `"music"`, `"voice"`, `"video"`, `"countdown"`, `"timeline"`, `"themes"`, `"animations"`, `"particles"`, `"sections"`, `"subsections"`, `"actions"`, `"secretMessage"`, `"finalSurprise"`, `"variants"`, `"festivalMetadata"`. Never declare unsupported required features.

### RULE 11: MANDATORY UTP v1.4.0 RUNTIME BRIDGE (`index.html` & `js/template.js`)
Include `<script src="/js/wishmagic-template-protocol.js"></script>` in `index.html` before `js/template.js`, and listen for `WISHMAGIC_INIT`, `WISHMAGIC_LIVE_UPDATE`, `WISHMAGIC_UPDATE`, and `wishmagic:data-updated`.

### RULE 12: PRE-DELIVERY VALIDATION CHECKLIST
Before outputting the files, verify:
- [ ] `wishmagic.json` is valid JSON declaring `"schemaVersion": "1.4.0"` and `"compatibility": { "runtimeApi": "1.4", "minimumRuntimeApi": "1.0" }`.
- [ ] Every `fields[]` item matches a `[data-wm-field]` in `index.html` and declares a valid `"section"`.
- [ ] Every `sections[]` and `subsections[]` item matches `[data-wm-section]` / `[data-wm-subsection]` in `index.html`.
- [ ] Every `actions[]` item matches `[data-wm-action]` in `index.html` and uses valid `template.*` or `global.*` logical links.
- [ ] Multi-photo slots are wrapped in `[data-wm-photo-slot="photo_X"]`.
- [ ] Zero hardcoded authoritative festival dates or client-side schedule locks exist.

Now build a complete, production-ready UTP v1.4.0 WishMagic template package (`wishmagic.json`, `index.html`, `css/style.css`, `js/template.js`) for:
[DESCRIBE YOUR FESTIVAL OR CELEBRATION TEMPLATE & RELATIONSHIP VARIANTS HERE]
[COPY END]
```

---

## 3. Complete Reference Implementation Snippet (`index.html` + `js/template.js`)

### 3.1 `index.html` Structure with UTP v1.4.0 Bindings
```html
<!DOCTYPE html>
<html lang="en" data-wm-protocol="1.4.0">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Royal Festival of Lights — WishMagic</title>
  <link rel="stylesheet" href="css/style.css"/>
</head>
<body>
  <main>
    <section data-wm-section="hero" class="wm-hero-section">
      <div data-wm-subsection="hero_blessing_badge" class="wm-badge">✨ Auspicious Festival Blessings</div>
      <h1 data-wm-field="hero_title" data-wm-type="text">SHUBH DEEPAVALI</h1>
      <p data-wm-field="hero_subtitle" data-wm-type="text">May thousands of lamps light up your life</p>
      <p class="wm-recipient-line">For <strong data-wm-field="recipient_name" data-wm-type="text">Aarav &amp; Family</strong></p>
      <div data-wm-subsection="hero_cta_bar" class="wm-cta-row">
        <a data-wm-action="hero_cta" data-wm-link="template.customize" href="/customize.html" class="wm-btn-primary">Make For Yours</a>
        <button type="button" data-wm-action="explore_memories_btn" class="wm-btn-secondary">View Festive Gallery</button>
      </div>
    </section>

    <section data-wm-section="countdown" class="wm-countdown-section">
      <span data-wm-field="event_date" data-wm-type="date" data-wm-date-value="2026-11-08">2026-11-08</span>
    </section>

    <section data-wm-section="message" class="wm-message-section">
      <p data-wm-field="custom_message" data-wm-type="textarea">Wishing you and your loved ones a radiant festival filled with peace, warmth, and sweet moments together!</p>
      <p data-wm-field="sender_name" data-wm-type="text">— With Warm Regards</p>
    </section>

    <section data-wm-section="gallery" class="wm-gallery-grid">
      <div class="wm-photo-card" data-wm-photo-slot="photo_1" data-wm-subsection="gallery_photo_1">
        <img data-wm-field="photo_1" data-wm-type="image" src="assets/images/diwali-cover.jpg" alt="Celebration Memory 1"/>
      </div>
      <div class="wm-photo-card" data-wm-photo-slot="photo_2" data-wm-subsection="gallery_photo_2">
        <img data-wm-field="photo_2" data-wm-type="image" src="assets/images/diwali-memory-2.jpg" alt="Celebration Memory 2"/>
      </div>
    </section>

    <section data-wm-section="secret_message" class="wm-secret-section">
      <p data-wm-field="secret_note" data-wm-type="textarea">May this year bring every dream you have worked so hard for into reality!</p>
      <a data-wm-action="explore_more_btn" data-wm-link="global.explore" href="/templates.html" class="wm-btn-link">Explore More</a>
    </section>
  </main>

  <script src="/js/wishmagic-template-protocol.js"></script>
  <script src="js/template.js"></script>
</body>
</html>
```
