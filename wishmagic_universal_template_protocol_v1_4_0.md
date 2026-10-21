# WishMagic Universal Template Protocol (UTP v1.4.0)
## Festival Campaign Compatibility, Authoritative Server Scheduling Boundaries, Relationship-Aware Multi-Variant, Nested Section Visibility, Central Link Manager & Smart Template Recognition Standard

> **Version**: `1.4.0` (100% Backward Compatible with UTP `1.0.0`, `1.1.0`, `1.2.0`, and `1.3.0`)
> **Status**: Production Standard
> **Supported Schema Versions**: `"1.0.0"`, `"1.1.0"`, `"1.2.0"`, `"1.3.0"`, `"1.4.0"`
> **Supported Runtime API Versions**: `"1.0"`, `"1.1"`, `"1.2"`, `"1.3"`, `"1.4"`

---

## 1. Versioning, Evolution & Backward Compatibility

### 1.1 Relationship with UTP v1.3.0 and Earlier Versions
The **WishMagic Universal Template Protocol (UTP v1.4.0)** is the authoritative specification governing how celebration and festival templates are packaged, validated, ingested, assigned to festival campaigns, previewed, customized by customers, and rendered as immutable published wish pages.

UTP v1.4.0 is a **strictly additive, backward-compatible evolution** of UTP v1.3.0:
- **UTP `1.0.0` (Single-Variant Legacy)**: Works without modification. Flat `fields[]` and `sections[]` (or HTML-discovered `[data-wm-section]` elements) are normalized into the UTP v1.4.0 runtime graph.
- **UTP `1.1.0` (Relationship Multi-Variant Families)**: Preserves `variants[]`, relationship copy (`messages`), `theme`, `assets`, and `fields`.
- **UTP `1.2.0` (Nested Subsections & Action Registry)**: Preserves 3-level section/subsection hierarchy (`data-wm-section`, `data-wm-subsection`, `emptyParentPolicy`) and configurable `actions[]` (`data-wm-action`).
- **UTP `1.3.0` (Central Link Manager, Logical Links & Authoritative Variant Visibility)**: Preserves `global.*` and `template.*` logical link identifiers (`data-wm-link`), `enabledVariants`, `updatePolicy`, and customer-hideable photo slots (`data-wm-photo-slot`).
- **UTP `1.4.0` (Festival Metadata & Server-Controlled Campaign Scheduling)**:
  - Introduces optional `festivalMetadata` in `wishmagic.json` (`festivalTags`, `suitableRelationships`, `campaignCompatibility`, `displayBadge`, and advisory `suggestedPublicationPreferences`).
  - Enforces strict **Festival Scheduling Responsibility Boundaries**: templates declare descriptive festival compatibility metadata, while the platform's **Festival Scheduler** owns the authoritative festival dates, year-scoped manual overrides, and timezone-aware publication windows (`F - daysBefore` through `F + 3` calendar days inclusive).
  - Strictly rejects any template manifest that attempts to hardcode an authoritative festival date (`authoritativeFestivalDate`, `effectiveFestivalDate`, `forceActive`, `bypassSchedule`, `overrideServerSchedule`) or silently ignore unsupported `requiredCapabilities`.

### 1.2 Parser Behavior for Missing, Older, or Unknown Versions
- **Missing `schemaVersion`**: The normalizer (`normalizeManifestToUtp`) inspects the manifest structure and defaults to `"1.3.0"` (if subsections/actions are present), `"1.1.0"` (if `variants[]` are present), or `"1.0.0"`, without failing validation.
- **Declared `"1.0.0"`, `"1.1.0"`, `"1.2.0"`, `"1.3.0"`, or `"1.4.0"`**: Accepted and validated against the full UTP validator (`validateUtpManifest`). Existing v1.3.0 templates never need to be rewritten to remain valid.
- **Invalid SemVer (e.g., `"v1"`, `"latest"`)**: Rejected with `INVALID_SCHEMA_VERSION`.
- **Unsupported Major Version (e.g., `"2.0.0"`)**: Rejected with `INCOMPATIBLE_SCHEMA_MAJOR_VERSION`.
- **Unknown Minor Version (e.g., `"1.9.0"`)**: Rejected with `UNSUPPORTED_SCHEMA_VERSION`.
- **Unsupported `minimumRuntimeApi` (e.g., `"2.0"`)**: Rejected with `INCOMPATIBLE_RUNTIME_API`.
- **Unsupported `requiredCapabilities` / `compatibility.requiredFeatures`**: Rejected with blocking error `UNSUPPORTED_REQUIRED_FEATURE` so required platform capabilities are never silently ignored.

---

## 2. Canonical Template Package Structure & Security Rules

```text
template-package.zip
├── wishmagic.json         # MANDATORY: UTP v1.4.0 machine-readable manifest
├── index.html             # MANDATORY: Default HTML entry point with data-wm-* bindings
├── css/
│   └── style.css          # Stylesheet with :root --wm-* theme variables & responsive rules
├── js/
│   └── template.js        # Interactive runtime script + UTP live event bridge
├── assets/
│   ├── images/            # Optional default images & variant thumbnails (routed to ImgBB)
│   ├── audio/             # Optional default background music tracks (routed to Backblaze B2)
│   ├── video/             # Optional default video clips (routed to Backblaze B2)
│   └── fonts/             # Optional web fonts (routed to Backblaze B2)
└── variants/              # Optional dedicated HTML entries per relationship variant
```

### 2.1 File Responsibilities & Packaging Rules
1. **Required Files**:
   - `wishmagic.json` at the archive root (or single top-level folder wrapper, automatically normalized during extraction).
   - `index.html` (or the declared `template.entry` / `files.entry` HTML file).
2. **Optional Files**:
   - `css/style.css` (and any additional stylesheets listed in `files.styles`).
   - `js/template.js` (and any additional scripts listed in `files.scripts`).
   - Media assets under `assets/images/`, `assets/audio/`, `assets/video/`, `assets/fonts/`.
   - Variant-specific HTML entry files under `variants/` when a variant declares a custom `entry`.
3. **Relative Asset Path & Extraction Safety**:
   - Every path in `wishmagic.json`, `index.html`, and `css/style.css` must be a **safe relative path** (`css/style.css`, `assets/images/diwali-cover.jpg`) or an approved platform runtime script (`/js/wishmagic-template-protocol.js`).
   - Path traversal (`../`, `..\`), leading root slashes (`/etc/passwd`), Windows drive paths (`C:\...`), `file://` URIs, null bytes, symlink escapes, and server-side/executable extensions (`.php`, `.exe`, `.sh`, `.bat`, `.cmd`, `.dll`, `.py`, `.rb`, `.pl`, `.cgi`, `.jar`, `.msi`) are blocked during ZIP extraction (`UNSAFE_ENTRY_PATH`, `UNSAFE_LOCAL_ASSET_PATH`).
   - Missing declared entry files, missing variant entry files, missing stylesheets (`STYLESHEET_NOT_FOUND`), missing scripts (`SCRIPT_NOT_FOUND`), or missing required assets (`ASSET_NOT_FOUND`, `VARIANT_ASSET_NOT_FOUND`) block publication with actionable diagnostics.

---

## 3. Manifest & Field Definitions (`wishmagic.json`)

### 3.1 Top-Level Manifest Schema

| Property | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `$schema` | `string` | Recommended | Must be `"wishmagic-template"`. |
| `schemaVersion` | `string` | **Yes** | `"1.4.0"` (also supports `"1.0.0"`, `"1.1.0"`, `"1.2.0"`, `"1.3.0"`). |
| `template` | `object` | **Yes** | Core template identity, display name, version, category, tier, price, entry, thumbnail, and optional `updatePolicy`. |
| `compatibility` | `object` | No | `{ "runtimeApi": "1.4", "minimumRuntimeApi": "1.0", "requiredFeatures": [] }`. |
| `festivalMetadata` | `object` | No (v1.4.0) | Optional descriptive festival & campaign compatibility metadata (Section 7). |
| `files` | `object` | No | `{ "entry": "index.html", "styles": ["css/style.css"], "scripts": ["js/template.js"] }`. |
| `capabilities` | `string[]` | No | Array of implemented keys from `UTP_CAPABILITY_REGISTRY`. |
| `relationships` | `string[]` | No | Supported canonical or custom relationship slugs. |
| `sections` | `Section[]` | **Yes** | Hierarchical section and nested subsection definitions (up to depth 3). |
| `actions` | `Action[]` | No | Configurable CTA buttons and logical link bindings (`data-wm-action`). |
| `fields` | `Field[]` | **Yes** | Custom field definitions bound to `[data-wm-field]` elements. |
| `variants` | `Variant[]` | No | Multi-relationship variant definitions (`var_best_friend`, `var_brother`, `var_sister`, etc.). |

### 3.2 `template` Object Schema

| Property | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | **Yes** | Stable identifier matching `^[a-z0-9][a-z0-9_-]{1,63}$` (`MISSING_TEMPLATE_ID` / `TEMPLATE_ID_INVALID_FORMAT`). |
| `slug` | `string` | Recommended | URL-safe kebab-case slug. |
| `name` | `string` | **Yes** | Human-readable template display name (`MISSING_TEMPLATE_NAME`). |
| `templateVersion` | `string` | **Yes** | Valid SemVer string, e.g. `"1.4.0"` (`INVALID_TEMPLATE_VERSION`). |
| `description` | `string` | Recommended | Summary description shown in gallery and preview cards. |
| `category` | `string` | **Yes** | One of `"birthday"`, `"anniversary"`, `"love"`, `"romantic"`, `"friendship"`, `"festival"`, `"festivals"`, `"wedding"`, `"congratulations"`, `"thank-you"`, `"apology"`, `"proposal"`, `"graduation"`, `"new-baby"`, `"farewell"`, `"celebration"`, `"general"`. |
| `tier` | `string` | **Yes** | `"free"`, `"vip"`, or `"premium"` (`INVALID_TEMPLATE_TIER`). |
| `price` | `number` | No | Price in INR (`0` for free templates). |
| `entry` | `string` | No | Relative HTML entry path (defaults to `"index.html"`). |
| `thumbnail` | `string` | Recommended | Relative package path (`"assets/images/cover.jpg"`) or CDN URL. |
| `updatePolicy` | `object` | No | `{ "targetTemplateId", "targetSlug", "previousVersion", "preserveDisabledVariants": true }`. |

---

## 4. Custom Field Bindings (`fields[]` & `data-wm-field`)

### 4.1 Supported Field Types (`UTP_SUPPORTED_FIELD_TYPES`)
`"text"`, `"textarea"`, `"date"`, `"time"`, `"datetime"`, `"number"`, `"email"`, `"url"`, `"phone"`, `"color"`, `"select"`, `"multiselect"`, `"toggle"`, `"range"`, `"image"`, `"image-multiple"`, `"video"`, `"video-multiple"`, `"audio"`, `"voice"`, `"font"`, `"icon"`.

### 4.2 Supported Binding Targets (`UTP_SUPPORTED_BINDING_TARGETS`)
`"text"`, `"src"`, `"background-image"`, `"href"`, `"style-property"`, `"css-variable"`, `"visibility"`, `"toggle"`, `"collection"`, `"value"`.

### 4.3 Three-Way Field Binding Contract & Safe Rendering
1. **Manifest Declaration (`wishmagic.json -> fields[]`)**:
   ```json
   {
     "id": "recipient_name",
     "type": "text",
     "label": "Recipient Name",
     "placeholder": "e.g. Ananya",
     "required": true,
     "defaultValue": "Ananya",
     "section": "hero",
     "constraints": { "minLength": 1, "maxLength": 80 },
     "binding": { "target": "text", "selector": "[data-wm-field='recipient_name']" }
   }
   ```
2. **HTML Element Binding (`index.html`)**:
   ```html
   <span data-wm-field="recipient_name" data-wm-type="text">Ananya</span>
   <p data-wm-field="custom_message" data-wm-type="textarea">May this festival of lights bring endless joy and prosperity!</p>
   <span data-wm-field="event_date" data-wm-type="date" data-wm-date-value="2026-11-08">2026-11-08</span>
   <div class="wm-photo-card" data-wm-photo-slot="photo_1" data-wm-subsection="gallery_photo_1">
     <img data-wm-field="photo_1" data-wm-type="image" src="assets/images/cover-default.jpg" alt="Celebration Memory"/>
   </div>
   <audio id="wm-bg-music" data-wm-field="background_music" data-wm-type="audio" src="assets/audio/festive-chimes.mp3" loop preload="auto"></audio>
   ```
3. **XSS & Arbitrary Script Execution Prevention**:
   - All text, textarea, sender/recipient name, and date fields are rendered using `element.textContent` (never raw `innerHTML`) by `wishmagic-template-protocol.js`.
   - Arbitrary user-supplied HTML or JavaScript (`<script>`, `onerror=`, `javascript:`) in text fields is neutralized as literal text and scanned by the server moderation engine on `POST /api/wishes`.
   - Media fields (`image`, `audio`, `video`, `voice`) validate URLs and block executable extensions or dangerous schemes (`javascript:`, `vbscript:`, `data:text/html`).

---

## 5. Sections, Subsections & Complete DOM Removal (`sections[]`)

UTP v1.4.0 supports hierarchical sections and nested subsections up to **3 levels deep** (`UTP_MAX_SECTION_NESTING_DEPTH = 3`):
- **Top-level section (Depth 1)**: `data-wm-section="<section_id>"`
- **Child subsection (Depth 2 or Depth 3)**: `data-wm-subsection="<subsection_id>"`
- **Photo slot wrapper**: `data-wm-photo-slot="photo_X"`

### 5.1 Standard Section Patterns
- **`hero` (Intro / Opening Section)**: Typically `required: true, toggleable: false, defaultEnabled: true`. Contains `recipient_name`, `hero_title`, `hero_subtitle`, and primary CTA actions.
- **`countdown` (Optional Countdown Section)**: `required: false, toggleable: true`. Contains `event_date`.
- **`message` (Heartfelt Tribute / Greeting Section)**: Contains `custom_message` and `sender_name`.
- **`gallery` (Photo Album Section)**: Contains `photo_1`..`photo_6` wrapped in `[data-wm-photo-slot="photo_X"]` with auto-reflowing CSS Grid/Flexbox so hidden photo slots leave zero blank gaps.
- **`audio_section` / `secret_message` / `closing`**: Optional toggleable sections.

### 5.2 Physical DOM Removal Guarantee
When a section, subsection, or photo slot is disabled by admin configuration, relationship variant override, or customer customizer toggle (`_hiddenSections` / `_hiddenFields`):
- `WishMagicTemplate.removeDisabledContentFromDom()` pauses and clears any `<audio>`, `<video>`, or `<iframe>` elements inside the subtree, removes matching navigation anchors, and physically removes the node from the DOM (`node.remove()`).
- If all subsections inside a parent section are disabled and `emptyParentPolicy` is `"collapse"`, the parent section is also physically removed.

---

## 6. Relation Variants (`variants[]`) & Authoritative Variant Visibility

### 6.1 Supported Canonical Relationship Slugs (`UTP_CANONICAL_RELATIONSHIPS`)
`"best_friend"`, `"friend"`, `"brother"`, `"sister"`, `"sibling"`, `"mother"`, `"father"`, `"parents"`, `"grandparents"`, `"son"`, `"daughter"`, `"child"`, `"kids"`, `"family"`, `"boyfriend"`, `"girlfriend"`, `"husband"`, `"wife"`, `"partner"`, `"fiance"`, `"fiancee"`, `"life_partner"`, `"crush"`, `"colleague"`, `"boss"`, `"mentor"`, `"teacher"`.

### 6.2 Variant Declaration Capabilities
Each object in `variants[]` declares:
- `id` (unique variant ID, e.g., `"var_sister"`, `"var_brother"`, `"var_family"`), `slug`, `name`, `relationship`, `relationshipLabel`, `isDefault`, `order`, `enabled`, `status`, `entry`, `thumbnail`, `description`.
- `theme`: `{ "primary", "secondary", "accent", "background", "text" }`.
- `messages`: Relationship-specific default text overrides for bound fields (`hero_title`, `hero_subtitle`, `custom_message`, `secret_note`, `sender_name`).
- `assets`: Relationship-specific default media overrides (`photo_1`, `background_music`).
- `fields`: Relationship-specific field label/placeholder overrides or additional variant-bound fields.
- `visibilityOverrides`: Per-relationship section/subsection visibility booleans (`{ "secret_message": true, "gallery_secondary": false }`).
- `actions`: Per-relationship button label/destination overrides (`[{ "id": "hero_cta", "label": "Create for Your Sister", "type": "template_link", "logicalLink": "template.customize" }]`).

### 6.3 Two-Layer Variant Filtering (Template Config + Festival Campaign Assignment)
1. **Template-Level Authoritative Variant Visibility**: Only variants enabled in the template's published configuration (`enabled_variants_json` / `template_relationship_variants.enabled = 1`) are exposed publicly.
2. **Campaign-Level Variant Filtering**: When a template is assigned to a festival campaign (e.g., *Raksha Bandhan*), the administrator can restrict `allowedVariants` on that campaign assignment (e.g., `["brother", "sister"]`) without editing the template's files. Both the gallery and `POST /api/wishes` enforce the intersection of template-enabled variants and campaign-allowed variants (`422 VARIANT_NOT_ENABLED_FOR_CAMPAIGN`).

---

## 7. Festival Metadata & Campaign Compatibility (`festivalMetadata` — New in UTP v1.4.0)

### 7.1 Purpose & Schema of `festivalMetadata`
UTP v1.4.0 introduces an optional top-level `festivalMetadata` object in `wishmagic.json` (also accepted at `template.festivalMetadata`):

```json
"festivalMetadata": {
  "festivalTags": ["diwali", "deepavali", "bhai-dooj"],
  "suitableRelationships": ["family", "parents", "brother", "sister", "best_friend", "partner"],
  "campaignCompatibility": "evergreen_and_festival",
  "displayBadge": "✨ Festival of Lights Edition",
  "suggestedPublicationPreferences": {
    "suggestedDaysBefore": 15,
    "suggestedDaysAfter": 3,
    "advisoryOnly": true
  }
}
```

| Property | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `festivalTags` | `string[]` | No | Descriptive festival/occasion slugs (`"diwali"`, `"holi"`, `"raksha-bandhan"`, `"bhai-dooj"`, `"karwa-chauth"`, `"navratri"`, `"ganesh-chaturthi"`, `"eid-ul-fitr"`, `"christmas"`, `"new-year"`, `"valentines-day"`, `"friendship-day"`, etc.). Validated via `INVALID_FESTIVAL_TAGS` / `INVALID_FESTIVAL_TAG_ENTRY`. |
| `suitableRelationships` | `string[]` | No | Relationship slugs suitable for festival campaigns using this template. Validated via `INVALID_FESTIVAL_RELATIONSHIPS`. |
| `campaignCompatibility` | `string \| boolean` | No | One of `"festival_campaign"`, `"evergreen_and_festival"`, `"festival_only"`, `"any"`, or boolean. Validated via `INVALID_CAMPAIGN_COMPATIBILITY_MODE`. |
| `displayBadge` | `string` | No | Optional suggested badge text (max 80 chars) for admin campaign setup. |
| `suggestedPublicationPreferences` | `object` | No | Optional **advisory-only** window hints (`{ "suggestedDaysBefore": 15, "suggestedDaysAfter": 3, "advisoryOnly": true }`). Validated via `INVALID_FESTIVAL_SUGGESTED_PREFERENCES`. |

### 7.2 Festival Scheduling Responsibility Boundaries (Normative Security Rule)
1. **Templates Declare Descriptive Metadata Only**: A template's `wishmagic.json`, `index.html`, and `js/template.js` must **never** contain a hardcoded authoritative festival date or client-only scheduling gate.
2. **Campaigns Assign Templates to Festivals**: Administrators assign one or more existing templates to a festival campaign in the **Festival Scheduler**.
3. **The Platform Owns Effective Festival Dates**: Festival dates are resolved on the server via verified Panchang/Gazette calendar tables, deterministic calendar algorithms, external calendar providers, or year-scoped administrator manual overrides (`festival_date_overrides`). A future festival date change never requires editing any template package.
4. **The Backend Owns the Authoritative Publication Window**:
   - For effective festival date `F` in the configured festival `timezone` (default `Asia/Kolkata`):
     - `start_date = F - daysBefore` (default `15` calendar days, inclusive)
     - `end_date = F + daysAfter` (default `3` calendar days, inclusive)
     - `first_blocked_date = end_date + 1 calendar day`
     - Active Interval: `startOfDay(start_date, timezone) <= current_time < startOfDay(end_date + 1 calendar day, timezone)`
5. **Immediate Wish Creation vs. Post-Festival Campaign Expiry**:
   - During an active campaign window, users can create wishes immediately (even if `F` is up to 15 days away), and the generated public wish URL (`/w/:slug`) becomes publicly accessible **immediately** upon creation without waiting for `F` or a background job.
   - Starting at `startOfDay(end_date + 1 calendar day, timezone)`, the campaign stops accepting new wishes (`422 FESTIVAL_CAMPAIGN_EXPIRED`) and disappears from active festival gallery discovery, while **existing created wishes, template files, media assets, and unrelated campaigns remain 100% intact** under the existing wish lifecycle.
6. **Strict Validator Rejection of Schedule Bypass Keys (`TEMPLATE_CANNOT_OVERRIDE_SERVER_SCHEDULE`)**:
   - If a manifest includes any forbidden schedule-control property (`authoritativeFestivalDate`, `effectiveFestivalDate`, `fixedFestivalDate`, `hardcodedFestivalDate`, `festivalDate` inside `festivalMetadata`, `forceActive`, `alwaysActive`, `permanentlyActive`, `bypassSchedule`, `bypassCampaignWindow`, `overrideServerSchedule`, `ignoreExpiry`, `publicationStartDate`, `publicationEndDate`, or `suggestedPublicationPreferences.authoritative = true`), `validateUtpManifest()` rejects the package with a blocking `TEMPLATE_CANNOT_OVERRIDE_SERVER_SCHEDULE` error.

---

## 8. Theme Tokens, JavaScript Event Bridge & Logical Actions

### 8.1 CSS Theme & Design Tokens (`css/style.css`)
Templates must declare fallback values on `:root` so the template renders with a complete visual identity even before runtime overrides are applied:
```css
:root {
  --wm-primary: #f59e0b;
  --wm-secondary: #ec4899;
  --wm-accent: #fde047;
  --wm-bg: #0f0720;
  --wm-text: #ffffff;
}
```

### 8.2 JavaScript Runtime & Event Bridge (`js/template.js` + `/js/wishmagic-template-protocol.js`)
Include `<script src="/js/wishmagic-template-protocol.js"></script>` before `js/template.js`.
Supported runtime messages and DOM custom events:
- `window.postMessage` event types: `"WISHMAGIC_INIT"`, `"WISHMAGIC_LIVE_UPDATE"`, `"WISHMAGIC_UPDATE"`.
- Custom DOM event on `window`: `"wishmagic:data-updated"` (`event.detail` contains the hydrated payload).
- Global helper object: `window.WishMagicTemplate` (`version: "1.3.0"`, `utpVersion: "1.4.0"`, `supportedVersions: ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"]`, `applyData(payload)`, `removeDisabledContentFromDom(disabledIds, options)`, `applyActionsToDom(actionsMap, context)`, `resolveLogicalLink(logicalLink, context)`).

### 8.3 Template Actions & Logical Links (`data-wm-action` & `data-wm-link`)
- **Template-Specific Creation Links (`type: "template_link"`, `logicalLink: "template.customize" | "template.create" | "template.preview"`)**: Resolves to the current template's customizer/preview flow while preserving `template`, `variant`, `rel`, and `campaign` query parameters.
- **Global WishMagic Links (`type: "global_link"`, `logicalLink: "global.home" | "global.explore" | "global.browseTemplates" | "global.marketplace" | "global.createWish" | "global.pricing" | "global.help" | "global.contact"`)**: Resolves via the Central Link Manager's canonical domain.
- **In-Template Actions (`"section"`, `"modal"`, `"none"`)** and **Validated URLs (`"internal_url"`, `"external_url"`)**: Strictly block unsafe schemes (`javascript:`, `data:`, `vbscript:`, `file:`) and admin routes (`/admin/*`).

---

## 9. Accessibility & Responsive Design Requirements

Every UTP v1.4.0 template must provide:
1. `<meta name="viewport" content="width=device-width, initial-scale=1.0">` in `index.html`.
2. Semantic HTML landmarks (`<main>`, `<section>`, `<header>`, `<footer>`, `<button>`, `<a>`) and keyboard focusability (`tabindex`, `:focus-visible`, `Enter`/`Space` activation on interactive elements).
3. Readable color contrast and `@media (prefers-reduced-motion: reduce)` support so animations degrade gracefully for motion-sensitive users.
4. Balanced, overflow-free responsive layouts at both desktop (`1280px+`) and mobile (`375px`) viewports.

---

## 10. Complete Validated UTP v1.4.0 Examples

### 10.1 Festival-Compatible Multi-Variant `wishmagic.json` (UTP v1.4.0)
```json
{
  "$schema": "wishmagic-template",
  "schemaVersion": "1.4.0",
  "template": {
    "id": "royal-diwali-lights",
    "slug": "royal-diwali-lights",
    "name": "Royal Festival of Lights",
    "description": "Illuminated diyas, golden rangoli animations, and heartfelt festival blessings for Family, Brother, Sister, and Best Friend.",
    "templateVersion": "1.4.0",
    "category": "festival",
    "tier": "free",
    "price": 0,
    "author": "WishMagic Studio",
    "entry": "index.html",
    "thumbnail": "assets/images/diwali-cover.jpg",
    "updatePolicy": {
      "targetTemplateId": "royal-diwali-lights",
      "targetSlug": "royal-diwali-lights",
      "previousVersion": "1.3.0",
      "preserveDisabledVariants": true
    }
  },
  "compatibility": {
    "runtimeApi": "1.4",
    "minimumRuntimeApi": "1.0",
    "requiredFeatures": ["photos", "music", "sections", "festivalMetadata"]
  },
  "festivalMetadata": {
    "festivalTags": ["diwali", "deepavali", "bhai-dooj"],
    "suitableRelationships": ["family", "brother", "sister", "best_friend"],
    "campaignCompatibility": "evergreen_and_festival",
    "displayBadge": "✨ Diwali Special",
    "suggestedPublicationPreferences": {
      "suggestedDaysBefore": 15,
      "suggestedDaysAfter": 3,
      "advisoryOnly": true
    }
  },
  "files": {
    "entry": "index.html",
    "styles": ["css/style.css"],
    "scripts": ["js/template.js"]
  },
  "capabilities": [
    "photos",
    "multiplePhotos",
    "gallery",
    "music",
    "countdown",
    "themes",
    "animations",
    "particles",
    "sections",
    "subsections",
    "actions",
    "secretMessage",
    "variants",
    "festivalMetadata"
  ],
  "relationships": [
    "family",
    "brother",
    "sister",
    "best_friend"
  ],
  "sections": [
    {
      "id": "hero",
      "label": "Diya Illumination Hero",
      "required": true,
      "toggleable": false,
      "defaultEnabled": true,
      "order": 1,
      "emptyParentPolicy": "keep",
      "fields": ["recipient_name", "hero_title", "hero_subtitle"],
      "actions": ["hero_cta", "explore_memories_btn"],
      "subsections": [
        {
          "id": "hero_blessing_badge",
          "label": "Auspicious Blessing Crest",
          "required": false,
          "toggleable": true,
          "defaultEnabled": true,
          "order": 1
        },
        {
          "id": "hero_cta_bar",
          "label": "Hero Action Bar",
          "required": false,
          "toggleable": true,
          "defaultEnabled": true,
          "order": 2,
          "actions": ["hero_cta", "explore_memories_btn"]
        }
      ]
    },
    {
      "id": "countdown",
      "label": "Festival Celebration Countdown",
      "required": false,
      "toggleable": true,
      "defaultEnabled": true,
      "order": 2,
      "fields": ["event_date"]
    },
    {
      "id": "message",
      "label": "Festive Blessing Letter",
      "required": true,
      "toggleable": false,
      "defaultEnabled": true,
      "order": 3,
      "fields": ["custom_message", "sender_name"]
    },
    {
      "id": "gallery",
      "label": "Golden Festival Memories",
      "required": false,
      "toggleable": true,
      "defaultEnabled": true,
      "order": 4,
      "emptyParentPolicy": "collapse",
      "fields": ["photo_1", "photo_2"],
      "subsections": [
        {
          "id": "gallery_photo_1",
          "label": "Featured Photo Slot 1",
          "required": false,
          "toggleable": true,
          "defaultEnabled": true,
          "order": 1,
          "fields": ["photo_1"]
        },
        {
          "id": "gallery_photo_2",
          "label": "Memory Photo Slot 2",
          "required": false,
          "toggleable": true,
          "defaultEnabled": true,
          "order": 2,
          "fields": ["photo_2"]
        }
      ]
    },
    {
      "id": "secret_message",
      "label": "Lantern Secret Wish",
      "required": false,
      "toggleable": true,
      "defaultEnabled": true,
      "order": 5,
      "fields": ["secret_note"],
      "actions": ["explore_more_btn"]
    }
  ],
  "actions": [
    {
      "id": "hero_cta",
      "label": "Make For Yours",
      "type": "template_link",
      "logicalLink": "template.customize",
      "target": "/customize.html",
      "sectionId": "hero_cta_bar",
      "editableLabel": true,
      "configurable": true,
      "relationshipSpecific": true,
      "required": false,
      "defaultEnabled": true,
      "fallbackBehavior": "hide"
    },
    {
      "id": "explore_memories_btn",
      "label": "View Festive Gallery",
      "type": "section",
      "target": "gallery",
      "sectionId": "hero_cta_bar",
      "editableLabel": true,
      "configurable": true,
      "relationshipSpecific": true,
      "required": false,
      "defaultEnabled": true,
      "fallbackBehavior": "hide"
    },
    {
      "id": "explore_more_btn",
      "label": "Explore More",
      "type": "global_link",
      "logicalLink": "global.explore",
      "target": "/templates.html",
      "sectionId": "secret_message",
      "editableLabel": true,
      "configurable": true,
      "relationshipSpecific": false,
      "required": false,
      "defaultEnabled": true,
      "fallbackBehavior": "hide"
    }
  ],
  "fields": [
    {
      "id": "recipient_name",
      "type": "text",
      "label": "Recipient Name",
      "placeholder": "e.g. Sharma Family",
      "required": true,
      "defaultValue": "Aarav & Family",
      "section": "hero",
      "binding": { "target": "text", "selector": "[data-wm-field='recipient_name']" }
    },
    {
      "id": "hero_title",
      "type": "text",
      "label": "Festival Headline",
      "required": false,
      "defaultValue": "SHUBH DEEPAVALI",
      "section": "hero",
      "binding": { "target": "text", "selector": "[data-wm-field='hero_title']" }
    },
    {
      "id": "hero_subtitle",
      "type": "text",
      "label": "Festival Subtitle",
      "required": false,
      "defaultValue": "May thousands of lamps light up your life with joy and prosperity",
      "section": "hero",
      "binding": { "target": "text", "selector": "[data-wm-field='hero_subtitle']" }
    },
    {
      "id": "event_date",
      "type": "date",
      "label": "Celebration Date",
      "required": false,
      "defaultValue": "2026-11-08",
      "section": "countdown",
      "binding": { "target": "text", "selector": "[data-wm-field='event_date']" }
    },
    {
      "id": "custom_message",
      "type": "textarea",
      "label": "Festival Message",
      "required": false,
      "defaultValue": "Wishing you and your loved ones a radiant festival filled with peace, warmth, and sweet moments together!",
      "section": "message",
      "binding": { "target": "text", "selector": "[data-wm-field='custom_message']" }
    },
    {
      "id": "secret_note",
      "type": "textarea",
      "label": "Lantern Secret Blessing",
      "required": false,
      "defaultValue": "May this year bring every dream you have worked so hard for into reality!",
      "section": "secret_message",
      "binding": { "target": "text", "selector": "[data-wm-field='secret_note']" }
    },
    {
      "id": "sender_name",
      "type": "text",
      "label": "From (Your Name)",
      "required": false,
      "defaultValue": "— With Warm Regards",
      "section": "message",
      "binding": { "target": "text", "selector": "[data-wm-field='sender_name']" }
    },
    {
      "id": "photo_1",
      "type": "image",
      "label": "Featured Celebration Photo",
      "required": false,
      "defaultValue": "assets/images/diwali-cover.jpg",
      "section": "gallery",
      "subsection": "gallery_photo_1",
      "binding": { "target": "src", "selector": "[data-wm-field='photo_1']" }
    },
    {
      "id": "photo_2",
      "type": "image",
      "label": "Celebration Memory 2",
      "required": false,
      "defaultValue": "assets/images/diwali-memory-2.jpg",
      "section": "gallery",
      "subsection": "gallery_photo_2",
      "binding": { "target": "src", "selector": "[data-wm-field='photo_2']" }
    }
  ],
  "variants": [
    {
      "id": "var_family",
      "slug": "family",
      "name": "Royal Festival of Lights — Family Edition",
      "relationship": "family",
      "relationshipLabel": "Family",
      "description": "Warm traditional blessings crafted for your entire family.",
      "entry": "index.html",
      "thumbnail": "assets/images/diwali-cover.jpg",
      "status": "published",
      "enabled": true,
      "isDefault": true,
      "order": 1,
      "theme": {
        "primary": "#f59e0b",
        "secondary": "#ea580c",
        "accent": "#fde047",
        "background": "#160702",
        "text": "#ffffff"
      },
      "messages": {
        "hero_title": "SHUBH DEEPAVALI TO OUR FAMILY",
        "hero_subtitle": "Together is our brightest blessing",
        "custom_message": "Every festival shines brighter because of the love and laughter we share as a family.",
        "sender_name": "— With Love Always"
      },
      "actions": [
        {
          "id": "hero_cta",
          "label": "Create for Your Family",
          "type": "template_link",
          "logicalLink": "template.customize",
          "target": "/customize.html"
        }
      ]
    },
    {
      "id": "var_sister",
      "slug": "sister",
      "name": "Royal Festival of Lights — Sister Edition",
      "relationship": "sister",
      "relationshipLabel": "Sister",
      "description": "Sparkling festive tribute for your sister.",
      "entry": "index.html",
      "thumbnail": "assets/images/diwali-cover.jpg",
      "status": "published",
      "enabled": true,
      "isDefault": false,
      "order": 2,
      "theme": {
        "primary": "#ec4899",
        "secondary": "#f59e0b",
        "accent": "#fde047",
        "background": "#1a0618",
        "text": "#ffffff"
      },
      "messages": {
        "hero_title": "HAPPY DIWALI & BHAI DOOJ, DEAR SISTER",
        "hero_subtitle": "You light up every celebration in our home",
        "custom_message": "Thank you for filling every festival with warmth, sweetness, and unforgettable sibling memories!",
        "sender_name": "— Your Sibling"
      },
      "actions": [
        {
          "id": "hero_cta",
          "label": "Create for Your Sister",
          "type": "template_link",
          "logicalLink": "template.customize",
          "target": "/customize.html"
        }
      ]
    },
    {
      "id": "var_brother",
      "slug": "brother",
      "name": "Royal Festival of Lights — Brother Edition",
      "relationship": "brother",
      "relationshipLabel": "Brother",
      "description": "Vibrant festival greeting crafted for your brother.",
      "entry": "index.html",
      "thumbnail": "assets/images/diwali-cover.jpg",
      "status": "published",
      "enabled": true,
      "isDefault": false,
      "order": 3,
      "theme": {
        "primary": "#38bdf8",
        "secondary": "#f59e0b",
        "accent": "#fde047",
        "background": "#07131e",
        "text": "#ffffff"
      },
      "messages": {
        "hero_title": "HAPPY DIWALI & BHAI DOOJ, BROTHER",
        "hero_subtitle": "Lifelong protector, partner-in-crime, and brother",
        "custom_message": "Wishing my brother a year of massive wins, good health, and endless happiness!",
        "sender_name": "— Your Sibling"
      },
      "actions": [
        {
          "id": "hero_cta",
          "label": "Create for Your Brother",
          "type": "template_link",
          "logicalLink": "template.customize",
          "target": "/customize.html"
        }
      ]
    },
    {
      "id": "var_best_friend",
      "slug": "best-friend",
      "name": "Royal Festival of Lights — Best Friend Edition",
      "relationship": "best_friend",
      "relationshipLabel": "Best Friend",
      "description": "High-spirit festive celebration for your best friend.",
      "entry": "index.html",
      "thumbnail": "assets/images/diwali-cover.jpg",
      "status": "published",
      "enabled": true,
      "isDefault": false,
      "order": 4,
      "theme": {
        "primary": "#a855f7",
        "secondary": "#f59e0b",
        "accent": "#38bdf8",
        "background": "#120824",
        "text": "#ffffff"
      },
      "messages": {
        "hero_title": "HAPPY DIWALI, BESTIE!",
        "hero_subtitle": "More lights, more sweets, more crazy memories together",
        "custom_message": "Life is a festival with a best friend like you! Wishing you the brightest celebration ever!",
        "sender_name": "— Your Best Friend"
      },
      "actions": [
        {
          "id": "hero_cta",
          "label": "Create for Your Best Friend",
          "type": "template_link",
          "logicalLink": "template.customize",
          "target": "/customize.html"
        }
      ]
    }
  ]
}
```

### 10.2 Safe Template JavaScript Initialization (`js/template.js`)
```javascript
(function () {
  function applyFestivalTemplateUpdate(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (window.WishMagicTemplate && typeof window.WishMagicTemplate.applyData === 'function') {
      window.WishMagicTemplate.applyData(payload);
    }
    // Always guard DOM queries against sections/subsections removed by admin or customer
    const countdownEl = document.querySelector('[data-wm-section="countdown"]');
    if (countdownEl && payload.event_date && typeof window.updateTemplateCountdown === 'function') {
      window.updateTemplateCountdown(payload.event_date);
    }
  }

  window.addEventListener('message', function (event) {
    if (!event.data || typeof event.data !== 'object') return;
    if (
      event.data.type === 'WISHMAGIC_INIT' ||
      event.data.type === 'WISHMAGIC_LIVE_UPDATE' ||
      event.data.type === 'WISHMAGIC_UPDATE'
    ) {
      applyFestivalTemplateUpdate(event.data.payload);
    }
  });

  window.addEventListener('wishmagic:data-updated', function (event) {
    if (event.detail) {
      applyFestivalTemplateUpdate(event.detail);
    }
  });
})();
```

---

## 11. Creator Validation Checklist (Mandatory Pre-Delivery Gate)

Before delivering any UTP v1.4.0 template package, the creator or AI tool must verify all 14 items:
1. **Manifest Validity**: `wishmagic.json` is valid JSON at the root of the package and declares `"schemaVersion": "1.4.0"`.
2. **Required File Presence**: `wishmagic.json`, `index.html`, `css/style.css`, and `js/template.js` exist at their declared relative paths.
3. **Field Binding Consistency**: Every field in `fields[]` (and `variants[].fields[]`) has a matching `[data-wm-field="<id>"][data-wm-type="<type>"]` element in `index.html` and declares its parent `"section"`.
4. **Relation Variant Consistency**: Every variant in `variants[]` has a unique `id`, unique `slug`, valid `relationship`, tailored `theme` and `messages`, and valid `visibilityOverrides` / `actions`.
5. **Asset Path Safety**: All local references use safe relative paths (`assets/images/...`) with zero `../`, `/`, `C:\`, `file://`, or executable files.
6. **Responsive Layout**: Renders cleanly at both desktop (`1280px+`) and mobile (`375px`) viewports without horizontal overflow.
7. **Accessibility**: Semantic HTML, keyboard operable buttons/modals, readable contrast, and `@media (prefers-reduced-motion: reduce)` support.
8. **Event Bridge Compatibility**: Includes `<script src="/js/wishmagic-template-protocol.js"></script>` before `js/template.js` and listens for `WISHMAGIC_INIT`, `WISHMAGIC_LIVE_UPDATE`, `WISHMAGIC_UPDATE`, and `wishmagic:data-updated`.
9. **No Hardcoded Authoritative Festival Dates**: Does NOT set `authoritativeFestivalDate`, `effectiveFestivalDate`, `forceActive`, `bypassSchedule`, or `overrideServerSchedule`.
10. **No Client-Only Scheduling Gates**: Does NOT block rendering or wish access in template JavaScript based on hardcoded calendar dates.
11. **DOM Removal Resilience & Photo Slot Wrappers**: Guards all DOM selectors with null checks (`if (!el) return;`) and wraps multi-photo cards in `data-wm-photo-slot="photo_X"` with flexible CSS Grid/Flexbox reflow.
12. **Package Validation**: Passes `validateUtpManifest()` with `valid: true` and `publishable: true`.
13. **Preview Testing**: Works in both Desktop and Mobile preview modes across all declared relationship variants.
14. **Version Declaration**: Declares `"schemaVersion": "1.4.0"` and `"compatibility": { "runtimeApi": "1.4", "minimumRuntimeApi": "1.0" }`.
