/**
 * Automated End-to-End Verification Suite:
 * Universal ImgBB Photo Upload (Same Name & Format) + Structured Backblaze B2 Media/Code Ingestion +
 * Automatic Code Link Rewriting + D1 Persistence + Main Website Customizer & Wish Flow
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from '../src/vendor/jszip.js';
import worker from '../src/worker.js';
import {
  executeB2TemplateIngestPipeline,
  extractAndVerifyZip,
  analyzeHtmlString
} from '../src/template-ingest-pipeline.js';
import { validateUtpManifest } from '../src/template-protocol-validator.js';
import {
  ImgBBProvider,
  uint8ArrayToBase64
} from '../src/imgbb-provider.js';

// Minimal valid 100x200 PNG binary
const VALID_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x64,
  0x00, 0x00, 0x00, 0xC8,
  0x08, 0x06, 0x00, 0x00, 0x00,
  0x3B, 0x76, 0x01, 0x1A,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
  0xAE, 0x42, 0x60, 0x82
]);

// Minimal valid MP3 header + frame bytes
const VALID_MP3_BYTES = new Uint8Array([
  0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0A,
  0xFF, 0xFB, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

// Minimal valid MP4 ftyp header bytes
const VALID_MP4_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x6D, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
  0x6D, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6F, 0x6D
]);

test('Hybrid ImgBB + Backblaze B2 Template Ingestion, Code Link Injection & Customizer E2E', async (t) => {

  await t.test('1. ImgBBProvider preserves exact original filename and format even when synthetic name is passed', async () => {
    let postedName = null;
    const provider = new ImgBBProvider({
      apiKey: 'test_imgbb_key_123',
      fetchFn: async (_url, options) => {
        const params = new URLSearchParams(options.body);
        postedName = params.get('name');
        return new Response(JSON.stringify({
          success: true,
          status: 200,
          data: {
            id: 'ibb_exact_1',
            url: `https://i.ibb.co/ibb_exact_1/${postedName}.png`,
            display_url: `https://i.ibb.co/ibb_exact_1/${postedName}.png`,
            width: 100,
            height: 200,
            size: VALID_PNG_BYTES.byteLength,
            image: {
              filename: `${postedName}.png`,
              name: postedName,
              mime: 'image/png',
              extension: 'png',
              url: `https://i.ibb.co/ibb_exact_1/${postedName}.png`
            }
          }
        }), { status: 200 });
      }
    });

    const res = await provider.uploadImage({
      data: VALID_PNG_BYTES,
      filename: 'assets/couple-portrait.png',
      name: 'user_usr123_1728394823'
    });

    assert.strictEqual(postedName, 'couple-portrait', 'Must send exact original filename stem to ImgBB');
    assert.strictEqual(res.filename, 'couple-portrait.png', 'Must preserve exact filename and extension');
    assert.strictEqual(res.originalFilename, 'couple-portrait.png');
    assert.strictEqual(res.extension, 'png');
    assert.strictEqual(res.displayUrl, 'https://i.ibb.co/ibb_exact_1/couple-portrait.png');
  });

  await t.test('2. Template Analyzer auto-discovers unmarked <img>, <audio>, <video> and explicit data-wm slots', () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Royal Celebration</title></head>
      <body>
        <h1 data-wm="recipient_name">Dear Aisha</h1>
        <p data-wm-field="custom_message" data-wm-type="textarea">Wishing you joy!</p>
        <img id="hero-banner" src="images/royal-frame.png" alt="Royal Frame" />
        <audio src="music/shehnai-theme.mp3" autoplay loop></audio>
        <video><source src="videos/fireworks-intro.mp4" type="video/mp4" /></video>
      </body>
      </html>
    `;

    const analyzed = analyzeHtmlString(html);
    assert.strictEqual(analyzed.title, 'Royal Celebration');
    assert.ok(analyzed.fields.some(f => f.key === 'recipient_name' && f.type === 'text'));
    assert.ok(analyzed.fields.some(f => f.key === 'custom_message' && f.type === 'textarea'));
    assert.ok(analyzed.fields.some(f => f.type === 'image' && f.defaultValue === 'images/royal-frame.png'));
    assert.ok(analyzed.fields.some(f => f.type === 'audio' && f.defaultValue === 'music/shehnai-theme.mp3'));
    assert.ok(analyzed.fields.some(f => f.type === 'video' && f.defaultValue === 'videos/fireworks-intro.mp4'));
  });

  await t.test('3. End-to-End Hybrid Ingestion: ZIP Images -> ImgBB (Same Name/Format), Audio/Video/Code -> B2 (Same Name/Format), Links Injected in Code & Saved in D1', async () => {
    const b2StoredObjects = new Map();
    const mockB2Provider = {
      bucketName: 'wishmagic-structured-b2',
      async putObject({ key, body, contentType, contentLength, metadata }) {
        b2StoredObjects.set(key, { key, body, contentType, contentLength, metadata });
        return {
          success: true,
          key,
          fileId: `b2_${key.replace(/[^a-zA-Z0-9]/g, '_')}`
        };
      },
      async getObject({ key }) {
        const item = b2StoredObjects.get(key);
        if (!item) throw new Error(`Object not found: ${key}`);
        return {
          body: item.body,
          contentType: item.contentType
        };
      }
    };

    const imgbbUploads = [];
    const mockImgbbProvider = {
      async uploadImage({ data, filename, name }) {
        const cleanBase = String(filename).split('/').pop();
        const ext = cleanBase.split('.').pop();
        const stem = name || cleanBase.replace(/\.[^/.]+$/, '');
        const finalFile = `${stem}.${ext}`;
        const url = `https://i.ibb.co/live_${imgbbUploads.length + 1}/${finalFile}`;
        const record = {
          provider: 'imgbb',
          providerAssetId: `ibb_id_${imgbbUploads.length + 1}`,
          url,
          originalUrl: url,
          displayUrl: url,
          thumbnailUrl: url,
          deleteUrl: `https://ibb.co/delete/${imgbbUploads.length + 1}`,
          width: 100,
          height: 200,
          sizeBytes: data.byteLength || 120,
          mimeType: 'image/png',
          extension: ext,
          name: stem,
          filename: finalFile,
          originalFilename: finalFile,
          sha256: 'deadbeef'.repeat(8),
          status: 'active'
        };
        imgbbUploads.push(record);
        return record;
      }
    };

    const d1Statements = [];
    const mockDb = {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                d1Statements.push({ sql, args });
                return { success: true };
              },
              async first() {
                if (sql.includes('MAX(version_number)')) return { maxVer: 0 };
                return null;
              }
            };
          }
        };
      }
    };

    // Build a template ZIP containing HTML, CSS, JS, PNG photo, MP3 music, and MP4 video
    const zip = new JSZip();
    zip.file('index.html', `<!DOCTYPE html>
<html>
<head>
  <title>Starlight Celebration</title>
  <link rel="stylesheet" href="css/theme.css">
</head>
<body>
  <h1 data-wm="recipient_name">Dear Priya</h1>
  <img src="images/starlight-frame.png" alt="Starlight Frame">
  <audio src="music/romantic-melody.mp3" controls></audio>
  <video src="video/sparkle-intro.mp4" controls></video>
  <script src="js/main.js"></script>
</body>
</html>`);
    zip.file('css/theme.css', `body { background-image: url("../images/starlight-frame.png"); }`);
    zip.file('js/main.js', `const defaultCover = "images/starlight-frame.png";`);
    zip.file('images/starlight-frame.png', VALID_PNG_BYTES);
    zip.file('music/romantic-melody.mp3', VALID_MP3_BYTES);
    zip.file('video/sparkle-intro.mp4', VALID_MP4_BYTES);

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    const ingestRes = await executeB2TemplateIngestPipeline({
      zipBuffer,
      templateMetadata: {
        name: 'Starlight Celebration',
        category: 'Birthday',
        tier: 'free',
        price: 0,
        publishImmediately: true
      },
      publishImmediately: true,
      env: {},
      db: mockDb,
      storageProvider: mockB2Provider,
      imgbbProvider: mockImgbbProvider,
      authorId: 'admin_owner'
    });

    assert.strictEqual(ingestRes.success, true);
    assert.strictEqual(ingestRes.isPublished, true, 'Must auto-publish when publishImmediately is true');
    assert.strictEqual(ingestRes.status, 'published');

    // Verify image was uploaded to ImgBB with exact filename and format preserved
    assert.strictEqual(imgbbUploads.length, 1);
    assert.strictEqual(imgbbUploads[0].filename, 'starlight-frame.png');
    assert.strictEqual(imgbbUploads[0].displayUrl, 'https://i.ibb.co/live_1/starlight-frame.png');
    assert.strictEqual(ingestRes.thumbnail, 'https://i.ibb.co/live_1/starlight-frame.png');

    // Verify music & video were uploaded to Backblaze B2 with exact filename & format preserved
    const mp3B2Key = ingestRes.storageKeys.runtimeFile('music/romantic-melody.mp3');
    const mp4B2Key = ingestRes.storageKeys.runtimeFile('video/sparkle-intro.mp4');
    assert.ok(b2StoredObjects.has(mp3B2Key), 'MP3 music stored in B2 with exact path and filename');
    assert.ok(b2StoredObjects.has(mp4B2Key), 'MP4 video stored in B2 with exact path and filename');

    // Verify index.html and css/theme.css stored in B2 have their image links replaced with the ImgBB link
    // and audio/video links replaced with the structured B2 stream links!
    const storedHtmlBytes = b2StoredObjects.get(ingestRes.storageKeys.runtimeFile('index.html')).body;
    const storedHtml = new TextDecoder('utf-8').decode(storedHtmlBytes);
    assert.ok(
      storedHtml.includes('https://i.ibb.co/live_1/starlight-frame.png'),
      'index.html must have relative image path replaced with live ImgBB URL'
    );
    const expectedMp3StreamUrl = `/api/templates/${ingestRes.templateId}/versions/${ingestRes.versionId}/preview/music/romantic-melody.mp3`;
    const expectedMp4StreamUrl = `/api/templates/${ingestRes.templateId}/versions/${ingestRes.versionId}/preview/video/sparkle-intro.mp4`;
    assert.ok(
      storedHtml.includes(expectedMp3StreamUrl),
      'index.html must have relative audio path linked to structured B2 stream URL with exact filename & format'
    );
    assert.ok(
      storedHtml.includes(expectedMp4StreamUrl),
      'index.html must have relative video path linked to structured B2 stream URL with exact filename & format'
    );

    const storedCssBytes = b2StoredObjects.get(ingestRes.storageKeys.runtimeFile('css/theme.css')).body;
    const storedCss = new TextDecoder('utf-8').decode(storedCssBytes);
    assert.ok(
      storedCss.includes('https://i.ibb.co/live_1/starlight-frame.png'),
      'CSS url(...) must have relative image path replaced with live ImgBB URL'
    );

    // Verify D1 persistence of template_images, template_files, template_versions, and templates
    assert.ok(d1Statements.some(s => s.sql.includes('INSERT OR REPLACE INTO template_images')), 'Must save ImgBB image record in D1 template_images');
    assert.ok(d1Statements.some(s => s.sql.includes('INSERT INTO template_files')), 'Must save B2 file records in D1 template_files');
  });

  await t.test("strips multi-level nested container folders in ZIP so wishmagic.json and index.html are at package root", async () => {
    const zip = new JSZip();
    zip.file("export-bundle/birthday-magic/wishmagic.json", JSON.stringify({
      $schema: "wishmagic-template",
      schemaVersion: "1.0.0",
      template: { id: "birthday-magic", name: "Birthday Magic", templateVersion: "1.0.0", category: "birthday", tier: "free" }
    }));
    zip.file("export-bundle/birthday-magic/index.html", "<!DOCTYPE html><html><body><h1 data-wm-field=\"recipient_name\">Someone Special</h1></body></html>");
    zip.file("export-bundle/birthday-magic/css/style.css", "body { color: #fff; }");

    const zipBuffer = await zip.generateAsync({ type: "uint8array" });
    const extracted = await extractAndVerifyZip(zipBuffer);

    assert.strictEqual(extracted.entryFile, "index.html");
    assert.ok(extracted.files.has("wishmagic.json"), "wishmagic.json normalized to root");
    assert.ok(extracted.files.has("css/style.css"), "css/style.css normalized relative to root");
  });

  await t.test("validates 3-way UTP agreement: bound fields, MANIFEST_FIELD_UNBOUND warnings, and UNDECLARED_HTML_FIELD suggestions", () => {
    const filesMap = new Map();
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <section data-wm-section="hero">
    <h1 data-wm-field="recipient_name" data-wm-type="text">Someone Special</h1>
    <p data-wm-field="undeclared_extra_quote" data-wm-type="text">Bonus Quote</p>
  </section>
</body>
</html>`;
    filesMap.set("index.html", { content: new TextEncoder().encode(htmlContent) });
    filesMap.set("css/style.css", { content: new TextEncoder().encode(":root { --wm-primary: #ff2a85; }") });

    const manifest = {
      $schema: "wishmagic-template",
      schemaVersion: "1.0.0",
      template: {
        id: "birthday-magic",
        name: "Birthday Magic",
        templateVersion: "1.0.0",
        category: "birthday",
        tier: "free"
      },
      fields: [
        {
          id: "recipient_name",
          type: "text",
          label: "Recipient Name",
          required: true,
          defaultValue: "Someone Special",
          binding: { target: "text", selector: "[data-wm-field='recipient_name']" }
        },
        {
          id: "ghost_unbound_field",
          type: "text",
          label: "Ghost Field",
          required: false,
          binding: { target: "text", selector: "[data-wm-field='ghost_unbound_field']" }
        }
      ],
      sections: [
        { id: "hero", label: "Hero Section", required: true, toggleable: false }
      ],
      capabilities: ["themes"]
    };

    const report = validateUtpManifest(manifest, { filesMap, entryFile: "index.html" });
    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.boundFields.length, 1);
    assert.strictEqual(report.boundFields[0].id, "recipient_name");
    assert.strictEqual(report.unboundFields.length, 1);
    assert.strictEqual(report.unboundFields[0].id, "ghost_unbound_field");
    assert.ok(report.issues.some(i => i.code === "MANIFEST_FIELD_UNBOUND" && i.field === "ghost_unbound_field"));
    assert.strictEqual(report.suggestedFields.length, 1);
    assert.strictEqual(report.suggestedFields[0].id, "undeclared_extra_quote");
    assert.ok(report.issues.some(i => i.code === "UNDECLARED_HTML_FIELD" && i.field === "undeclared_extra_quote"));
  });
});
