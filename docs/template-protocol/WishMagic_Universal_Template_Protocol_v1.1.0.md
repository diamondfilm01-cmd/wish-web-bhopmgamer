# WishMagic Universal Template Protocol (UTP v1.1.0)
## Relationship-Aware Multi-Variant Template Standard & AI Studio Master Prompt

> **Version**: `1.1.0` (100% Backward Compatible with UTP `1.0.0`)
> **Status**: Production Standard
> **Supported Package Modes**:
> 1. **Single-Variant / Legacy Package (`schemaVersion: "1.0.0"` or `"1.1.0"` without `variants`)** — Works identically to UTP v1.0.0 with zero changes required.
> 2. **Multi-Variant Shared-Entry Package (`schemaVersion: "1.1.0"` with `variants[]`)** — One shared `index.html` dynamically adapts its copy, theme colors, default assets, fields, and sections per relationship variant (e.g., `BRO CODE` supporting `Best Friend`, `Brother`, and `Boyfriend`).
> 3. **Multi-Variant Dedicated-Entry Package (`schemaVersion: "1.1.0"` with `variants[]` + per-variant `entry`)** — Each variant can optionally point to its own HTML entry file (e.g., `variants/brother.html`) while sharing common CSS, JS, and media assets.

---

## What Happens Automatically When You Upload a UTP v1.1.0 ZIP in WishMagic Admin

1. **Manifest & HTML Inspection**: WishMagic reads `wishmagic.json`, `index.html` (plus any variant entry HTML files), `css/`, and `js/`.
2. **Automatic Cloud Asset Routing**:
   - All template & variant images (`assets/images/...`, thumbnails) are uploaded to **ImgBB** preserving filenames and rewritten to live CDN URLs.
   - All audio, video, HTML, CSS, JS, and manifest files are uploaded to **Backblaze B2** under an immutable version prefix (`templates/<slug>/versions/<ver_id>/`).
3. **Automatic Variant Discovery & Registration**:
   - Every valid entry in `variants[]` is automatically validated and registered into D1 (`relationships`, `template_relationships`, `template_relationship_variants`, and `templates.variants_json`).
   - You **never** have to manually create or configure variants one-by-one after uploading a valid multi-variant ZIP.
4. **End-to-End Storefront & Customizer Behavior**:
   - **All Templates Gallery**: Displays the exact published relation tags supported by that template family (e.g., `[Best Friend] [Brother] [Boyfriend]`).
   - **Preview & Customize Flows**:
     - If a visitor clicks **Preview** or **Customize** from All Templates without an active relation filter, WishMagic opens the **Relation Selection Modal** listing only that template's supported, published variants.
     - If a template has only **1** available variant (or is a legacy v1.0.0 template), it opens directly without asking.
     - If a visitor clicks **Customize** from inside a variant's **Preview**, WishMagic opens the Customizer for that **exact** selected relation without asking again.
     - If a visitor selects an explicit **Relation Filter** (e.g., `Brother`) in the gallery, clicking Preview or Customize opens the `Brother` variant directly without asking again (whereas generic keyword searches like `"funny"` never auto-select a relation).

---

## PART 1: COPY-PASTE MASTER PROMPT FOR GOOGLE AI STUDIO / CHATGPT / CLAUDE

Copy everything between `[COPY START]` and `[COPY END]` below, paste it into Google AI Studio / ChatGPT / Claude, and describe your template idea at the bottom:

[COPY START]
You are a senior front-end creative developer building a self-contained, interactive HTML/CSS/JS celebration template package for the "WishMagic" platform following the **WishMagic Universal Template Protocol (UTP v1.1.0)**.

When I upload your generated ZIP package into the WishMagic Admin Panel, the platform will automatically parse `wishmagic.json` and `index.html`, validate all field bindings, discover and register all declared relationship `variants[]`, upload images to ImgBB and audio/video/code to Backblaze B2, display relation tags on the template card, and auto-generate the relationship-aware customization form.

You MUST strictly follow all 8 rules below:

### RULE 1: STANDARD ZIP PACKAGE STRUCTURE (FLAT ROOT)
Generate the template files using this exact relative directory structure at the package root:
- `wishmagic.json`       (MANDATORY — UTP v1.1.0 manifest declaring metadata, fields, sections, capabilities, and optional `variants[]`)
- `index.html`           (MANDATORY — Default entry HTML with matching `data-wm-field` and `data-wm-section` attributes)
- `css/style.css`        (Stylesheet using CSS variables `--wm-primary`, `--wm-secondary`, `--wm-accent`, `--wm-bg`, `--wm-text`)
- `js/template.js`       (Interactive logic, countdown/gallery/surprise handlers, and WishMagic UTP v1.1.0 live variant + field update listener)
- `assets/images/...`    (Optional local default images and per-variant thumbnails)
- `assets/audio/...`     (Optional local default background music)
- `assets/video/...`     (Optional local default video clips)
- `variants/...`         (Optional — ONLY if a variant uses a dedicated HTML entry file instead of sharing `index.html`)

CRITICAL PATH & SECURITY RULES:
- Use ONLY safe relative paths inside the package (`css/style.css`, `js/template.js`, `assets/images/cover.jpg`).
- NEVER use local computer paths (`C:\...`, `file://`), parent directory traversal (`../`), or server executables (`.php`, `.exe`, `.sh`).
- Every local file referenced in `index.html`, `css/style.css`, or `wishmagic.json` (including variant `entry`, `thumbnail`, and `assets`) MUST exist inside the package.

### RULE 2: THREE-WAY AGREEMENT FOR EVERY CUSTOMIZABLE FIELD
Every customizable field in the template MUST have 3-way agreement between:
1. **Manifest Declaration (`wishmagic.json` -> `fields` array, or `variants[].fields` for variant-specific fields)**:
   Declares `id`, `type`, `label`, `required`, `defaultValue`, `placeholder`, and `binding`.
2. **HTML Binding (`index.html` or the variant's `entry` HTML)**:
   Has an element with `data-wm-field="<id>"` and `data-wm-type="<type>"` matching the exact same `id` and `type`.
3. **Working Runtime (`js/template.js`)**:
   Listens for `WISHMAGIC_INIT`, `WISHMAGIC_LIVE_UPDATE`, `WISHMAGIC_UPDATE`, and `wishmagic:data-updated` so any field or variant change in the WishMagic Customizer updates the DOM and CSS variables immediately in real time.

### RULE 3: RELATIONSHIP VARIANTS (`variants[]` IN `wishmagic.json`)
If the template family supports multiple relationships (for example, `BRO CODE` supporting `Best Friend`, `Brother`, and `Boyfriend`, or a family tribute supporting `Mother`, `Father`, `Sister`, `Best Friend`), declare them in `wishmagic.json` under `"variants"`:
- Each variant object MUST include:
  - `"id"`: unique snake_case or kebab-case identifier (e.g., `"var_best_friend"`, `"var_brother"`, `"var_boyfriend"`)
  - `"slug"`: URL-safe slug (e.g., `"best-friend"`, `"brother"`, `"boyfriend"`)
  - `"name"`: human-readable variant title (e.g., `"Bro Code — Best Friend Edition"`)
  - `"relationship"`: canonical relationship slug (`"best_friend"`, `"brother"`, `"sister"`, `"mother"`, `"father"`, `"boyfriend"`, `"girlfriend"`, `"husband"`, `"wife"`, `"partner"`, `"friend"`, `"parents"`, `"family"`, `"crush"`, `"fiance"`, `"colleague"`, `"teacher"`, `"kids"`)
  - `"relationshipLabel"`: public chip label shown on template cards and the relation-selection modal (e.g., `"Best Friend"`, `"Brother"`, `"Boyfriend"`)
  - `"status"`: `"published"` (or `"draft"` / `"disabled"`)
  - `"enabled"`: `true`
  - `"isDefault"`: `true` on the primary variant, `false` on others
  - `"order"`: integer sort order (`1`, `2`, `3`, ...)
  - `"entry"`: `"index.html"` (or a dedicated relative HTML file if layout differs)
  - `"thumbnail"`: optional relative path or URL for the variant's preview card image
  - `"description"`: short 1-sentence summary shown in the relation-selection dialog
  - `"theme"`: `{ "primary": "#...", "secondary": "#...", "accent": "#...", "background": "...", "text": "#ffffff" }`
  - `"messages"`: object mapping bound field keys (`"hero_title"`, `"hero_subtitle"`, `"custom_message"`, `"sender_name"`, `"secret_note"`, etc.) to relationship-tailored default text
  - `"assets"`: optional object mapping media field keys (`"photo_1"`, `"background_music"`) to variant-specific default files
  - `"fields"`: optional array of field overrides (to change a field's `label`, `placeholder`, or `defaultValue` for that relation, or add a relation-specific field that is bound in HTML, or hide an inapplicable base field with `{ "id": "field_key", "disabled": true }`)
  - `"sections"`: optional array of section overrides for that relation

Never invent fake relationships that are not genuinely tailored in `variants[]`. Every declared variant must have distinct, meaningful relationship copy/theme defaults.

### RULE 4: STANDARD FIELD IDs & TYPES TO USE
Use these canonical field IDs whenever applicable:
- `recipient_name` (`type: "text"`, required) — `<span data-wm-field="recipient_name" data-wm-type="text">Aarav</span>`
- `sender_name` (`type: "text"`) — `<span data-wm-field="sender_name" data-wm-type="text">— Kabir</span>`
- `custom_message` (`type: "textarea"`) — `<p data-wm-field="custom_message" data-wm-type="textarea">...</p>`
- `event_date` (`type: "date"` or `"datetime"`, required) — `<span data-wm-field="event_date" data-wm-type="date" data-wm-date-value="2026-12-25">2026-12-25</span>`
- `photo_1`, `photo_2`, `photo_3`, `photo_4` (`type: "image"`) — `<img data-wm-field="photo_1" data-wm-type="image" src="assets/images/cover.jpg" alt="Memory">`
- `background_music` (`type: "audio"`) — `<audio id="wm-bg-music" data-wm-field="background_music" data-wm-type="audio" src="assets/audio/bgm.mp3" loop preload="auto"></audio>`
- `voice_note` (`type: "voice"`) — `<audio id="wm-voice-note" data-wm-field="voice_note" data-wm-type="voice" controls></audio>`
- Custom template fields: use descriptive snake_case IDs (`hero_title`, `hero_subtitle`, `bond_badge_title`, `secret_note`, `inside_joke_1`) declared in `wishmagic.json` and bound in `index.html`.

### RULE 5: SECTIONS DECLARATION (`sections` + `data-wm-section`)
Every major visual section in `index.html` must have `data-wm-section="<section_id>"` and be listed in `wishmagic.json` under `"sections"`.

### RULE 6: CAPABILITIES DECLARATION (`capabilities`)
Declare ONLY capabilities genuinely implemented in the package from:
`"photos"`, `"multiplePhotos"`, `"gallery"`, `"music"`, `"voice"`, `"video"`, `"countdown"`, `"timeline"`, `"themes"`, `"animations"`, `"particles"`, `"sections"`, `"secretMessage"`, `"finalSurprise"`.

### RULE 7: CSS THEME VARIABLES & VARIANT ATTRIBUTE SELECTORS (`css/style.css`)
Define `--wm-primary`, `--wm-secondary`, `--wm-accent`, `--wm-bg`, and `--wm-text` on `:root` in `css/style.css`. You can also style `[data-wm-relationship="<slug>"]` or `[data-wm-variant="<variant_id>"]` on `html`/`body` for relationship-specific visual accents.

### RULE 8: MANDATORY UTP v1.1.0 LIVE RUNTIME BRIDGE (`js/template.js`)
Include `<script src="/js/wishmagic-template-protocol.js"></script>` in `index.html` before `js/template.js`, and include this live hydration bridge in `js/template.js`:
```javascript
(function () {
  function applyWishMagicPayload(data) {
    if (!data || typeof data !== 'object') return;
    if (window.WishMagicTemplate && typeof window.WishMagicTemplate.applyData === 'function') {
      window.WishMagicTemplate.applyData(data);
    }
    if (data.event_date && typeof window.updateTemplateCountdown === 'function') {
      window.updateTemplateCountdown(data.event_date);
    }
  }

  window.addEventListener('message', function (event) {
    if (!event.data || typeof event.data !== 'object') return;
    if (
      event.data.type === 'WISHMAGIC_INIT' ||
      event.data.type === 'WISHMAGIC_LIVE_UPDATE' ||
      event.data.type === 'WISHMAGIC_UPDATE'
    ) {
      applyWishMagicPayload(event.data.payload);
    }
  });

  window.addEventListener('wishmagic:data-updated', function (event) {
    if (event.detail && typeof window.updateTemplateCountdown === 'function' && event.detail.event_date) {
      window.updateTemplateCountdown(event.detail.event_date);
    }
  });
})();
```

Now build a complete, production-ready, visually breathtaking UTP v1.1.0 WishMagic template package (`wishmagic.json`, `index.html`, `css/style.css`, `js/template.js`) for the following concept and relationship variants:
[WRITE YOUR TEMPLATE IDEA & VARIANTS HERE — e.g., "Template Name: BRO CODE. A high-energy interactive celebration template with 3 relationship variants: Best Friend, Brother, and Boyfriend. Includes an interactive fist-bump / vault unlock intro, live countdown, 3 memory photo cards, bond-meter badge, secret message unlock, and background music toggle."]
[COPY END]
