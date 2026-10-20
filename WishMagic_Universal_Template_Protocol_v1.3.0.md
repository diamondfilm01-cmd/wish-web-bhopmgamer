# WishMagic Universal Template Protocol (UTP v1.3.0)
## Relationship-Aware Multi-Variant, Authoritative Variant Visibility, Nested Section Visibility, Configurable Button/Action Registry, Central Link Manager & Smart Template Recognition Standard

> **Version**: `1.3.0` (100% Backward Compatible with UTP `1.0.0`, `1.1.0`, and `1.2.0`)
> **Status**: Production Standard
> **Supported Schema Versions**: `"1.0.0"`, `"1.1.0"`, `"1.2.0"`, `"1.3.0"`
> **Supported Runtime API Versions**: `"1.0"`, `"1.1"`, `"1.2"`, `"1.3"`

---

## 1. Architectural Overview & Package Modes

The **WishMagic Universal Template Protocol (UTP v1.3.0)** is the canonical machine-readable specification governing how celebration website templates are packaged, validated, recognized during ZIP upload, previewed side-by-side in an isolated sandbox, configured by administrators, resolved against central domain/link settings, customized by customers, and rendered as immutable published wish websites.

### Supported Package Modes (100% Backward Compatible)
1. **Legacy Single-Variant Package (`schemaVersion: "1.0.0"`)**
   - Works without modification. Flat `sections[]` (or HTML-discovered `[data-wm-section]` elements) and `fields[]` are automatically normalized into the UTP v1.3.0 section/subsection/action graph.
2. **Multi-Variant Relationship Package (`schemaVersion: "1.1.0"`)**
   - Supports `variants[]` with per-relationship copy (`messages`), `theme`, `assets`, `fields`, and flat `sections`. Automatically upgraded at runtime to support UTP v1.2.0/v1.3.0 visibility overrides, authoritative variant inclusion, and action overrides.
3. **Hierarchical Visibility & Action Package (`schemaVersion: "1.2.0"`)**
   - Adds nested `subsections[]` (up to 3 levels deep), `emptyParentPolicy`, deterministic `actions[]` registry (`data-wm-action`), template-wide `visibilityConfig` & `actionsConfig`, and relationship-specific `variants[].visibilityOverrides` & `variants[].actions`.
4. **Full UTP v1.3.0 Package (`schemaVersion: "1.3.0"`)**
   - Adds **Centralized Global & Template-Specific Logical Link Identifiers** (`global.*` and `template.*`), action types `"global_link"` and `"template_link"`, `logicalLink` manifest property and `data-wm-link` HTML binding, **Future Domain Migration Support** without editing template ZIPs, **Authoritative Relationship Variant Visibility Enforcement** (`enabledVariants`), **Automatic Button Classification & Ambiguous Intent Review**, and **Smart Template Recognition & Update Policy Metadata** (`updatePolicy`).

---

## 2. Canonical ZIP Package Layout & File Security Rules

```text
template-package.zip
├── wishmagic.json         # MANDATORY: UTP v1.3.0 machine-readable manifest
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
- Path traversal (`../`), leading slashes (`/etc/...`), local drive paths (`C:\...`, `file://`), decompression bombs, duplicate normalized paths, and server executables (`.php`, `.exe`, `.sh`, `.py`, `.bat`, `.dll`) are rejected during upload validation.
- The upload processor deterministically parses `wishmagic.json` and HTML entry files (`index.html` and any `variants[].entry`). It never infers hidden features from `README.md` or untrusted script text.
- Uploaded HTML, CSS, JavaScript, media, and manifest data are treated as untrusted during admin inspection and rendered inside an isolated preview iframe (`sandbox="allow-scripts"`, `referrerpolicy="no-referrer"`, restrictive CSP) with zero access to admin credentials, parent-window DOM, or sensitive storage.

---

## 3. Section & Nested Subsection Manifest (`sections[]`)

UTP v1.3.0 preserves full UTP v1.2.0 support for hierarchical **sections** and nested **subsections** up to **3 levels deep** (`UTP_MAX_SECTION_NESTING_DEPTH = 3`: Level 1 Section → Level 2 Subsection → Level 3 Nested Subsection).

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
    <a data-wm-action="hero_customize_btn" data-wm-link="template.customize" href="/customize.html">Make For Yours</a>
    <a data-wm-action="explore_more_btn" data-wm-link="global.explore" href="/templates.html">Explore More</a>
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

## 4. Authoritative Relationship Variant Visibility & Section Precedence

### 4.1 Six Distinct Variant Lifecycle States (UTP v1.3.0)
WishMagic strictly distinguishes between:
1. **Declared in Uploaded Package**: Present in `wishmagic.json -> variants[]`.
2. **Enabled in Effective Published Configuration**: Included in `templates.enabled_variants_json`, `template_relationships.enabled = 1`, and `template_relationship_variants.enabled = 1` with `status = 'published'`.
3. **Disabled by Administrator**: Explicitly unchecked/excluded during upload, in the Edit Template studio, or in the Relationship Variants manager (`enabled = false` / `status = 'disabled'`).
4. **Available Only in a Draft**: Saved in `draft_config_json` or `status = 'draft'` prior to publication.
5. **Available in a Previous Published Version**: Preserved in historical `template_versions.enabled_variants_json` and `wishes.published_config_snapshot_json` so existing wishes never break and rollbacks restore exact historical variant availability.
6. **Selected by a Customer**: Passed via `?rel=<slug>` or `variantId` in preview/customizer/creation flows.

### 4.2 Authoritative Public Variant Visibility Rule
- **Only variants enabled in the effective published configuration may be exposed through public discovery and selection.**
- This rule is enforced identically across:
  - Main template gallery (`GET /api/templates`) and relationship chips on template cards.
  - Relationship filter queries (`?relationship=<slug>`).
  - Search results, suggestions, and related-template recommendations.
  - Template detail and resolver endpoints (`GET /api/templates/:id`, `GET /api/templates/:id/variants`, `GET /api/templates/:id/variants/:relId`, `GET /api/templates/:id/resolver`).
  - Preview relation selectors and customer customization forms.
  - Public wish creation API (`POST /api/wishes`).
- **Direct URL / API Bypass Prevention**:
  - Constructing `/api/templates/:id/variants/:disabledRel` or `/api/templates/:id/resolver?rel=:disabledRel` returns `404 VARIANT_DISABLED_OR_UNAVAILABLE` with the list of `availableRelationships` instead of leaking or silently falling back to an unrelated variant.
  - Submitting `POST /api/wishes` with a disabled or unknown `relationshipSlug` / `variantId` is rejected with `422 Unprocessable Entity` (`code: "VARIANT_DISABLED_OR_UNAVAILABLE"`).
- **Preservation of Admin Variant Selections**:
  - Editing unrelated template metadata (title, description, price, button labels, section toggles) in the Admin Panel preserves previously disabled variants (`enabled_variants_json`).
  - Re-uploading a template package that declares a previously disabled variant preserves the administrator's disabled state unless the administrator explicitly re-enables it.

### 4.3 Deterministic 4-Tier Section Visibility Precedence Order
For every section and subsection node $S$ and enabled relationship variant $V$:
1. **Tier 1 — Platform & Structural Constraints (Highest Priority)**:
   - If $S$ has `required: true` or `toggleable: false`, $S$ is **always enabled** (`effectiveEnabled = true`, `source = "required_constraint"`).
   - If any ancestor section of $S$ is effectively disabled (`parentEffectiveEnabled === false`), $S$ is **always disabled** (`effectiveEnabled = false`, `disabledByParent = true`, `source = "parent_disabled"`).
2. **Tier 2 — Published Relationship Variant Override (`variant_override`)**:
   - If $V$ specifies a boolean in `visibilityOverrides[S.id]`, that boolean is used (`source = "variant_override"`).
   - **Global-Disable Override Policy**: WishMagic supports `allowVariantOverrideOfGlobalDisable: true`: if a toggleable section is disabled in **All Relationships**, an admin can explicitly override it to `enabled: true` for a single relationship variant provided its parent section is enabled.
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
   - Before removing a disabled DOM subtree, all `<audio>`, `<video>`, and `<iframe>` elements inside it are paused and their `src` attributes are cleared so background media from a removed section never leaks.
3. **Navigation, Anchor & Button Cleanup**:
   - Any navigation link (`<a href="#<disabled_id>">`, `[data-wm-nav-target="<disabled_id>"]`) or action button targeting a disabled section/modal is automatically removed or disabled according to `fallbackBehavior`.
4. **Coherent Parent Layout & Empty-Parent Policy**:
   - If all child subsections inside a parent section are disabled and no standalone visible content remains inside the parent, and `emptyParentPolicy` is `"collapse"` (the default), the parent section itself is physically removed from the DOM.
5. **Customer Customizer Step-by-Step Section Cards, Customer Section Hiding (`_hiddenSections`) & Per-Photo Slot Hiding (`_hiddenFields` / `data-wm-photo-slot`)**:
   - **Step-by-Step Bite-Sized Customizer**: `customize-engine.js` organizes fields into Quick Edit Sub-Tabs (`1. Basic Info`, `2. Template Text & Sections`, `3. Photos & Album Slots`, `4. Music & Voice`) and Section Pills so customers never have to scroll a long form.
   - **Customer Section & Subsection Hide Toggles (`_hiddenSections`)**: Customers can toggle any optional section or subsection (`toggleable: true`, `required: false`) OFF directly in the Customizer, physically removing `[data-wm-section]` / `[data-wm-subsection]` from both the Live Preview and the final published wish website.
   - **Per-Photo Slot Hide Toggles (`_hiddenFields` & `data-wm-photo-slot="photo_X"`)**: If a template album has e.g. 6 photo slots (`photo_1`..`photo_6`) and the customer only has 5 photos, the customer can hide `photo_6` (or click **Auto-Hide Unused Photo Slots**). `WishMagicTemplate.removeDisabledContentFromDom()` automatically locates and removes the entire photo card container (`[data-wm-photo-slot="photo_6"]` or the parent polaroid/card element) from the DOM so the remaining 5 photo cards reflow cleanly in CSS Grid/Flexbox.
   - **Server Persistence**: `sanitizeCustomerWishDataAgainstConfig()` and `POST /api/wishes` / `PUT /api/wishes/:id` validate and persist `_hiddenSections` and `_hiddenFields` inside the wish's `custom_data` and `published_config_snapshot_json`.

---

## 6. Central Link Manager, Logical Link Identifiers & Action Registry (`actions[]`)

UTP v1.3.0 introduces a **Central Link Manager** and **Logical Link Identifiers** so templates never need to hardcode `https://wishmagic.pages.dev` or require manual ZIP edits when the production domain changes in the future.

### 6.1 Two Separate Link Categories

1. **Global WishMagic Links (`type: "global_link"`, `logicalLink: "global.*"`)**:
   - Navigate intentionally to centrally configured destinations on the main WishMagic website (e.g., *Explore More*, *Visit WishMagic*, *Browse Templates*, *Create a Wish*, *Back to WishMagic*).
   - Managed centrally in **Admin Settings → Central Link Manager** (`central_link_settings` table in D1). When the administrator updates the Canonical Production Base URL (e.g., from `https://wishmagic.pages.dev` to a custom HTTPS domain), all `global.*` logical links automatically resolve to the new domain at runtime.
2. **Template-Specific Creation Links (`type: "template_link"` or `"customizer"`, `logicalLink: "template.*"`)**:
   - Open the creation, customization, or preview flow for **their own template** while preserving `template`, `variant`, and `rel` query parameters (e.g., *Make For Yours*, *Create Yours*, *Make One For Me*, *Customize This Template*).
   - Never route to the generic homepage, and never lose the active template/relationship context.

### 6.2 Canonical Logical Link Identifiers (`UTP_SUPPORTED_LOGICAL_LINKS`)

| Logical Identifier | Category | Default Route / Template Pattern | Preserves Template & Relationship Context | Description |
| :--- | :--- | :--- | :--- | :--- |
| `"global.home"` | Global | `/` | Optional | Main WishMagic homepage (`Visit WishMagic`, `Back to WishMagic`). |
| `"global.explore"` | Global | `/templates.html` | Optional | Global exploration destination (`Explore More`, `Explore WishMagic`). |
| `"global.browseTemplates"` | Global | `/templates.html` | Optional | Main template gallery (`Browse Templates`, `All Templates`, `Back to Templates`). |
| `"global.marketplace"` | Global | `/marketplace.html` | Optional | VIP / Marketplace catalog (`Marketplace`, `VIP Templates`). |
| `"global.createWish"` | Global | `/create.html` | Optional | Global wish creation hub (`Create a Wish`). |
| `"global.pricing"` | Global | `/pricing.html` | No | Pricing & VIP pass information (`Pricing`, `VIP Pass`). |
| `"global.help"` | Global | `/help.html` | No | Help Center & FAQs (`Help`, `FAQ`, `Support`). |
| `"global.contact"` | Global | `/contact.html` | No | Contact & support page (`Contact Us`). |
| `"template.create"` | Template-Specific | `/customize.html?template={templateId}&variant={variant}&rel={rel}` | **Yes (Mandatory)** | Opens creation flow for the current template (`Make For Yours`, `Create Yours`, `Make One For Me`). |
| `"template.customize"` | Template-Specific | `/customize.html?template={templateId}&variant={variant}&rel={rel}` | **Yes (Mandatory)** | Opens the customizer for the current template (`Customize This Template`, `Create for Your Best Friend`). |
| `"template.preview"` | Template-Specific | `/template-preview.html?template={templateId}&variant={variant}&rel={rel}` | **Yes (Mandatory)** | Opens the preview page for the current template. |

### 6.3 Supported Action Types (`UTP_SUPPORTED_ACTION_TYPES`)

| Action Type | Target / Logical Link Requirement | Runtime Execution Behavior |
| :--- | :--- | :--- |
| `"global_link"` | Valid `global.*` logical identifier in `logicalLink` or `target` (e.g., `"global.explore"`) | Resolves at runtime via `WishMagicTemplate.resolveLogicalLink()` using the Central Link Manager's canonical base URL and global route map. |
| `"template_link"` | Valid `template.*` logical identifier in `logicalLink` or `target` (e.g., `"template.customize"`, `"template.create"`) | Resolves at runtime to the current template's customization/creation route while preserving `template`, `variant`, and `rel` query parameters. |
| `"customizer"` | Optional (`"/customize.html"` or `"template.customize"`) | Equivalent to `"template_link"` with `"template.customize"`; navigates directly to the WishMagic Customizer with `template`, `variant`, and `rel` pre-selected. |
| `"internal_url"` | Valid WishMagic route (`/`, `/templates.html`, `/marketplace.html`, `/template-preview.html`, `/customize.html`, `/create.html`, `/wish.html`, `/pricing.html`, `/premium.html`, `/my-wishes.html`, `/favorites.html`, `/help.html`, `/contact.html`, `/legal.html`) or logical link ID | Navigates to the validated internal route while preserving `template`, `variant`, and `rel` query parameters when navigating to `/template-preview.html`, `/customize.html`, or `/create.html`. |
| `"external_url"` | Safe `https://` URL (`http://` rejected unless explicitly permitted) | Navigates safely (`target="_blank" rel="noopener noreferrer"` when `openInNewTab: true`). Preserves explicit external destinations untouched during domain migration. Blocks `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, and protocol-relative `//` URLs. |
| `"section"` | Enabled `sectionId` or `subsectionId` (or `#<id>`) | Smooth-scrolls to the target `[data-wm-section]` or `[data-wm-subsection]` if enabled for the active relationship; otherwise applies `fallbackBehavior` (`"hide"` by default). |
| `"modal"` | Existing modal ID (`[data-wm-modal="<id>"]` or `#<id>`) | Opens the target template modal (`data-wm-modal-open="true"`, `aria-hidden="false"`) if present in the DOM and not inside a disabled section; otherwise applies `fallbackBehavior`. |
| `"none"` | None (`""`) | Renders the button as a passive visual trigger without navigation. |

### 6.4 Action Object Schema (`actions[]` in `wishmagic.json`)

```json
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
  "openInNewTab": false,
  "fallbackBehavior": "hide"
}
```

| Property | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | **Yes** | — | Stable identifier matching `^[a-zA-Z0-9_-]{1,64}$`. Bound in HTML via `data-wm-action="<id>"`. Independent of visible button text. |
| `label` | `string` | **Yes** | — | Default visible button/link text (max 120 chars). Always rendered via `textContent` / HTML escaping. |
| `type` | `string` | **Yes** | `"section"` | One of `"global_link"`, `"template_link"`, `"customizer"`, `"internal_url"`, `"external_url"`, `"section"`, `"modal"`, `"none"`. |
| `logicalLink` | `string` | Conditional | `""` | Canonical logical link identifier (`"global.home"`, `"global.explore"`, `"global.browseTemplates"`, `"global.createWish"`, `"template.create"`, `"template.customize"`, etc.). Required when `type` is `"global_link"` or `"template_link"` unless `target` is already a valid logical link identifier. |
| `target` | `string` | Conditional | `""` | Fallback route/URL (for `internal_url`/`external_url`/`global_link`/`template_link`), target section/subsection ID (for `section`), or target modal ID (for `modal`). |
| `sectionId` | `string` | No | Auto-detected | Optional parent section/subsection ID containing this button. If that section/subsection is disabled, the action is automatically disabled and removed. |
| `editableLabel` | `boolean` | No | `true` | Whether admins can edit the button label in Upload / Edit Template. |
| `configurable` | `boolean` | No | `true` | Whether admins can change `type`, `logicalLink`, `target`, `enabled`, or `fallbackBehavior`. |
| `relationshipSpecific` | `boolean` | No | `true` | Whether relationship variants may override this action's label, type, logicalLink, target, or enabled state. |
| `required` | `boolean` | No | `false` | If `true`, the action cannot be disabled by admin configuration (`enabled: false` is rejected). |
| `defaultEnabled` | `boolean` | No | `true` | Default enabled state in manifest. |
| `openInNewTab` | `boolean` | No | `true` for `external_url`, `false` otherwise | Whether external links open in a new tab with `rel="noopener noreferrer"`. |
| `fallbackBehavior` | `string` | No | `"hide"` | `"hide"` (physically remove from DOM when target is disabled/unavailable), `"disable"` (render disabled/non-interactive), or `"none"`. |

### 6.5 HTML Bindings for Logical Links (`data-wm-link` & `data-wm-action`)
Templates may bind logical links either via `actions[]` (`data-wm-action="<id>"`) or directly on anchor/button elements via `data-wm-link="<logical_link_id>"`:
```html
<!-- Bound via both data-wm-action and data-wm-link -->
<a data-wm-action="hero_cta" data-wm-link="template.customize" href="/customize.html">Make For Yours</a>
<a data-wm-action="footer_explore_btn" data-wm-link="global.explore" href="/templates.html">Explore More on WishMagic</a>
```
At runtime, `wishmagic-template-protocol.js` (`v1.3.0`) resolves both `[data-wm-action]` and `[data-wm-link]` using `WishMagicTemplate.resolveLogicalLink(logicalLink, context)` without unsafe string concatenation.

### 6.6 Button Detection & Ambiguous Intent Review During ZIP Upload
When an administrator uploads a template ZIP, WishMagic inspects `wishmagic.json` and `index.html` (`detectAndClassifyPackageButtons`) and reports for each recognized button/link:
1. **Button Label** and **Action / Element ID**
2. **Original Destination** (`href` / `target`)
3. **Detected Action Type** and **Proposed Logical Link** (`global.*` vs `template.*` vs `section` vs `modal` vs `external_url`)
4. **Evidence for Mapping** (e.g., explicit `logicalLink` declaration, internal `/customize.html` route, or recognized global/template button label)
5. **Validation Result & Confirmation Flag (`requiresAdminConfirmation`)**:
   - Button text alone is never assumed sufficient when the target and label conflict or when a generic label (`"Click Here"`, `"Continue"`, `"Next"`, `"Learn More"`) points to a bare root URL. Ambiguous buttons are flagged with `requiresAdminConfirmation: true` (`AMBIGUOUS_ACTION_MAPPING_REVIEW_REQUIRED`) so the administrator can confirm the intended destination before publishing.

### 6.7 Action & Logical Link Validation Error Codes
- `INVALID_ACTION_ID` / `DUPLICATE_ACTION_ID`: Missing, malformed, or duplicate `actions[].id`.
- `UNSUPPORTED_ACTION_TYPE`: Action `type` is not one of the 8 supported types (`global_link`, `template_link`, `customizer`, `internal_url`, `external_url`, `section`, `modal`, `none`).
- `INVALID_LOGICAL_LINK_ID`: `logicalLink` is not a recognized `global.*` or `template.*` identifier in `UTP_SUPPORTED_LOGICAL_LINKS`.
- `MISMATCHED_LOGICAL_LINK_CATEGORY`: A `"global_link"` action uses a `template.*` identifier or a `"template_link"` action uses a `global.*` identifier.
- `UNSAFE_URL_SCHEME`: URL uses `javascript:`, `data:`, `file:`, `vbscript:`, `blob:`, or `//`.
- `UNSUPPORTED_INTERNAL_ROUTE`: `internal_url` points to a non-existent pathname not supported by WishMagic.
- `INSECURE_EXTERNAL_URL_PROTOCOL`: `external_url` uses `http://` when HTTPS is required.
- `ACTION_TARGET_SECTION_NOT_FOUND`: `section` action references a section/subsection ID that does not exist in the template.
- `ACTION_TARGET_MODAL_NOT_FOUND`: `modal` action references a modal ID not found in HTML (`[data-wm-modal="<id>"]` or `#<id>`).
- `MISSING_HTML_ACTION_BINDING`: Declared action `id` has no matching `data-wm-action="<id>"` in HTML.

---

## 7. Smart Template Recognition & Update Policy Metadata (`updatePolicy`)

UTP v1.3.0 standardizes optional `updatePolicy` metadata inside `wishmagic.json -> template` (or top-level `updatePolicy`) to assist **Smart Template Recognition** when uploading updated template ZIP packages:

```json
"template": {
  "id": "bro-code-celebration",
  "slug": "bro-code-celebration",
  "name": "BRO CODE",
  "templateVersion": "1.3.0",
  "updatePolicy": {
    "targetTemplateId": "bro-code-celebration",
    "targetSlug": "bro-code-celebration",
    "previousVersion": "1.2.0",
    "preserveDisabledVariants": true
  }
}
```

### Recognition Priority Order
When a ZIP is uploaded into the Admin Panel, WishMagic evaluates registered templates in strict priority order:
1. **Stable Template ID** (`template.id`)
2. **Explicit Update Metadata** (`updatePolicy.targetTemplateId` / `replacesTemplateId`)
3. **Existing URL Slug** (`template.slug`)
4. **Cryptographic SHA-256 File Hashes & Manifest Fingerprint**
5. **Structural Similarity** (shared section IDs, field IDs, action IDs, and variant slugs)
6. **Display Name as Supporting Evidence Only** (WishMagic **never** overwrites or auto-matches a template solely because its display name matches).

The administrator is presented with an isolated side-by-side preview (Existing Published Version vs. Staged Uploaded Package), a full file/manifest/link diff, destructive-change warnings, and three explicit manual choices: **Update Existing Template**, **Create New Template**, or **Cancel**.

---

## 8. Complete UTP v1.3.0 `wishmagic.json` Example (`BRO CODE` v1.3.0)

```json
{
  "$schema": "wishmagic-template",
  "schemaVersion": "1.3.0",
  "template": {
    "id": "bro-code-celebration",
    "slug": "bro-code-celebration",
    "name": "BRO CODE",
    "description": "High-energy interactive celebration experience with tailored editions for your Best Friend, Brother, or Boyfriend.",
    "templateVersion": "1.3.0",
    "category": "birthday",
    "tier": "free",
    "price": 0,
    "author": "WishMagic Studio",
    "entry": "index.html",
    "thumbnail": "assets/images/cover-default.jpg",
    "updatePolicy": {
      "targetTemplateId": "bro-code-celebration",
      "targetSlug": "bro-code-celebration",
      "previousVersion": "1.2.0",
      "preserveDisabledVariants": true
    }
  },
  "compatibility": {
    "runtimeApi": "1.3",
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
      "actions": ["watch_surprise_btn", "explore_more_wishes_btn"]
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
      "id": "explore_more_wishes_btn",
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
    },
    {
      "id": "back_to_templates_btn",
      "label": "Browse Templates",
      "type": "global_link",
      "logicalLink": "global.browseTemplates",
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
          "type": "template_link",
          "logicalLink": "template.customize",
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
          "type": "template_link",
          "logicalLink": "template.customize",
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
          "type": "template_link",
          "logicalLink": "template.customize",
          "target": "/customize.html"
        }
      ]
    }
  ]
}
```

---

## 9. Persistence, Versioning, Rollback & Published Wish Immutability

1. **Clear Separation of Configuration Layers in D1**:
   - **Manifest Defaults**: Stored in `templates.manifest_json`, `templates.sections_json`, `templates.actions_json`, and `template_versions.manifest_json`.
   - **Admin Draft Configuration**: Stored in `templates.draft_config_json` and `template_relationship_variants.draft_configuration_json`. Allows admins to save work-in-progress visibility, variant inclusion, and button changes without affecting the live storefront.
   - **Published Effective Configuration**: Stored in `templates.visibility_config_json`, `templates.actions_config_json`, `templates.enabled_variants_json`, `templates.link_mappings_json`, `template_versions.visibility_config_json`, `template_versions.actions_config_json`, `template_versions.enabled_variants_json`, `template_versions.link_mappings_json`, and `template_relationship_variants.visibility_json` / `actions_json` / `enabled`.
   - **Central Link Settings**: Stored in `central_link_settings` (`canonical_base_url`, `allowed_origins_json`, `global_routes_json`, `global_button_labels_json`, `template_action_patterns_json`, `template_button_labels_json`) with migration audit history in `template_link_migrations`.
   - **Optimistic Concurrency (`lock_version`)**: Every configuration save or publish increments `lock_version`. Concurrent admin requests supplying a stale `lockVersion` receive `409 Conflict` (`CONCURRENCY_CONFLICT`).
2. **Immutable Wish Snapshots (`wishes.published_config_snapshot_json`)**:
   - When a customer creates or publishes a wish, WishMagic snapshots the exact effective configuration (`sections`, `subsections`, `visibilityMap`, `enabledFieldIds`, `actionsMap`, `templateVersionId`, `variantId`, `relationshipSlug`) into `wishes.published_config_snapshot_json`.
   - Existing published wishes retain their original template version, personalized content (names, messages, photos, audio, video), and saved configuration even when newer template versions are published or rolled back.
   - Centrally resolved global links (`global.*`) dynamically use the updated canonical domain when a custom domain is configured, while explicit external links (`https://...`) remain untouched.

---

## 10. Changelog & Migration Guide: UTP v1.2.0 → UTP v1.3.0

| Category | UTP v1.2.0 Behavior | UTP v1.3.0 Update | Backward Compatibility & Migration |
| :--- | :--- | :--- | :--- |
| **Schema & Runtime Versions** | `schemaVersion: "1.2.0"`, `runtimeApi: "1.2"` | Adds `schemaVersion: "1.3.0"`, `runtimeApi: "1.3"` | `1.0.0`, `1.1.0`, and `1.2.0` packages remain 100% supported without modification. |
| **Central Global Links** | Used `internal_url` with route paths (`/templates.html`) or hardcoded `https://wishmagic.pages.dev` URLs | Adds `type: "global_link"`, `logicalLink: "global.*"`, and `data-wm-link="global.*"` resolved centrally via `central_link_settings` | Existing hardcoded `https://wishmagic.pages.dev` links can be scanned and normalized to logical identifiers via **Admin Settings → Central Link Manager** without editing ZIPs. |
| **Template Creation Links** | Used `type: "customizer"` with `target: "/customize.html"` | Adds `type: "template_link"` and `logicalLink: "template.create" \| "template.customize" \| "template.preview"` | `type: "customizer"` remains 100% supported and automatically aliases to `logicalLink: "template.customize"`. |
| **Authoritative Variant Visibility** | Variants declared in `variants[]` were registered during upload | Enforces `enabled_variants_json` + `template_relationships.enabled` + `template_relationship_variants.enabled` across gallery, filters, search, preview, customizer, and `POST /api/wishes` (`422 VARIANT_DISABLED_OR_UNAVAILABLE`) | Legacy single-variant templates continue working without variant restrictions; multi-variant templates strictly expose only admin-enabled variants. |
| **Desktop & Mobile Preview** | Preview pages initialized in mobile viewport mode (`380px`) even on desktop screens | Desktop screens (`>= 1024px`) open in Desktop mode by default with a true desktop viewport; mobile screens (`< 1024px`) open in Mobile mode by default | Templates require standard responsive CSS; no special template code changes needed. |
| **Smart Template Recognition** | Basic upload replacement or manual creation | Multi-factor recognition (`template.id`, `updatePolicy`, `slug`, SHA-256 file hashes, structural similarity) + isolated side-by-side preview + explicit Update / Create New / Cancel | Optional `updatePolicy` block can be added to `wishmagic.json`; packages without `updatePolicy` still match via `template.id`, `slug`, and file hashes. |

---

## 11. Copy-Paste Master Prompt for Google AI Studio / ChatGPT / Claude (UTP v1.3.0)

```markdown
[COPY START]
You are a senior front-end creative developer building a self-contained, interactive HTML/CSS/JS celebration template package for the "WishMagic" platform following the **WishMagic Universal Template Protocol (UTP v1.3.0)**.

You MUST strictly follow all 10 rules below:

### RULE 1: STANDARD ZIP PACKAGE STRUCTURE (FLAT ROOT)
- `wishmagic.json` (MANDATORY — UTP v1.3.0 manifest declaring `schemaVersion: "1.3.0"`, `template`, `fields`, nested `sections` + `subsections`, `actions`, `capabilities`, and optional `variants[]`)
- `index.html` (MANDATORY — Default entry HTML with matching `data-wm-field`, `data-wm-section`, `data-wm-subsection`, `data-wm-action`, optional `data-wm-link`, and optional `data-wm-modal` attributes)
- `css/style.css` (Stylesheet defining `:root` variables `--wm-primary`, `--wm-secondary`, `--wm-accent`, `--wm-bg`, `--wm-text` and responsive desktop + mobile layouts)
- `js/template.js` (Interactive logic + UTP v1.3.0 live hydration bridge)
- `assets/images/...`, `assets/audio/...`, `assets/video/...` (Safe relative paths only; NEVER use `../`, `C:\`, or `file://`)

### RULE 2: THREE-WAY AGREEMENT FOR FIELDS (`fields[]` <-> `data-wm-field`)
Every customizable field in `wishmagic.json` must have a matching `[data-wm-field="<id>"][data-wm-type="<type>"]` element in `index.html` and declare its parent `"section"` (and optional `"subsection"`).

### RULE 3: HIERARCHICAL SECTIONS & SUBSECTIONS (`sections[]` <-> `data-wm-section` & `data-wm-subsection`)
- Declare every major visual section in `wishmagic.json` under `"sections"` with `{ "id", "label", "order", "required", "toggleable", "defaultEnabled", "emptyParentPolicy", "fields", "actions", "subsections" }`.
- Bind top-level sections in HTML with `data-wm-section="<section_id>"` and child subsections (up to 3 levels deep) with `data-wm-subsection="<subsection_id>"`.
- Ensure parent sections adapt gracefully if any optional child subsection is removed from the DOM by the admin.

### RULE 4: CENTRALIZED LOGICAL LINKS & ACTION REGISTRY (`actions[]` <-> `data-wm-action` & `data-wm-link`)
- NEVER hardcode `https://wishmagic.pages.dev` inside buttons or links. Instead, use UTP v1.3.0 Logical Link Identifiers so future custom domain changes work automatically!
- Every interactive CTA button or link must have `data-wm-action="<action_id>"` (and optional `data-wm-link="<logical_link_id>"`) in HTML and a matching entry in `wishmagic.json` under `"actions"`.
- Supported action `"type"` values:
  - `"template_link"` with `"logicalLink": "template.customize"` or `"template.create"` (for buttons like "Make For Yours", "Create Yours", "Make One For Me", "Customize This Template" — opens the creation flow for THIS template preserving `template`, `variant`, and `rel`)
  - `"global_link"` with `"logicalLink": "global.explore"`, `"global.browseTemplates"`, `"global.home"`, `"global.createWish"`, `"global.marketplace"`, `"global.pricing"`, `"global.help"`, or `"global.contact"` (for buttons like "Explore More", "Visit WishMagic", "Browse Templates", "Back to WishMagic")
  - `"customizer"` (`target: "/customize.html"`, aliases to `"template.customize"`)
  - `"internal_url"` (`target: "/templates.html"`, `"/pricing.html"`, etc.)
  - `"external_url"` (`target: "https://..."` — HTTPS only, for genuine external third-party websites)
  - `"section"` (`target: "<section_or_subsection_id>"`)
  - `"modal"` (`target: "<modal_id>"` matching `[data-wm-modal="<modal_id>"]` or `id="<modal_id>"`)
  - `"none"` (`target: ""`)

### RULE 5: MULTI-RELATIONSHIP VARIANTS & AUTHORITATIVE VISIBILITY (`variants[]`)
If the template supports multiple relationships (`best_friend`, `brother`, `sister`, `mother`, `father`, `boyfriend`, `girlfriend`, `husband`, `wife`, `partner`, `friend`, `parents`, `family`, `crush`, `fiance`, `colleague`, `teacher`, `kids`), declare each variant in `variants[]` with `"enabled": true`, `"status": "published"`, tailored `theme`, `messages`, optional `visibilityOverrides` (`{ "<section_or_subsection_id>": true|false }`), and optional `actions` overrides (`[{ "id": "<action_id>", "label": "Create for Your Best Friend", "type": "template_link", "logicalLink": "template.customize", "target": "/customize.html" }]`). Only variants enabled by the administrator in the effective published configuration will be exposed publicly.

### RULE 6: COMPLETE DOM REMOVAL COMPATIBILITY & CUSTOMER-HIDEABLE PHOTO SLOTS (`data-wm-photo-slot`)
- Never hardcode JS that crashes if an optional `[data-wm-section]`, `[data-wm-subsection]`, `[data-wm-photo-slot]`, or `[data-wm-action]` element is removed from the DOM by the admin or customer. Always guard DOM lookups with null checks (`if (!el) return;`).
- **Mandatory Photo Card Wrapper for Multi-Photo Albums**: Wrap every individual photo card/polaroid (including its `<img data-wm-field="photo_X" data-wm-type="image">` and any paired caption) inside a container with `data-wm-photo-slot="photo_X"` (and/or `data-wm-subsection="gallery_photo_X"`), and style the album grid with flexible auto-reflowing CSS (`grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))` or `display: flex; flex-wrap: wrap; justify-content: center;`) so if a customer has 5 photos instead of 6 and hides `photo_6`, the remaining 5 photos reflow seamlessly with zero empty frames.
- Every field in `wishmagic.json -> fields[]` MUST declare its parent `"section"` ID matching `sections[]` so the Step-by-Step Customizer groups fields cleanly into bite-sized section pills without long scrolling.

### RULE 7: DESKTOP & MOBILE VIEWPORT RESPONSIVENESS
Ensure `index.html` includes `<meta name="viewport" content="width=device-width, initial-scale=1.0">` and `css/style.css` renders cleanly at both full desktop viewport widths (`1280px+`) and mobile viewport widths (`375px`) without horizontal overflow or clipped content.

### RULE 8: CAPABILITIES DECLARATION (`capabilities`)
Declare only implemented capabilities from: `"photos"`, `"multiplePhotos"`, `"gallery"`, `"music"`, `"voice"`, `"video"`, `"countdown"`, `"timeline"`, `"themes"`, `"animations"`, `"particles"`, `"sections"`, `"secretMessage"`, `"finalSurprise"`.

### RULE 9: CSS THEME VARIABLES (`css/style.css`)
Define `--wm-primary`, `--wm-secondary`, `--wm-accent`, `--wm-bg`, and `--wm-text` on `:root`.

### RULE 10: MANDATORY UTP v1.3.0 RUNTIME SCRIPT (`index.html` & `js/template.js`)
Include `<script src="/js/wishmagic-template-protocol.js"></script>` in `index.html` before `js/template.js`, and listen for `WISHMAGIC_INIT`, `WISHMAGIC_LIVE_UPDATE`, `WISHMAGIC_UPDATE`, and `wishmagic:data-updated`.
[COPY END]
```
