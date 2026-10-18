# WishMagic Universal Template Protocol (UTP v1.2.0)
## Relationship-Aware Multi-Variant, Nested Section Visibility & Configurable Button/Action Standard

> **Version**: `1.2.0` (100% Backward Compatible with UTP `1.0.0` and `1.1.0`)
> **Status**: Production Standard
> **Supported Schema Versions**: `"1.0.0"`, `"1.1.0"`, `"1.2.0"`
> **Supported Runtime API Versions**: `"1.0"`, `"1.1"`, `"1.2"`

---

## 1. Architectural Overview & Package Modes

The **WishMagic Universal Template Protocol (UTP v1.2.0)** is the canonical machine-readable specification governing how celebration website templates are packaged, validated, ingested, configured by admins, previewed, customized by customers, and rendered as immutable published wish websites.

### Supported Package Modes (100% Backward Compatible)
1. **Legacy Single-Variant Package (`schemaVersion: "1.0.0"`)**
   - Works without modification. Flat `sections[]` (or HTML-discovered `[data-wm-section]` elements) and `fields[]` are automatically normalized into the UTP v1.2.0 section/subsection/action graph.
2. **Multi-Variant Relationship Package (`schemaVersion: "1.1.0"`)**
   - Supports `variants[]` with per-relationship copy (`messages`), `theme`, `assets`, `fields`, and flat `sections`. Automatically upgraded at runtime to support UTP v1.2.0 visibility overrides and action overrides.
3. **Full UTP v1.2.0 Package (`schemaVersion: "1.2.0"`)**
   - Adds nested `subsections[]` (up to 3 levels deep), `emptyParentPolicy`, deterministic `actions[]` registry (`data-wm-action`), template-wide `visibilityConfig` & `actionsConfig`, and relationship-specific `variants[].visibilityOverrides` & `variants[].actions`.

---

## 2. Canonical ZIP Package Layout & File Security Rules

```text
template-package.zip
├── wishmagic.json         # MANDATORY: UTP v1.2.0 machine-readable manifest
├── index.html             # MANDATORY: Default HTML entry point with data-wm-* bindings
├── css/
│   └── style.css          # Stylesheet with :root --wm-* theme variables
├── js/
│   └── template.js        # Interactive runtime script + UTP live message bridge
├── assets/
│   ├── images/            # Default images & variant thumbnails (routed to ImgBB)
│   ├── audio/             # Default background music tracks (routed to Backblaze B2)
│   ├── video/             # Default video clips (routed to Backblaze B2)
│   └── fonts/             # Optional web fonts (routed to Backblaze B2)
└── variants/              # Optional dedicated HTML entries per variant
```

### Strict Package Security & Path Rules
- All asset, script, style, and entry paths must be **safe relative paths** (`css/style.css`, `assets/images/cover.jpg`).
- Path traversal (`../`), leading slashes (`/etc/...`), local drive paths (`C:\...`, `file://`), and server executables (`.php`, `.exe`, `.sh`, `.py`, `.bat`, `.dll`) are rejected during upload validation.
- The upload processor deterministically parses `wishmagic.json` and HTML entry files (`index.html` and any `variants[].entry`). It never infers hidden features from `README.md` or untrusted script text.

---

## 3. Section & Nested Subsection Manifest (`sections[]`)

UTP v1.2.0 extends `sections[]` in `wishmagic.json` to support hierarchical **sections** and nested **subsections** up to **3 levels deep** (`UTP_MAX_SECTION_NESTING_DEPTH = 3`: Level 1 Section → Level 2 Subsection → Level 3 Nested Subsection).

### 3.1 Section & Subsection Object Schema

| Property | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | **Yes** | — | Stable, unique identifier matching `^[a-zA-Z0-9_-]{1,64}$`. Must not depend on visible labels or button text. Unique across the entire section/subsection tree. |
| `label` | `string` | **Yes** | Formatted `id` | Human-readable admin label shown in the Admin Visibility Manager. |
| `order` | `integer` | No | Array index + 1 | Deterministic display and customizer ordering (`1`, `2`, `3`, ...). |
| `required` | `boolean` | No | `false` (`true` for `hero`) | Platform/template constraint. If `true`, the section is mandatory and cannot be disabled by admin or variant overrides. |
| `toggleable` | `boolean` | No | `!required` | Whether admins can toggle visibility. If `required: true`, `toggleable` is forced to `false`. |
| `defaultEnabled` | `boolean` | No | `true` | Manifest default visibility state. Must be an explicit boolean (`true` or `false`). If `required: true`, must be `true`. |
| `emptyParentPolicy` | `string` | No | `"collapse"` | `"collapse"` or `"keep"`. Controls parent behavior when all child subsections are disabled and no standalone non-subsection visible content remains. |
| `fields` | `string[]` | No | `[]` | Explicit list of `fields[].id` values belonging to this section/subsection. (Fields may also declare `"section": "<section_id>"` or `"subsection": "<subsection_id>"`). |
| `actions` | `string[]` | No | `[]` | Explicit list of `actions[].id` values contained inside this section/subsection. |
| `subsections` | `Section[]` | No | `[]` | Nested child subsections (supported up to depth 3). |

### 3.2 HTML Binding Attributes for Sections & Subsections
- **Top-level section (Depth 1)**: `data-wm-section="<section_id>"`
- **Nested subsection (Depth 2 or Depth 3)**: `data-wm-subsection="<subsection_id>"` (or nested `[data-wm-section="<subsection_id>"]` inside a parent `[data-wm-section]`).

```html
<section data-wm-section="hero">
  <div data-wm-subsection="hero_header">
    <h1 data-wm-field="hero_title" data-wm-type="text">THE UNBREAKABLE CODE</h1>
    <p data-wm-field="hero_subtitle" data-wm-type="text">Legends by loyalty</p>
  </div>
  <div data-wm-subsection="hero_cta_group">
    <button data-wm-action="hero_explore_btn">Explore Memories</button>
    <a data-wm-action="hero_customize_btn" href="/customize.html">Create Your Wish</a>
  </div>
</section>
```

### 3.3 Edge-Case & Validation Rules for Sections/Subsections

| Condition | Validator / Runtime Behavior | Error / Warning Code |
| :--- | :--- | :--- |
| **Missing section declarations** | Legacy templates (`1.0.0`/`1.1.0`) without `sections[]` auto-discover `[data-wm-section]` from HTML with a warning; if none exist, a synthetic `main` section is registered. | `MISSING_SECTIONS_DECLARATION` (warning for legacy) |
| **Undeclared HTML sections/subsections** | Any `data-wm-section` or `data-wm-subsection` present in HTML but omitted from `wishmagic.json` is flagged during upload inspection and auto-registered into the admin editor so no DOM region is orphaned. | `UNDECLARED_HTML_SECTION` / `UNDECLARED_HTML_SUBSECTION` |
| **Manifest section missing in HTML** | If `wishmagic.json` declares a section or subsection `id` that has no matching `[data-wm-section]` or `[data-wm-subsection]` in HTML, validation fails. | `MISSING_HTML_SECTION_BINDING` / `MISSING_HTML_SUBSECTION_BINDING` |
| **Duplicate section/subsection IDs** | Rejected immediately; every section and subsection across all nesting levels must have a globally unique `id`. | `DUPLICATE_SECTION_ID` |
| **Nesting depth > 3** | Rejected with a clear error specifying `UTP_MAX_SECTION_NESTING_DEPTH = 3`. | `MAX_SECTION_NESTING_EXCEEDED` |
| **Invalid boolean defaults** | Non-boolean `defaultEnabled`, `toggleable`, or `required` values (e.g., `"yes"`, `123`) are rejected. | `INVALID_SECTION_DEFAULT_ENABLED` / `INVALID_SECTION_TOGGLEABLE` |
| **Required section with `defaultEnabled: false` or `toggleable: true`** | Rejected during manifest validation (`required` sections must remain enabled and non-toggleable). | `REQUIRED_SECTION_DISABLED_BY_DEFAULT` / `CONFLICTING_REQUIRED_TOGGLEABLE` |
| **Unknown subsection ID in admin override** | Rejected by `validateAdminTemplateConfiguration` before saving or publishing. | `UNKNOWN_SECTION_OR_SUBSECTION_ID` |
| **Admin attempts to disable a non-toggleable / required section** | Rejected with HTTP 400 / validation error before publication. | `NON_TOGGLEABLE_SECTION_OVERRIDE` |
| **Subsection enabled while parent section is disabled** | Parent disable strictly wins (`effectiveEnabled: false`, `disabledByParent: true`). All child subsections, fields, and actions inside a disabled parent are completely removed from customer view. | Enforced deterministically by `resolveEffectiveTemplateConfiguration` |
| **Fields or actions referencing disabled sections/subsections** | Automatically excluded from customer customizer, preview, and final wish renderer; any customer payload keys targeting disabled fields are stripped server-side. | Enforced by `sanitizeCustomerWishDataAgainstConfig` |

---

## 4. Relationship-Specific & Template-Wide Visibility Precedence

Admins can configure section and subsection visibility at two scopes:
1. **ALL RELATIONSHIPS (Template-Wide)**: Stored in `visibilityConfig` (`templates.visibility_config_json` / `template_versions.visibility_config_json`). Applies to all variants unless overridden by a specific relationship.
2. **ONE RELATIONSHIP (Variant-Specific)**: Stored in `variants[].visibilityOverrides` (`template_relationship_variants.visibility_json`). Applies only to the selected relationship variant.

### 4.1 Deterministic 4-Tier Visibility Precedence Order
For every section and subsection node $S$ and relationship variant $V$:
1. **Tier 1 — Platform & Structural Constraints (Highest Priority)**:
   - If $S$ has `required: true` or `toggleable: false`, $S$ is **always enabled** (`effectiveEnabled = true`, `source = "required_constraint"`). No template-wide or variant override can disable it.
   - If any ancestor section of $S$ is effectively disabled (`parentEffectiveEnabled === false`), $S$ is **always disabled** (`effectiveEnabled = false`, `disabledByParent = true`, `source = "parent_disabled"`), regardless of any child override.
2. **Tier 2 — Published Relationship Variant Override (`variant_override`)**:
   - If $V$ specifies a boolean in `visibilityOverrides[S.id]` (or `variants[].sections[]` with `{ "id": S.id, "enabled": true|false }`), that boolean is used (`source = "variant_override"`).
   - **Global-Disable Override Policy**: WishMagic implements an **Explicit Variant Override Policy** (`allowVariantOverrideOfGlobalDisable: true`): if a toggleable section is disabled in **All Relationships**, an admin can explicitly override it to `enabled: true` for a single relationship variant (e.g., enabling a `"Romantic Vault"` section only for `Boyfriend`/`Girlfriend` while keeping it disabled globally for `Brother`/`Best Friend`), **provided** its parent section is enabled and platform constraints permit it.
3. **Tier 3 — Published Template-Wide Admin Setting (`template_config`)**:
   - If `visibilityConfig[S.id]` defines an explicit boolean, that value is used (`source = "template_config"`).
4. **Tier 4 — Manifest Default (`manifest_default`, Lowest Priority)**:
   - Falls back to `S.defaultEnabled` (default `true`).

---

## 5. Complete Removal of Disabled Content from Customer Experience

When a section or subsection resolves to `effectiveEnabled: false`:
1. **Physical DOM Removal (`el.remove()`)**:
   - `WishMagicTemplate.removeDisabledContentFromDom()` physically removes matching `[data-wm-section="<id>"]` and `[data-wm-subsection="<id>"]` nodes from the DOM (`node.remove()`), never relying solely on CSS `display: none`.
2. **Media, Timer & Interaction Cleanup**:
   - Before removing a disabled DOM subtree, all `<audio>`, `<video>`, and `<iframe>` elements inside it are paused, their `src` attributes are cleared, and any registered section timers/observers are cleaned up so background audio or animations from a removed section never leak.
3. **Navigation, Anchor & Button Cleanup**:
   - Any navigation link (`<a href="#<disabled_id>">`, `[data-wm-nav-target="<disabled_id>"]`) or section index pill pointing to a disabled section/subsection is automatically removed from the DOM.
4. **Coherent Parent Layout & Empty-Parent Policy**:
   - If a subsection is disabled, its parent section retains a coherent layout.
   - If all child subsections inside a parent section are disabled and no standalone visible content remains inside the parent, and `emptyParentPolicy` is `"collapse"` (the default), the parent section itself is physically removed from the DOM so no empty container, blank space, orphaned heading, or broken divider remains.
5. **Customer Customizer & Server Sanitization**:
   - Disabled sections, subsections, and their bound fields are completely omitted from the Customer Customizer (`customize-engine.js`) and section toggle controls.
   - Server endpoints (`POST /api/wishes`, `PUT /api/wishes/:id`) run `sanitizeCustomerWishDataAgainstConfig()` to strip any client-supplied field values or section toggle flags targeting disabled sections/subsections.

---

## 6. Button & Link Action Registry (`actions[]`)

UTP v1.2.0 introduces a machine-readable `actions[]` array in `wishmagic.json` and `data-wm-action="<action_id>"` bindings in HTML.

### 6.1 Supported Action Types (`UTP_SUPPORTED_ACTION_TYPES`)

Only action types that the real WishMagic application can execute are supported:

| Action Type | Target Requirement | Runtime Execution Behavior |
| :--- | :--- | :--- |
| `"internal_url"` | Valid WishMagic route (`/` , `/templates.html`, `/marketplace.html`, `/template-preview.html`, `/customize.html`, `/create.html`, `/wish.html`, `/pricing.html`, `/premium.html`, `/my-wishes.html`, `/favorites.html`, `/help.html`, `/contact.html`, `/legal.html`) | Navigates to the validated internal route while automatically preserving `template`, `variant`, and `rel` query parameters when navigating to `/template-preview.html`, `/customize.html`, or `/create.html`. |
| `"external_url"` | Safe `https://` URL (`http://` rejected unless explicitly permitted) | Navigates safely (`target="_blank" rel="noopener noreferrer"` when `openInNewTab: true`). Blocks `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, and protocol-relative `//` URLs. |
| `"section"` | Enabled `sectionId` or `subsectionId` (or `#<id>`) | Smooth-scrolls to the target `[data-wm-section]` or `[data-wm-subsection]` if enabled for the active relationship; otherwise applies `fallbackBehavior` (`"hide"` by default). |
| `"modal"` | Existing modal ID (`[data-wm-modal="<id>"]` or `#<id>`) | Opens the target template modal (`data-wm-modal-open="true"`, `aria-hidden="false"`) if present in the DOM and not inside a disabled section; otherwise applies `fallbackBehavior`. |
| `"customizer"` | Optional (`"/customize.html"` default) | Navigates directly to the WishMagic Customizer with the current `template`, `variant`, and `rel` context pre-selected so the visitor is never prompted to re-select the relationship. |
| `"none"` | None (`""`) | Renders the button as a passive visual trigger (or hides it if `fallbackBehavior: "hide"` and disabled) without navigation. |

### 6.2 Action Object Schema (`actions[]` in `wishmagic.json`)

```json
{
  "id": "hero_cta",
  "label": "Create for Your Best Friend",
  "type": "customizer",
  "target": "/customize.html",
  "sectionId": "hero_cta_group",
  "editableLabel": true,
  "configurable": true,
  "relationshipSpecific": true,
  "required": false,
  "defaultEnabled": true,
  "openInNewTab": false,
  "fallbackBehavior": "hide"
}
```

| Property | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | **Yes** | — | Stable identifier matching `^[a-zA-Z0-9_-]{1,64}$`. Bound in HTML via `data-wm-action="<id>"`. Independent of visible button text. |
| `label` | `string` | **Yes** | — | Default visible button/link text (max 120 chars). Always rendered via `textContent` / HTML escaping. |
| `type` | `string` | **Yes** | `"section"` | One of `"internal_url"`, `"external_url"`, `"section"`, `"modal"`, `"customizer"`, `"none"`. |
| `target` | `string` | Conditional | `""` | Destination URL (for `internal_url`/`external_url`), target section/subsection ID (for `section`), or target modal ID (for `modal`). |
| `sectionId` | `string` | No | Auto-detected | Optional parent section/subsection ID containing this button. If that section/subsection is disabled, the action is automatically disabled and removed. |
| `editableLabel` | `boolean` | No | `true` | Whether admins can edit the button label in Upload / Edit Template. |
| `configurable` | `boolean` | No | `true` | Whether admins can change `type`, `target`, `enabled`, or `fallbackBehavior`. |
| `relationshipSpecific` | `boolean` | No | `true` | Whether relationship variants may override this action's label, type, target, or enabled state. |
| `required` | `boolean` | No | `false` | If `true`, the action cannot be disabled by admin configuration (`enabled: false` is rejected). |
| `defaultEnabled` | `boolean` | No | `true` | Default enabled state in manifest. |
| `openInNewTab` | `boolean` | No | `true` for `external_url`, `false` otherwise | Whether external links open in a new tab with `rel="noopener noreferrer"`. |
| `fallbackBehavior` | `string` | No | `"hide"` | `"hide"` (physically remove from DOM when target is disabled/unavailable), `"disable"` (render disabled/non-interactive), or `"none"`. |

### 6.3 Relationship-Specific Action Overrides (`variants[].actions`)
Each variant in `variants[]` (or admin overrides in `variantOverrides[relSlug].actions`) can tailor button labels and destinations per relationship:
```json
"variants": [
  {
    "id": "var_best_friend",
    "relationship": "best_friend",
    "relationshipLabel": "Best Friend",
    "actions": [
      {
        "id": "hero_cta",
        "label": "Create for Your Best Friend",
        "type": "customizer",
        "target": "/customize.html"
      }
    ]
  },
  {
    "id": "var_brother",
    "relationship": "brother",
    "relationshipLabel": "Brother",
    "actions": [
      {
        "id": "hero_cta",
        "label": "Create for Your Brother",
        "type": "customizer",
        "target": "/customize.html"
      }
    ]
  }
]
```

### 6.4 Action Validation Error Codes
- `INVALID_ACTION_ID` / `DUPLICATE_ACTION_ID`: Missing, malformed, or duplicate `actions[].id`.
- `UNSUPPORTED_ACTION_TYPE`: Action `type` is not one of the 6 supported types.
- `UNSAFE_URL_SCHEME`: URL uses `javascript:`, `data:`, `file:`, `vbscript:`, `blob:`, or `//`.
- `UNSUPPORTED_INTERNAL_ROUTE`: `internal_url` points to a non-existent pathname not supported by WishMagic.
- `INSECURE_EXTERNAL_URL_PROTOCOL`: `external_url` uses `http://` when HTTPS is required.
- `ACTION_TARGET_SECTION_NOT_FOUND`: `section` action references a section/subsection ID that does not exist in the template.
- `ACTION_TARGET_MODAL_NOT_FOUND`: `modal` action references a modal ID not found in HTML (`[data-wm-modal="<id>"]` or `#<id>`).
- `MISSING_HTML_ACTION_BINDING`: Declared action `id` has no matching `data-wm-action="<id>"` in HTML.
- `NON_EDITABLE_ACTION_LABEL_OVERRIDE`: Admin override attempted to change `label` when `editableLabel: false`.
- `NON_CONFIGURABLE_ACTION_OVERRIDE`: Admin override attempted to change `type`/`target` when `configurable: false`.
- `NON_RELATIONSHIP_SPECIFIC_ACTION_OVERRIDE`: Variant override attempted to modify an action with `relationshipSpecific: false`.
- `REQUIRED_ACTION_DISABLED`: Admin override attempted to set `enabled: false` on an action with `required: true`.

---

## 7. Complete UTP v1.2.0 `wishmagic.json` Example (`BRO CODE` v1.2.0)

```json
{
  "$schema": "wishmagic-template",
  "schemaVersion": "1.2.0",
  "template": {
    "id": "bro-code-celebration",
    "slug": "bro-code-celebration",
    "name": "BRO CODE",
    "description": "High-energy interactive celebration experience with tailored editions for your Best Friend, Brother, or Boyfriend.",
    "templateVersion": "1.2.0",
    "category": "birthday",
    "tier": "free",
    "price": 0,
    "author": "WishMagic Studio",
    "entry": "index.html",
    "thumbnail": "assets/images/cover-default.jpg"
  },
  "compatibility": {
    "runtimeApi": "1.2",
    "minimumRuntimeApi": "1.0"
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
    "secretMessage",
    "finalSurprise"
  ],
  "relationships": [
    "best_friend",
    "brother",
    "boyfriend"
  ],
  "sections": [
    {
      "id": "hero",
      "label": "Hero Vault Unlock",
      "required": true,
      "toggleable": false,
      "defaultEnabled": true,
      "order": 1,
      "emptyParentPolicy": "keep",
      "fields": ["recipient_name", "hero_title", "hero_subtitle"],
      "actions": ["hero_cta", "explore_memories_btn"],
      "subsections": [
        {
          "id": "hero_badge",
          "label": "Bond Meter Badge",
          "required": false,
          "toggleable": true,
          "defaultEnabled": true,
          "order": 1
        },
        {
          "id": "hero_cta_bar",
          "label": "Hero Action Buttons",
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
      "label": "Celebration Countdown",
      "required": false,
      "toggleable": true,
      "defaultEnabled": true,
      "order": 2,
      "fields": ["event_date"]
    },
    {
      "id": "message",
      "label": "Tribute Letter",
      "required": true,
      "toggleable": false,
      "defaultEnabled": true,
      "order": 3,
      "fields": ["custom_message", "sender_name"]
    },
    {
      "id": "gallery",
      "label": "Hall of Memories",
      "required": false,
      "toggleable": true,
      "defaultEnabled": true,
      "order": 4,
      "emptyParentPolicy": "collapse",
      "fields": ["photo_1", "photo_2"],
      "subsections": [
        {
          "id": "gallery_featured",
          "label": "Featured Cover Memory",
          "required": false,
          "toggleable": true,
          "defaultEnabled": true,
          "order": 1,
          "fields": ["photo_1"]
        },
        {
          "id": "gallery_secondary",
          "label": "Secondary Memory Polaroid",
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
      "label": "Classified Vault Note",
      "required": false,
      "toggleable": true,
      "defaultEnabled": true,
      "order": 5,
      "fields": ["secret_note"],
      "actions": ["watch_surprise_btn"]
    }
  ],
  "actions": [
    {
      "id": "hero_cta",
      "label": "Create Your Wish",
      "type": "customizer",
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
      "label": "Explore Memories",
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
      "id": "watch_surprise_btn",
      "label": "Watch Surprise",
      "type": "modal",
      "target": "surprise_modal",
      "sectionId": "secret_message",
      "editableLabel": true,
      "configurable": true,
      "relationshipSpecific": true,
      "required": false,
      "defaultEnabled": true,
      "fallbackBehavior": "hide"
    },
    {
      "id": "back_to_templates_btn",
      "label": "Back to Templates",
      "type": "internal_url",
      "target": "/templates.html",
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
      "placeholder": "e.g. Aarav",
      "required": true,
      "defaultValue": "Aarav",
      "section": "hero",
      "binding": { "target": "text", "selector": "[data-wm-field='recipient_name']" }
    },
    {
      "id": "hero_title",
      "type": "text",
      "label": "Hero Headline",
      "required": false,
      "defaultValue": "THE UNBREAKABLE CODE",
      "section": "hero",
      "binding": { "target": "text", "selector": "[data-wm-field='hero_title']" }
    },
    {
      "id": "hero_subtitle",
      "type": "text",
      "label": "Hero Subtitle",
      "required": false,
      "defaultValue": "Celebrating a bond that stands above the rest",
      "section": "hero",
      "binding": { "target": "text", "selector": "[data-wm-field='hero_subtitle']" }
    },
    {
      "id": "event_date",
      "type": "date",
      "label": "Celebration Date",
      "required": true,
      "defaultValue": "2026-12-25",
      "section": "countdown",
      "binding": { "target": "text", "selector": "[data-wm-field='event_date']" }
    },
    {
      "id": "custom_message",
      "type": "textarea",
      "label": "Personal Message",
      "required": false,
      "defaultValue": "Here is to every crazy memory, every late-night plan, and every win still ahead of us!",
      "section": "message",
      "binding": { "target": "text", "selector": "[data-wm-field='custom_message']" }
    },
    {
      "id": "secret_note",
      "type": "textarea",
      "label": "Vault Secret Message",
      "required": false,
      "defaultValue": "No matter where life takes us, I always have your back 100%.",
      "section": "secret_message",
      "binding": { "target": "text", "selector": "[data-wm-field='secret_note']" }
    },
    {
      "id": "sender_name",
      "type": "text",
      "label": "From (Your Name)",
      "required": false,
      "defaultValue": "— Kabir",
      "section": "message",
      "binding": { "target": "text", "selector": "[data-wm-field='sender_name']" }
    },
    {
      "id": "photo_1",
      "type": "image",
      "label": "Main Hero Photo",
      "required": false,
      "defaultValue": "assets/images/cover-default.jpg",
      "section": "gallery",
      "subsection": "gallery_featured",
      "binding": { "target": "src", "selector": "[data-wm-field='photo_1']" }
    },
    {
      "id": "photo_2",
      "type": "image",
      "label": "Memory Photo 2",
      "required": false,
      "defaultValue": "assets/images/memory-2.jpg",
      "section": "gallery",
      "subsection": "gallery_secondary",
      "binding": { "target": "src", "selector": "[data-wm-field='photo_2']" }
    }
  ],
  "variants": [
    {
      "id": "var_best_friend",
      "slug": "best-friend",
      "name": "BRO CODE — Best Friend Edition",
      "relationship": "best_friend",
      "relationshipLabel": "Best Friend",
      "description": "High-energy ride-or-die tribute for your closest friend and partner-in-crime.",
      "entry": "index.html",
      "thumbnail": "assets/images/cover-default.jpg",
      "status": "published",
      "enabled": true,
      "isDefault": true,
      "order": 1,
      "theme": {
        "primary": "#f59e0b",
        "secondary": "#8b5cf6",
        "accent": "#38bdf8",
        "background": "#090d16",
        "text": "#ffffff"
      },
      "messages": {
        "hero_title": "RIDE OR DIE: BEST FRIEND EDITION",
        "hero_subtitle": "Friends by choice, legends by loyalty",
        "custom_message": "From chaotic adventures to having each other's backs when it counts most, life is 10x better with a best friend like you!",
        "secret_note": "Official Best Friend Rule #1: We never let each other do dumb things… alone.",
        "sender_name": "— Your Best Friend Forever"
      },
      "visibilityOverrides": {
        "secret_message": true
      },
      "actions": [
        {
          "id": "hero_cta",
          "label": "Create for Your Best Friend",
          "type": "customizer",
          "target": "/customize.html"
        }
      ]
    },
    {
      "id": "var_brother",
      "slug": "brother",
      "name": "BRO CODE — Brother Edition",
      "relationship": "brother",
      "relationshipLabel": "Brother",
      "description": "Built-in protector and lifelong teammate tribute crafted for your brother.",
      "entry": "index.html",
      "thumbnail": "assets/images/cover-default.jpg",
      "status": "published",
      "enabled": true,
      "isDefault": false,
      "order": 2,
      "theme": {
        "primary": "#06b6d4",
        "secondary": "#3b82f6",
        "accent": "#fbbf24",
        "background": "#07111e",
        "text": "#ffffff"
      },
      "messages": {
        "hero_title": "BLOOD & LOYALTY: BROTHER EDITION",
        "hero_subtitle": "Day-one teammate, lifelong brother",
        "custom_message": "No matter how much we roast each other, you have always been my strongest support system. Proud to call you my brother!",
        "secret_note": "Brother Code Vault: Don't tell Mom about half the things we survived growing up.",
        "sender_name": "— Your Sibling"
      },
      "visibilityOverrides": {
        "gallery_secondary": false
      },
      "actions": [
        {
          "id": "hero_cta",
          "label": "Create for Your Brother",
          "type": "customizer",
          "target": "/customize.html"
        }
      ]
    },
    {
      "id": "var_boyfriend",
      "slug": "boyfriend",
      "name": "BRO CODE — Boyfriend Edition",
      "relationship": "boyfriend",
      "relationshipLabel": "Boyfriend",
      "description": "Playful, romantic VIP edition for your favorite guy and best friend in love.",
      "entry": "index.html",
      "thumbnail": "assets/images/cover-default.jpg",
      "status": "published",
      "enabled": true,
      "isDefault": false,
      "order": 3,
      "theme": {
        "primary": "#ec4899",
        "secondary": "#8b5cf6",
        "accent": "#fde047",
        "background": "#140824",
        "text": "#ffffff"
      },
      "messages": {
        "hero_title": "MY FAVORITE PERSON: BOYFRIEND EDITION",
        "hero_subtitle": "My best friend, my safe place, my favorite adventure",
        "custom_message": "You are my partner-in-crime and my favorite hello every single day. Thank you for making every moment together feel effortless and magical!",
        "secret_note": "VIP Vault Note: You still give me butterflies every time you smile 💖",
        "sender_name": "— Yours Always"
      },
      "actions": [
        {
          "id": "hero_cta",
          "label": "Create for Your Boyfriend",
          "type": "customizer",
          "target": "/customize.html"
        }
      ]
    }
  ]
}
```

---

## 8. Persistence, Versioning & Published Wish Immutability

1. **Clear Separation of Configuration Layers in D1**:
   - **Manifest Defaults**: Stored in `templates.manifest_json`, `templates.sections_json`, `templates.actions_json`, and `template_versions.manifest_json`.
   - **Admin Draft Configuration**: Stored in `templates.draft_config_json` and `template_relationship_variants.draft_configuration_json`. Allows admins to save work-in-progress visibility and button changes without affecting the live storefront.
   - **Published Effective Configuration**: Stored in `templates.visibility_config_json`, `templates.actions_config_json`, `template_versions.visibility_config_json`, `template_versions.actions_config_json`, and `template_relationship_variants.visibility_json` / `actions_json`.
   - **Optimistic Concurrency (`lock_version`)**: Every configuration save or publish increments `lock_version`. Concurrent admin requests supplying a stale `lockVersion` receive `409 Conflict` (`CONCURRENCY_CONFLICT`) rather than silently overwriting another admin's work.
2. **Immutable Wish Snapshots (`wishes.published_config_snapshot_json`)**:
   - When a customer creates or publishes a wish, WishMagic computes and snapshots the exact effective configuration (`sections`, `subsections`, `visibilityMap`, `enabledFieldIds`, `actionsMap`, `templateVersionId`, `variantId`, `relationshipSlug`) into `wishes.published_config_snapshot_json`.
   - When an admin later publishes configuration changes to a template that already has published customer wishes, WishMagic creates a new immutable `template_versions` record (`v2`, `v3`, ...) for new wishes while existing personalized wish links continue rendering with their original `published_config_snapshot_json` and version.

---

## 9. Copy-Paste Master Prompt for Google AI Studio / ChatGPT / Claude (UTP v1.2.0)

```markdown
[COPY START]
You are a senior front-end creative developer building a self-contained, interactive HTML/CSS/JS celebration template package for the "WishMagic" platform following the **WishMagic Universal Template Protocol (UTP v1.2.0)**.

You MUST strictly follow all 9 rules below:

### RULE 1: STANDARD ZIP PACKAGE STRUCTURE (FLAT ROOT)
- `wishmagic.json` (MANDATORY — UTP v1.2.0 manifest declaring `schemaVersion: "1.2.0"`, `template`, `fields`, nested `sections` + `subsections`, `actions`, `capabilities`, and optional `variants[]`)
- `index.html` (MANDATORY — Default entry HTML with matching `data-wm-field`, `data-wm-section`, `data-wm-subsection`, `data-wm-action`, and optional `data-wm-modal` attributes)
- `css/style.css` (Stylesheet defining `:root` variables `--wm-primary`, `--wm-secondary`, `--wm-accent`, `--wm-bg`, `--wm-text`)
- `js/template.js` (Interactive logic + UTP v1.2.0 live hydration bridge)
- `assets/images/...`, `assets/audio/...`, `assets/video/...` (Safe relative paths only; NEVER use `../`, `C:\`, or `file://`)

### RULE 2: THREE-WAY AGREEMENT FOR FIELDS (`fields[]` <-> `data-wm-field`)
Every customizable field in `wishmagic.json` must have a matching `[data-wm-field="<id>"][data-wm-type="<type>"]` element in `index.html` and declare its parent `"section"` (and optional `"subsection"`).

### RULE 3: HIERARCHICAL SECTIONS & SUBSECTIONS (`sections[]` <-> `data-wm-section` & `data-wm-subsection`)
- Declare every major visual section in `wishmagic.json` under `"sections"` with `{ "id", "label", "order", "required", "toggleable", "defaultEnabled", "emptyParentPolicy", "fields", "actions", "subsections" }`.
- Bind top-level sections in HTML with `data-wm-section="<section_id>"` and child subsections (up to 3 levels deep) with `data-wm-subsection="<subsection_id>"`.
- Ensure parent sections adapt gracefully if any optional child subsection is removed from the DOM by the admin.

### RULE 4: CONFIGURABLE BUTTON & LINK ACTION REGISTRY (`actions[]` <-> `data-wm-action`)
- Every interactive CTA button or link that admins may customize must have a stable `data-wm-action="<action_id>"` attribute in HTML and a matching entry in `wishmagic.json` under `"actions"`.
- Supported action `"type"` values:
  - `"customizer"` (`target: "/customize.html"`)
  - `"internal_url"` (`target: "/templates.html"`, `"/pricing.html"`, etc.)
  - `"external_url"` (`target: "https://..."` — HTTPS only)
  - `"section"` (`target: "<section_or_subsection_id>"`)
  - `"modal"` (`target: "<modal_id>"` matching an element with `data-wm-modal="<modal_id>"` or `id="<modal_id>"`)
  - `"none"` (`target: ""`)

### RULE 5: MULTI-RELATIONSHIP VARIANTS (`variants[]`)
If the template supports multiple relationships (`best_friend`, `brother`, `sister`, `mother`, `father`, `boyfriend`, `girlfriend`, `husband`, `wife`, `partner`, `friend`, `parents`, `family`, `crush`, `fiance`, `colleague`, `teacher`, `kids`), declare each variant in `variants[]` with tailored `theme`, `messages`, optional `visibilityOverrides` (`{ "<section_or_subsection_id>": true|false }`), and optional `actions` overrides (`[{ "id": "<action_id>", "label": "...", "type": "...", "target": "..." }]`).

### RULE 6: COMPLETE DOM REMOVAL COMPATIBILITY
Never hardcode JS that crashes if an optional `[data-wm-section]`, `[data-wm-subsection]`, or `[data-wm-action]` element is removed from the DOM. Always guard DOM lookups with null checks (`if (!el) return;`).

### RULE 7: CAPABILITIES DECLARATION (`capabilities`)
Declare only implemented capabilities from: `"photos"`, `"multiplePhotos"`, `"gallery"`, `"music"`, `"voice"`, `"video"`, `"countdown"`, `"timeline"`, `"themes"`, `"animations"`, `"particles"`, `"sections"`, `"secretMessage"`, `"finalSurprise"`.

### RULE 8: CSS THEME VARIABLES (`css/style.css`)
Define `--wm-primary`, `--wm-secondary`, `--wm-accent`, `--wm-bg`, and `--wm-text` on `:root`.

### RULE 9: MANDATORY UTP v1.2.0 RUNTIME SCRIPT (`index.html` & `js/template.js`)
Include `<script src="/js/wishmagic-template-protocol.js"></script>` in `index.html` before `js/template.js`, and listen for `WISHMAGIC_INIT`, `WISHMAGIC_LIVE_UPDATE`, `WISHMAGIC_UPDATE`, and `wishmagic:data-updated`.
[COPY END]
```
