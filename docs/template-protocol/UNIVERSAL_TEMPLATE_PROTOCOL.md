# Universal Template Protocol (UTP) Specification v1.0.0

## 1. Overview & Architectural Principles

The **Universal Template Protocol (UTP)** is WishMagic's canonical, versioned integration standard governing how wish website celebration templates are created, packaged, verified, ingested, stored, customized, previewed, and rendered across the platform.

**Core Invariant:** *One permanent integration contract, unlimited template designs.*

Templates may possess completely distinct visual appearances, animations, DOM layouts, and aesthetics. UTP standardizes metadata, field discovery, capability contracts, and runtime hydration so that newly uploaded templates function immediately without requiring edits to the core WishMagic codebase.

---

## 2. Version Concept Separation

UTP strictly distinguishes five independent version and identity concepts:

1. **Protocol Schema Version (`schemaVersion`)**: Defines how `wishmagic.json` is parsed and validated (e.g. `1.0.0`).
2. **Template Release Version (`templateVersion`)**: Semantic version assigned by the template author to their design release (e.g. `v1.2.0`).
3. **Internal Database Version ID (`versionId`)**: Immutable server-assigned database identifier (e.g. `ver_tpl_romantic_scrapbook_v1_k8s9x`).
4. **Runtime API Version (`runtimeApi`)**: Identifies runtime hooks, capabilities, and event contracts supported by the platform client (e.g. `1.0`).
5. **Wish ID (`wishId`)**: Identifies a generated personalized recipient wish instance (e.g. `wsh_98234`).

---

## 3. Canonical Package Layout

A valid UTP template package archive (`.zip`) must follow this standardized directory layout:

```text
template-package/
├── wishmagic.json         # Canonical UTP machine-readable manifest (required)
├── index.html             # Primary entry point HTML document (required)
├── css/
│   └── style.css          # Stylesheets and CSS custom properties
├── js/
│   └── template.js        # Safe client runtime scripts
├── assets/                # Package assets
│   ├── images/            # Template background and decorative images
│   ├── fonts/             # Web fonts (woff2, ttf)
│   ├── audio/             # Music & voice preview tracks (mp3, wav)
│   └── video/             # Video backgrounds or greetings (mp4)
└── README.md              # Template documentation and capabilities guide
```

### File Rules:
- All paths inside `wishmagic.json` and `index.html` must be **safe relative paths** (no leading slashes, no `../` traversal, no absolute filesystem URLs).
- Executable server binaries (`.exe`, `.sh`, `.php`, `.py`, `.dll`, `.bat`) are strictly forbidden and rejected at ingestion.
- The manifest must be named `wishmagic.json`. (Legacy `manifest.json` is supported through backward-compatible adapters).
- Maximum compressed size: 50 MB; Maximum uncompressed size: 150 MB; Maximum file count: 1000 files.

---

## 4. Canonical Manifest Schema (`wishmagic.json`)

```json
{
  "protocol": "wishmagic-template",
  "schemaVersion": "1.0.0",
  "template": {
    "id": "romantic-scrapbook",
    "name": "Romantic Scrapbook & Love Letter",
    "description": "An interactive personalized vintage memory book and wax seal envelope.",
    "templateVersion": "1.0.0",
    "category": "love",
    "tier": "free",
    "price": 0,
    "entry": "index.html",
    "author": "Google AI Studio"
  },
  "compatibility": {
    "runtimeApi": "1.0",
    "minimumRuntimeApi": "1.0",
    "maximumRuntimeApi": null
  },
  "files": {
    "styles": ["css/style.css"],
    "scripts": ["js/template.js"]
  },
  "fields": [
    {
      "id": "recipient_name",
      "type": "text",
      "label": "Recipient Name",
      "required": true,
      "defaultValue": "My Love",
      "placeholder": "Enter partner's name",
      "constraints": {
        "minLength": 1,
        "maxLength": 60
      },
      "binding": {
        "target": "text",
        "selector": "[data-wm-field='recipient_name']"
      }
    },
    {
      "id": "cover_photo",
      "type": "image",
      "label": "Cover Photo",
      "required": false,
      "defaultValue": "",
      "binding": {
        "target": "src",
        "selector": "[data-wm-field='cover_photo']"
      }
    }
  ],
  "sections": [
    {
      "id": "hero",
      "label": "Hero Envelope Unboxing",
      "required": true,
      "toggleable": false,
      "defaultEnabled": true
    },
    {
      "id": "photo_gallery",
      "label": "Treasured Photo Gallery",
      "required": false,
      "toggleable": true,
      "defaultEnabled": true
    }
  ],
  "relationships": [
    {
      "id": "girlfriend",
      "label": "Girlfriend"
    },
    {
      "id": "boyfriend",
      "label": "Boyfriend"
    },
    {
      "id": "crush",
      "label": "Crush"
    }
  ],
  "capabilities": [
    "photos",
    "music",
    "animations",
    "particles",
    "themes"
  ],
  "assets": [
    {
      "path": "assets/images/wax-seal.png",
      "role": "cover",
      "required": true
    }
  ]
}
```

---

## 5. Supported Field Types

- `text`: Single-line text input (names, titles, locations).
- `textarea`: Multi-line text (custom letters, heartfelt wishes).
- `date`: Calendar date selector (birthdays, anniversaries).
- `time` / `datetime`: Event timestamps.
- `number` / `range`: Numerical input and slider controls.
- `color`: Hex color codes for dynamic styling.
- `toggle`: Boolean flags (enable/disable optional elements).
- `select` / `multiselect`: Single or multiple options.
- `image`: Single user-uploaded image URL (ImgBB/B2).
- `image-multiple`: Collection of user-uploaded images for gallery slots.
- `video`: User greeting video link or uploaded MP4.
- `audio`: Audio track URL or user audio file.
- `voice`: Dedicated audio keepsake recording.

---

## 6. HTML Data Binding Standard

Templates bind data dynamically using `data-wm-*` HTML attributes:

```html
<!-- Text binding -->
<h1 data-wm-field="recipient_name" data-wm-type="text" data-wm-default="Someone Special">Someone Special</h1>

<!-- Textarea binding -->
<p data-wm-field="custom_message" data-wm-type="textarea" data-wm-default="Happy Birthday!"></p>

<!-- Image binding -->
<img data-wm-field="cover_photo" data-wm-type="image" src="assets/images/default-cover.png" alt="Memory"/>

<!-- Section toggle -->
<section data-wm-section="photo_gallery" data-wm-label="Photo Gallery" data-wm-toggleable="true">
  ...
</section>
```

When rendering in the sandbox or public wish page:
1. `window.WishMagicTemplate.applyData(payload)` hydrates all fields safely.
2. Injected text uses `el.textContent` exclusively to prevent XSS vulnerabilities.
3. User images update `src` or `background-image` safely.

---

## 7. Capability Registry & Verification

Declared capabilities in `wishmagic.json` are cross-checked by the server capability registry:
- `photos`, `multiplePhotos`
- `music`, `voice`, `video`
- `countdown`, `timeline`, `gallery`
- `themes`, `animations`, `particles`, `sections`
- `secretMessage`, `finalSurprise`

If a template declares a required capability missing from the runtime, publishing is blocked.

---

## 8. Precedence Order for Data Resolution

When rendering a wish, configuration is resolved with deterministic precedence:
1. **User Customization Input** (highest priority)
2. **Relationship Variant Overrides** (e.g. girlfriend/mom specific messages)
3. **Template Default Configuration** (from `wishmagic.json`)
4. **Platform Canonical Fallbacks** (lowest priority)
