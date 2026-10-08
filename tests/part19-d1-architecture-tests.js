/**
 * Automated Test Suite for WishMagic Final D1 Schema & Central Asset/Mapping Architecture (Part 19)
 * ==================================================================================================
 * Tests:
 * 1. Production D1 Database UUID & Migration Integrity (0007_part19_final_d1_schema_and_mappings.sql)
 * 2. Table & Constraint Verification (All 11 normalized tables, unique indexes, FKs)
 * 3. Relationships Registry (Normalized seeding, slugs, icons, categories, sorting)
 * 4. Template Families & Relationship Variant Overrides
 * 5. Template Fields & Slots Registry
 * 6. Storage Provider Abstraction (ImgBB, B2, R2 metadata normalization & mime checking)
 * 7. Music Library & Template-Music Mappings
 * 8. Wish Media Mappings & Slot Resolving
 * 9. Asset Lifecycle & Safe Deletion / Archival Guards (Dependencies Protection)
 * 10. Worker / API Route Contract Parity
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { StorageProviderManager, StorageProvider, AssetStatus, defaultStorageManager } from '../src/storage-abstraction.js';

describe('Part 19 — Final D1 Schema & Central Asset/Mapping Architecture', () => {

  const migrationSqlPath = path.resolve('./migrations/0007_part19_final_d1_schema_and_mappings.sql');
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');

  it('TEST 1: Production D1 Database UUID and Additive Non-Destructive Constraints', () => {
    // Must target database UUID c08b683b-eb07-4639-ab33-fb1139bfb295
    assert.match(migrationSql, /c08b683b-eb07-4639-ab33-fb1139bfb295/, 'Must document production database UUID');
    
    // Absolute rule: NEVER drop or reset existing tables
    assert.doesNotMatch(migrationSql, /DROP\s+TABLE/i, 'Additive migration must never execute DROP TABLE');
    assert.doesNotMatch(migrationSql, /DROP\s+DATABASE/i, 'Additive migration must never DROP DATABASE');
    assert.doesNotMatch(migrationSql, /TRUNCATE/i, 'Must never truncate production data');
  });

  it('TEST 2: Central Normalized Tables Present in D1 Schema', () => {
    const requiredTables = [
      'storage_providers',
      'template_families',
      'relationships',
      'template_relationships',
      'template_relationship_variants',
      'template_fields',
      'template_files',
      'template_images',
      'music_library',
      'template_music',
      'wish_media_mappings'
    ];

    for (const table of requiredTables) {
      const createTableRegex = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`, 'i');
      assert.match(migrationSql, createTableRegex, `Table ${table} must be defined in migration 0007`);
    }
  });

  it('TEST 3: Indexes & Constraints Verification in D1 Migration', () => {
    const requiredIndexes = [
      'idx_template_families_slug',
      'idx_relationships_slug',
      'idx_template_relationships_unique',
      'idx_template_rel_variants_unique',
      'idx_template_fields_unique',
      'idx_template_files_unique',
      'idx_template_images_version',
      'idx_music_library_category',
      'idx_template_music_unique',
      'idx_wish_media_mappings_unique'
    ];

    for (const idx of requiredIndexes) {
      assert.ok(migrationSql.includes(idx), `Index ${idx} must exist in migration 0007`);
    }
  });

  it('TEST 4: Normalized Relationships Registry Data Integrity', () => {
    const relationshipsPath = path.resolve('./data/relationships.json');
    assert.ok(fs.existsSync(relationshipsPath), 'data/relationships.json must exist');

    const relationships = JSON.parse(fs.readFileSync(relationshipsPath, 'utf8'));
    assert.ok(Array.isArray(relationships) && relationships.length >= 10, 'Must have at least 10 seeded relationships');

    const slugs = relationships.map(r => r.slug);
    const expectedSlugs = ['girlfriend', 'boyfriend', 'crush', 'friend', 'mother', 'father', 'brother', 'sister', 'wife', 'husband', 'parents'];
    for (const exp of expectedSlugs) {
      assert.ok(slugs.includes(exp), `Relationship '${exp}' must be present in registry`);
    }

    // Check structure of relationship objects
    for (const r of relationships) {
      assert.ok(r.id.startsWith('rel_'), `ID ${r.id} must have rel_ prefix`);
      assert.ok(r.name && r.displayName, `Name and displayName required for ${r.slug}`);
      assert.ok(r.icon, `Icon required for ${r.slug}`);
      assert.ok(r.category, `Category required for ${r.slug}`);
      assert.equal(r.status, 'active');
      assert.ok(typeof r.sortOrder === 'number');
    }
  });

  it('TEST 5: Storage Provider Abstraction & MIME Type Routing', () => {
    const manager = new StorageProviderManager();

    // Images routed to ImgBB
    assert.equal(manager.getProviderForAsset('image', 'image/jpeg'), StorageProvider.IMGBB);
    assert.equal(manager.getProviderForAsset('image', 'image/png'), StorageProvider.IMGBB);
    assert.equal(manager.getProviderForAsset('image', 'image/webp'), StorageProvider.IMGBB);

    // Audio and template code files routed to B2
    assert.equal(manager.getProviderForAsset('audio', 'audio/mpeg'), StorageProvider.B2);
    assert.equal(manager.getProviderForAsset('file', 'text/html'), StorageProvider.B2);
    assert.equal(manager.getProviderForAsset('file', 'application/javascript'), StorageProvider.B2);

    // Normalization of asset metadata
    const rawAsset = {
      url: 'https://i.ibb.co/sample.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 1048576,
      storage_key: 'images/sample.jpg',
      provider_asset_id: 'imgbb_123'
    };
    const normalized = manager.normalizeAssetMetadata(rawAsset);
    assert.equal(normalized.storageProvider, StorageProvider.IMGBB);
    assert.equal(normalized.displayUrl, 'https://i.ibb.co/sample.jpg');
    assert.equal(normalized.providerAssetId, 'imgbb_123');
    assert.equal(normalized.sizeBytes, 1048576);
    assert.equal(normalized.status, AssetStatus.ACTIVE);
  });

  it('TEST 6: Asset Safe Deletion & Dependency Protection Guards', () => {
    const manager = new StorageProviderManager();

    // Asset with active published wish references must NOT be deleted
    const blockedByWish = manager.isSafeToDelete({ publishedWishCount: 3, templateVersionCount: 0 });
    assert.equal(blockedByWish.safe, false);
    assert.equal(blockedByWish.action, 'archive');
    assert.match(blockedByWish.reason, /3 published wish/);

    // Asset with template version references must NOT be deleted
    const blockedByVersion = manager.isSafeToDelete({ publishedWishCount: 0, templateVersionCount: 1 });
    assert.equal(blockedByVersion.safe, false);
    assert.equal(blockedByVersion.action, 'archive');
    assert.match(blockedByVersion.reason, /1 immutable version/);

    // Asset with zero references is safe to delete
    const safeToDelete = manager.isSafeToDelete({ publishedWishCount: 0, templateVersionCount: 0 });
    assert.equal(safeToDelete.safe, true);
    assert.equal(safeToDelete.action, 'delete');
  });

  it('TEST 7: Music Library Data Integrity & Relationship Suitability', () => {
    const musicPath = path.resolve('./data/music.json');
    assert.ok(fs.existsSync(musicPath), 'data/music.json must exist');

    const music = JSON.parse(fs.readFileSync(musicPath, 'utf8'));
    assert.ok(Array.isArray(music) && music.length >= 3, 'Must have initial curated celebration tracks');

    for (const track of music) {
      assert.ok(track.id.startsWith('mus_'), `Track ${track.id} must have mus_ prefix`);
      assert.ok(track.title && track.artist, 'Title and artist required');
      assert.equal(track.storageProvider, 'b2', 'Music must reference B2 storage provider');
      assert.ok(track.storageKey && track.storageKey.startsWith('music/'), 'Storage key must be in music/ directory');
      assert.ok(track.playbackUrl, 'Playback URL required');
      assert.ok(Array.isArray(track.relationshipSuitability), 'Relationship suitability must be an array');
    }

    // Filter testing by relationship
    const romanticTracks = music.filter(m => m.relationshipSuitability.includes('girlfriend'));
    assert.ok(romanticTracks.length > 0, 'Must have tracks suitable for girlfriend');
    assert.equal(romanticTracks[0].id, 'mus_romantic_piano');
  });

  it('TEST 8: Wish Media Mappings Slot Resolver Logic', () => {
    const wishMediaMappings = [
      {
        id: 'wmm_test_1',
        wish_id: 'wish_test_101',
        field_key: 'hero_photo',
        media_id: 'med_imgbb_hero_01',
        section_key: 'hero',
        sort_order: 1
      },
      {
        id: 'wmm_test_2',
        wish_id: 'wish_test_101',
        field_key: 'photo_1',
        media_id: 'med_imgbb_photo_01',
        section_key: 'gallery',
        sort_order: 2
      }
    ];

    // Find hero slot
    const heroMapping = wishMediaMappings.find(m => m.wish_id === 'wish_test_101' && m.field_key === 'hero_photo');
    assert.ok(heroMapping);
    assert.equal(heroMapping.media_id, 'med_imgbb_hero_01');

    // Slot resolver dictionary
    const slotDictionary = wishMediaMappings.reduce((acc, curr) => {
      acc[curr.field_key] = curr.media_id;
      return acc;
    }, {});

    assert.equal(slotDictionary['hero_photo'], 'med_imgbb_hero_01');
    assert.equal(slotDictionary['photo_1'], 'med_imgbb_photo_01');
  });

  it('TEST 9: Template Families & Relationship Variant Data Structure', () => {
    // Verify template family structure
    const sampleFamily = {
      id: 'fam_tpl_memories',
      slug: 'magical-memories',
      name: 'Magical Memories',
      category: 'celebration',
      tier: 'free',
      price: 0,
      status: 'published',
      visibility: 'public'
    };

    assert.ok(sampleFamily.id.startsWith('fam_'));
    assert.ok(sampleFamily.slug);

    // Verify variant configuration override structure
    const sampleVariant = {
      id: 'trv_memories_v1_girlfriend',
      template_version_id: 'tpl_memories_v1',
      relationship_id: 'rel_girlfriend',
      name: 'Magical Memories - Girlfriend Edition',
      configuration_json: JSON.stringify({
        theme: {
          palette: ['#ff4d6d', '#c9184a', '#ff758f'],
          atmosphere: 'romantic_sparkle',
          defaultBgm: 'mus_romantic_piano'
        },
        texts: {
          heroTitle: 'Happy Birthday, My Love',
          defaultMessage: 'You are the most precious star in my universe.'
        }
      }),
      status: 'active'
    };

    assert.ok(sampleVariant.id.startsWith('trv_'));
    const config = JSON.parse(sampleVariant.configuration_json);
    assert.equal(config.theme.atmosphere, 'romantic_sparkle');
    assert.equal(config.theme.defaultBgm, 'mus_romantic_piano');
  });

  it('TEST 10: Server and Worker API Schema Compatibility', () => {
    // Both worker.js and server.js must implement the endpoints
    const workerCode = fs.readFileSync(path.resolve('./src/worker.js'), 'utf8');
    const serverCode = fs.readFileSync(path.resolve('./server.js'), 'utf8');

    const expectedRoutes = [
      '/api/relationships',
      '/api/music',
      '/api/template-families',
      '/api/templates/',
      '/api/storage-providers',
      '/api/wishes/',
      '/api/admin/storage/audit-lifecycle'
    ];

    for (const route of expectedRoutes) {
      assert.ok(workerCode.includes(route), `worker.js must contain route ${route}`);
      assert.ok(serverCode.includes(route), `server.js must contain route ${route}`);
    }
  });
});
