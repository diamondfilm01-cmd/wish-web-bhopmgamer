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
