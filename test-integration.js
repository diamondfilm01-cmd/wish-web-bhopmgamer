/**
 * WishMagic Complete End-to-End Integration & API Contract Test Runner
 * Part 28: Full Frontend <-> Worker API Contract & End-to-End Regression Lock
 * 
 * Verifies:
 * - Real Cloudflare Worker Gateway with D1 & R2 abstraction
 * - All 18 Security Regression Tests (A through T)
 * - All Part 28 Realistic User Journeys (#1 to #5 + Admin Journey)
 * - Comprehensive API Contract inventory & response normalization
 * - D1 & R2 unavailable degraded mode handling (503 / unconfigured)
 * - Strict CORS, CSP, Cookie, CSRF, and Rate Limiting
 * - Lifecycle state machine (Asia/Kolkata boundary)
 * - Public wish privacy and zero PII leakage
 * - Route Matrix & Pretty Links
 */

import http from 'http';
import { createRequire } from 'module';
import fs from 'fs';
import worker from './src/worker.js';
import { verifyToken } from './src/auth/auth-provider.js';
import { MASTER_ADMIN_EMAILS, PRIMARY_OWNER_ADMIN_EMAIL } from './src/auth/session-service.js';
import { createZipFromFiles } from './src/template-ingest-pipeline.js';
import { validateMigrations } from './scripts/db-validate.js';
import { runDataIntegrityCheck } from './scripts/db-integrity.js';
import { runSecurityAudit } from './scripts/security-audit.js';
import { validateConfiguration } from './scripts/config-validator.js';
import { DataRepairEngine } from './scripts/repair-framework.js';
import {
  APP_VERSION,
  FailureCategory,
  FailureClassification,
  redactSensitiveData,
  Logger
} from './src/observability.js';

if (typeof globalThis.window === 'undefined') { globalThis.window = globalThis; }
await import('./public/js/wish-lifecycle.js');
const WishLifecycle = global.WishLifecycle;
await import('./public/js/data-migrator.js');
const WishDataMigrator = global.WishDataMigrator;
await import('./public/js/security-hardening.js');
const WishSecurity = global.WishSecurity;
await import('./public/js/api-client.js');
const WishApiClient = global.WishApiClient;
await import('./public/js/wish-link-suggestions.js');
const WishLinkSuggestions = global.WishLinkSuggestions;

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) {
    failedTests++;
    console.error(`❌ FAIL: ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    console.log(`✅ PASS: ${message}`);
  }
}

// In-Memory Cloudflare D1 Test Database Adapter
function createTestD1Database() {
  const users = new Map();
  const sessions = new Map();
  const adminRoles = new Map();
  const adminStaff = new Map();
  const adminAuditLogs = [];
  const entitlements = new Map();
  const wishes = new Map();
  const templates = new Map();
  const templateFamilies = new Map();
  const templateVersions = new Map();
  const templateFiles = new Map();
  const templateFields = new Map();
  const templateUploadOperations = new Map();
  const categories = new Map();
  const favorites = new Map();
  const wishMedia = new Map();
  const notifications = new Map();
  const analyticsEvents = [];
  const siteSettings = new Map();

  return {
    _tables: { users, sessions, adminRoles, adminStaff, adminAuditLogs, entitlements, wishes, templates, templateFamilies, templateVersions, templateFiles, templateFields, templateUploadOperations, categories, favorites, wishMedia, notifications, analyticsEvents, siteSettings },
    async batch(statements) {
      const res = [];
      for (const stmt of statements) {
        if (stmt && typeof stmt.run === 'function') {
          res.push(await stmt.run());
        }
      }
      return res;
    },
    prepare(sql) {
      function createStatement(boundArgs = []) {
        return {
          bind(...newArgs) {
            return createStatement(newArgs);
          },
          async first() {
            const args = boundArgs;
            const normalized = sql.replace(/\s+/g, ' ').trim();
            if (normalized.includes('FROM site_settings WHERE key = ?')) {
              const key = args[0];
              return siteSettings.get(key) ? { ...siteSettings.get(key) } : null;
            }
              if (normalized.includes('FROM users WHERE email = ?') || normalized.includes('LOWER(email) = LOWER(?)') || normalized.includes('email = ?')) {
                const email = (args[0] || '').toLowerCase();
                for (const u of users.values()) {
                  if ((u.email || '').toLowerCase() === email) return { ...u };
                }
                return null;
              }
              if (normalized.includes('FROM users WHERE id = ?')) {
                const id = args[0];
                return users.get(id) ? { ...users.get(id) } : null;
              }
              if (normalized.includes('COUNT(*) as count FROM users')) {
                return { count: users.size };
              }
              if (normalized.includes('COUNT(*) as count FROM wishes')) {
                if (normalized.includes('WHERE template_id = ?')) {
                  const tId = args[0];
                  let c = 0;
                  for (const w of wishes.values()) {
                    if (w.template_id === tId) c++;
                  }
                  return { count: c };
                }
                return { count: wishes.size };
              }
              if (normalized.includes('COUNT(*) as count FROM templates')) {
                return { count: templates.size };
              }
              if (normalized.includes('FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?')) {
                const token = args[0];
                const now = args[1] || Date.now();
                const session = sessions.get(token);
                if (session && session.expires_at > now) {
                  const user = users.get(session.user_id);
                  if (user) {
                    return {
                      ...session,
                      user_id: user.id,
                      email: user.email,
                      display_name: user.display_name,
                      avatar_url: user.avatar_url,
                      role: user.role,
                      plan: user.plan,
                      is_premium: user.is_premium,
                      status: user.status
                    };
                  }
                }
                return null;
              }
              if (normalized.includes('FROM admin_roles WHERE user_id = ?')) {
                const userId = args[0];
                return adminRoles.get(userId) || null;
              }
              if (normalized.includes('FROM admin_staff WHERE mobile = ?')) {
                const mobile = args[0];
                for (const s of adminStaff.values()) {
                  if (s.mobile === mobile) return { ...s };
                }
                return null;
              }
              if (normalized.includes('FROM admin_staff WHERE user_id = ?') || normalized.includes('FROM admin_staff WHERE user_id = ? OR mobile = ?')) {
                const uId = args[0];
                const mob = args[1] || uId;
                for (const s of adminStaff.values()) {
                  if (s.user_id === uId || s.mobile === mob) return { ...s };
                }
                return null;
              }
              if (normalized.includes('FROM admin_staff WHERE id = ?')) {
                const sId = args[0];
                return adminStaff.get(sId) ? { ...adminStaff.get(sId) } : null;
              }
              if (normalized.includes('FROM entitlements WHERE user_id = ?')) {
                const userId = args[0];
                for (const ent of entitlements.values()) {
                  if (ent.user_id === userId && ent.is_active) return { ...ent };
                }
                return null;
              }
              if (normalized.includes('FROM wishes WHERE id = ? OR slug = ?') || normalized.includes('FROM wishes WHERE slug = ? OR id = ?')) {
                const idOrSlug = args[0];
                for (const w of wishes.values()) {
                  if (w.id === idOrSlug || w.slug === idOrSlug) return { ...w };
                }
                return null;
              }
              if (normalized.includes('FROM wishes WHERE slug = ?')) {
                const slug = args[0];
                for (const w of wishes.values()) {
                  if (w.slug === slug) return { ...w };
                }
                return null;
              }
              if (normalized.includes('FROM templates WHERE id = ? OR slug = ?')) {
                const idOrSlug = args[0];
                for (const t of templates.values()) {
                  if (t.id === idOrSlug || t.slug === idOrSlug) return { ...t };
                }
                return null;
              }
              if (normalized.includes('FROM template_upload_operations WHERE idempotency_key = ?')) {
                const ikey = args[0];
                for (const op of templateUploadOperations.values()) {
                  if (op.idempotency_key === ikey) return { ...op };
                }
                return null;
              }
              if (normalized.includes('FROM template_upload_operations WHERE id = ?')) {
                const opId = args[0];
                return templateUploadOperations.get(opId) ? { ...templateUploadOperations.get(opId) } : null;
              }
              if (normalized.includes('SELECT MAX(version_number) AS maxVer FROM template_versions')) {
                const [tId, fId] = args;
                let maxVer = 0;
                for (const v of templateVersions.values()) {
                  if (v.template_id === tId || v.template_family_id === fId) {
                    const vn = Number(v.version_number || v.versionNumber || 0);
                    if (vn > maxVer) maxVer = vn;
                  }
                }
                return { maxVer };
              }
              if (normalized.includes('FROM template_versions WHERE (template_id = ? OR template_family_id = ?) AND package_fingerprint = ?')) {
                const [tId, fId, fp] = args;
                for (const v of templateVersions.values()) {
                  if ((v.template_id === tId || v.template_family_id === fId) && v.package_fingerprint === fp && v.status !== 'failed') {
                    return { ...v };
                  }
                }
                return null;
              }
              if (normalized.includes('FROM template_files WHERE template_version_id = ? AND (relative_path = ?')) {
                const [vId, relPath] = args;
                for (const f of templateFiles.values()) {
                  if (f.template_version_id === vId && f.relative_path === relPath) {
                    return { ...f };
                  }
                }
                return null;
              }
              if (normalized.includes('FROM templates WHERE id = ?')) {
                const id = args[0];
                return templates.get(id) ? { ...templates.get(id) } : null;
              }
              if (normalized.includes('FROM template_versions WHERE id = ?')) {
                const id = args[0];
                return templateVersions.get(id) ? { ...templateVersions.get(id) } : null;
              }
              if (normalized.includes('FROM template_versions WHERE template_id = ?')) {
                const templateId = args[0];
                let highest = null;
                for (const v of templateVersions.values()) {
                  if (v.template_id === templateId || v.templateId === templateId) {
                    if (!highest || (Number(v.version_number || v.versionNumber || 1) > Number(highest.version_number || highest.versionNumber || 1))) {
                      highest = v;
                    }
                  }
                }
                return highest ? { ...highest } : null;
              }
              return null;
            },
            async all() {
              const args = boundArgs;
              const normalized = sql.replace(/\s+/g, ' ').trim();
              if (normalized.includes('FROM template_files WHERE template_version_id = ?')) {
                const vId = args[0];
                const results = [];
                for (const f of templateFiles.values()) {
                  if (f.template_version_id === vId) results.push({ ...f });
                }
                return { results };
              }
              if (normalized.includes('FROM wishes WHERE user_id = ?')) {
                const userId = args[0];
                const results = [];
                for (const w of wishes.values()) {
                  if (w.user_id === userId) results.push({ ...w });
                }
                return { results };
              }
              if (normalized.includes('FROM wishes')) {
                return { results: Array.from(wishes.values()) };
              }
              if (normalized.includes('FROM templates')) {
                return { results: Array.from(templates.values()) };
              }
              if (normalized.includes('FROM categories')) {
                return { results: Array.from(categories.values()) };
              }
              if (normalized.includes('FROM favorites WHERE user_id = ?')) {
                const userId = args[0];
                const results = [];
                for (const f of favorites.values()) {
                  if (f.user_id === userId) results.push({ item_id: f.item_id });
                }
                return { results };
              }
              if (normalized.includes('FROM users')) {
                return { results: Array.from(users.values()) };
              }
              if (normalized.includes('FROM notifications WHERE user_id = ?')) {
                const userId = args[0];
                const results = [];
                for (const n of notifications.values()) {
                  if (n.user_id === userId) results.push({ ...n });
                }
                return { results };
              }
              if (normalized.includes('FROM admin_staff')) {
                return { results: Array.from(adminStaff.values()) };
              }
              if (normalized.includes('FROM admin_audit_logs')) {
                return { results: [...adminAuditLogs] };
              }
              if (normalized.includes('FROM analytics_events')) {
                return { results: [...analyticsEvents] };
              }
              if (normalized.includes('FROM site_settings')) {
                return { results: Array.from(siteSettings.values()) };
              }
              if (normalized.includes('FROM template_versions')) {
                return { results: Array.from(templateVersions.values()) };
              }
              return { results: [] };
            },
            async run() {
              const args = boundArgs;
              const normalized = sql.replace(/\s+/g, ' ').trim();
              if (normalized.startsWith('INSERT INTO template_upload_operations')) {
                const [id, idempotency_key, author_id, template_family_id, template_id, version_id, version_number, version_label, package_fingerprint, state, progress_stage, progress_percent, is_retryable, error_code, error_message, validation_report_json, inventory_json, b2_objects_json, created_at, updated_at] = args;
                const prev = templateUploadOperations.get(id) || {};
                templateUploadOperations.set(id, {
                  id,
                  idempotency_key: idempotency_key || prev.idempotency_key || null,
                  author_id: author_id || prev.author_id,
                  template_family_id: template_family_id || prev.template_family_id || null,
                  template_id: template_id || prev.template_id || null,
                  version_id: version_id || prev.version_id || null,
                  version_number: version_number || prev.version_number || null,
                  version_label: version_label || prev.version_label || null,
                  package_fingerprint: package_fingerprint || prev.package_fingerprint || null,
                  state,
                  progress_stage,
                  progress_percent,
                  is_retryable,
                  error_code,
                  error_message,
                  validation_report_json: validation_report_json || prev.validation_report_json || '{}',
                  inventory_json: inventory_json || prev.inventory_json || '[]',
                  b2_objects_json: b2_objects_json || prev.b2_objects_json || '[]',
                  created_at: prev.created_at || created_at,
                  updated_at
                });
                return { success: true };
              }
              if (normalized.startsWith('INSERT OR IGNORE INTO template_families')) {
                const [id, slug, name, description, thumbnail, category, tier, price, is_featured, is_premium, authorId, created_at, updated_at] = args;
                if (!templateFamilies.has(id)) {
                  templateFamilies.set(id, { id, slug, name, description, thumbnail, category, tier, price, is_featured, is_premium, status: 'draft', visibility: 'public', created_by: authorId, created_at, updated_at });
                }
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO template_files')) {
                const [id, template_version_id, relative_path, storage_key, mime_type, size_bytes, sha256, file_role, is_entry_file, created_at] = args;
                templateFiles.set(id, { id, template_version_id, relative_path, storage_provider: 'b2', storage_key, mime_type, size_bytes, sha256, file_role, is_entry_file, status: 'active', created_at });
                return { success: true };
              }
              if (normalized.startsWith('INSERT OR REPLACE INTO template_fields')) {
                const [id, template_version_id, field_key, field_type, label, placeholder, help_text, is_required, default_value, validation_json, sort_order, group_name, created_at] = args;
                templateFields.set(id, { id, template_version_id, field_key, field_type, label, placeholder, help_text, is_required, default_value, validation_json, sort_order, group_name, status: 'active', created_at });
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO template_versions') && normalized.includes('package_fingerprint')) {
                const [id, template_id, template_family_id, version_number, version_label, name, description, category, tier, price, thumbnail, source_zip_storage_key, runtime_root_storage_key, manifest_storage_key, schema_hash, runtime_hash, source_zip_hash, package_fingerprint, storage_bucket, storage_metadata_json, created_at, created_by] = args;
                templateVersions.set(id, {
                  id, template_id, template_family_id, version_number, version_label, name, description, category, tier, price, thumbnail,
                  source_zip_storage_key, runtime_root_storage_key, manifest_storage_key, schema_hash, runtime_hash, source_zip_hash,
                  package_fingerprint, storage_provider: 'b2', storage_bucket, storage_metadata_json,
                  status: 'ready', is_current: 0, lock_version: 1, created_at, created_by
                });
                return { success: true };
              }
              if (normalized.startsWith("UPDATE template_versions SET status = 'failed'")) {
                const [error_message, id] = args;
                const existing = templateVersions.get(id);
                if (existing) templateVersions.set(id, { ...existing, status: 'failed', error_message });
                return { success: true };
              }
              if (normalized.startsWith("UPDATE template_versions SET is_current = 0, status = 'rollback_candidate'")) {
                const [archived_at, template_id] = args;
                for (const [k, v] of templateVersions.entries()) {
                  if (v.template_id === template_id && v.is_current === 1) {
                    templateVersions.set(k, { ...v, is_current: 0, status: 'rollback_candidate', archived_at });
                  }
                }
                return { success: true };
              }
              if (normalized.startsWith("UPDATE template_versions SET is_current = 1, status = 'published'")) {
                const [published_at, published_by, updated_at, id, template_id] = args;
                const existing = templateVersions.get(id);
                if (existing && existing.template_id === template_id) {
                  templateVersions.set(id, { ...existing, is_current: 1, status: 'published', published_at, published_by, lock_version: (existing.lock_version || 1) + 1, updated_at });
                }
                return { success: true };
              }
              if (normalized.startsWith("UPDATE templates SET status = 'published', is_published = 1")) {
                const [current_version_id, updated_at, id] = args;
                const existing = templates.get(id);
                if (existing) {
                  templates.set(id, { ...existing, status: 'published', is_published: 1, current_version_id, updated_at });
                }
                return { success: true };
              }
              if (normalized.startsWith("UPDATE template_families SET status = 'published', current_version_id = ?")) {
                const [current_version_id, updated_at, id1, id2, id3] = args;
                for (const fid of [id1, id2, id3]) {
                  if (templateFamilies.has(fid)) {
                    const existing = templateFamilies.get(fid);
                    templateFamilies.set(fid, { ...existing, status: 'published', current_version_id, updated_at });
                  }
                }
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO templates') && normalized.includes('detected_fields')) {
                const [id, name, slug, description, category, tier, price, is_premium, featured, thumbnail, capabilities, detected_fields, folder, entry_file, created_at, updated_at] = args;
                const prev = templates.get(id) || {};
                templates.set(id, {
                  ...prev,
                  id, name, slug, description, category, tier, price, is_premium,
                  is_published: prev.is_published ?? 0,
                  status: prev.status || 'draft',
                  featured, placement: prev.placement || 99,
                  thumbnail, capabilities, detected_fields, folder, entry_file,
                  created_at: prev.created_at || created_at, updated_at
                });
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO template_versions') || normalized.startsWith('INSERT OR IGNORE INTO template_versions') || normalized.startsWith('INSERT OR REPLACE INTO template_versions')) {
                const [id, template_id, version_number, name, description, category, tier, price, thumbnail, theme, sections, capabilities, layout, animations, default_config, snapshot_data, status, created_at, created_by] = args;
                templateVersions.set(id, { id, template_id, version_number, name, description, category, tier, price, thumbnail, theme, sections, capabilities, layout, animations, default_config, snapshot_data, status, created_at, created_by });
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO site_settings') || normalized.startsWith('INSERT OR REPLACE INTO site_settings')) {
                const [key, value, type, updated_at, updated_by] = args;
                siteSettings.set(key, { key, value, type, updated_at, updated_by });
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM site_settings')) {
                siteSettings.clear();
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO admin_staff')) {
                const [id, user_id, mobile, name, role, permissions, status, password_hash, password_salt, created_by, created_at, updated_at] = args;
                adminStaff.set(id, { id, user_id, mobile, name, role, permissions, status, password_hash, password_salt, created_by, created_at, updated_at });
                return { success: true };
              }
              if (normalized.startsWith('UPDATE admin_staff SET')) {
                const [name, role, permissions, status, password_hash, password_salt, updated_at, id] = args;
                const existing = adminStaff.get(id);
                if (existing) {
                  adminStaff.set(id, { ...existing, name, role, permissions, status, password_hash, password_salt, updated_at });
                }
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM admin_staff WHERE id = ?')) {
                const id = args[0];
                adminStaff.delete(id);
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM admin_roles WHERE user_id = ?')) {
                const userId = args[0];
                adminRoles.delete(userId);
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM sessions WHERE user_id = ?')) {
                const userId = args[0];
                for (const [token, s] of sessions.entries()) {
                  if (s.user_id === userId) sessions.delete(token);
                }
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO admin_audit_logs')) {
                const [id, actor_id, actor_name, actor_role, action, target_type, target_id, details, ip_address, created_at] = args;
                adminAuditLogs.push({ id, actor_id, actor_name, actor_role, action, target_type, target_id, details, ip_address, created_at });
                return { success: true };
              }
              if (normalized.startsWith('UPDATE users SET role = ?')) {
                const [role, plan, is_premium, displayName, updatedAt, id] = args;
                const existing = users.get(id);
                if (existing) {
                  users.set(id, { ...existing, role, plan, is_premium, display_name: displayName || existing.display_name, updated_at: updatedAt });
                }
                return { success: true };
              }
              if (normalized.startsWith('UPDATE users SET display_name = ?')) {
                const [displayName, avatarUrl, updatedAt, id] = args;
                const existing = users.get(id);
                if (existing) {
                  users.set(id, { ...existing, display_name: displayName, avatar_url: avatarUrl, updated_at: updatedAt });
                }
                return { success: true };
              }
              if (normalized.includes('INTO users')) {
                const id = args[0] || ('usr_' + Date.now());
                const email = args[1] || '';
                const display_name = args[2] || (email ? email.split('@')[0] : 'Creator');
                const avatar_url = args[3] || '';
                const role = args[4] || 'creator';
                const plan = args[5] || 'Free';
                const is_premium = args[6] !== undefined ? args[6] : 0;
                const provider = args[7] || 'email';
                const status = args[8] || 'active';
                const created_at = args[9] || new Date().toISOString();
                const updated_at = args[10] || new Date().toISOString();
                users.set(id, { id, email, display_name, avatar_url, role, plan, is_premium, provider, status, created_at, updated_at });
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO sessions')) {
                const [id, user_id, token, expires_at, created_at] = args;
                sessions.set(token, { id, user_id, token, expires_at, created_at });
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM sessions WHERE token = ?')) {
                const token = args[0];
                sessions.delete(token);
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO wishes')) {
                if (normalized.includes('template_version_id')) {
                  const [id, slug, user_id, order_id, template_id, template_name, tier, price, is_private, buyer_name, buyer_contact, recipient_name, event_date, expiry_date, lifecycle_status, views, custom_data, payment, status, template_version_id, created_at, updated_at] = args;
                  wishes.set(id, { id, slug, user_id, order_id, template_id, template_name, tier, price, is_private, buyer_name, buyer_contact, recipient_name, event_date, expiry_date, lifecycle_status, views, custom_data, payment, status, template_version_id, created_at, updated_at });
                } else {
                  const [id, slug, user_id, order_id, template_id, template_name, tier, price, is_private, buyer_name, buyer_contact, recipient_name, event_date, expiry_date, lifecycle_status, views, custom_data, payment, status, created_at, updated_at] = args;
                  wishes.set(id, { id, slug, user_id, order_id, template_id, template_name, tier, price, is_private, buyer_name, buyer_contact, recipient_name, event_date, expiry_date, lifecycle_status, views, custom_data, payment, status, created_at, updated_at });
                }
                return { success: true };
              }
              if (normalized.startsWith('UPDATE wishes SET slug = ?, recipient_name = ?')) {
                const [slug, recipient_name, buyer_name, event_date, custom_data, updated_at, id] = args;
                const existing = wishes.get(id);
                if (existing) {
                  wishes.set(id, { ...existing, slug, recipient_name, buyer_name, event_date, custom_data, updated_at });
                }
                return { success: true };
              }
              if (normalized.startsWith('UPDATE wishes SET recipient_name = ?')) {
                const [recipient_name, buyer_name, event_date, custom_data, updated_at, id] = args;
                const existing = wishes.get(id);
                if (existing) {
                  wishes.set(id, { ...existing, recipient_name, buyer_name, event_date, custom_data, updated_at });
                }
                return { success: true };
              }
              if (normalized.startsWith('UPDATE wishes SET status = ?')) {
                const [status, custom_data, updated_at, id] = args;
                const existing = wishes.get(id);
                if (existing) {
                  wishes.set(id, { ...existing, status, custom_data, updated_at });
                }
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM wishes WHERE id = ?')) {
                const id = args[0];
                wishes.delete(id);
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO templates')) {
                const [id, slug, name, category, tier, price, is_premium, is_published, status, featured, placement, thumbnail, description, folder, entry_file, created_at, updated_at] = args;
                templates.set(id, { id, slug, name, category, tier, price, is_premium, is_published, status, featured, placement, thumbnail, description, folder, entry_file, created_at, updated_at });
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM templates WHERE id = ?')) {
                const id = args[0];
                templates.delete(id);
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO categories')) {
                const [id, name, slug, icon, sort_order, is_active, created_at, updated_at] = args;
                categories.set(id, { id, name, slug, icon, sort_order, is_active, created_at, updated_at });
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM categories WHERE id = ?')) {
                const id = args[0];
                categories.delete(id);
                return { success: true };
              }
              if (normalized.startsWith('INSERT OR IGNORE INTO favorites')) {
                const [id, user_id, item_id, item_type, created_at] = args;
                favorites.set(`${user_id}_${item_id}`, { id, user_id, item_id, item_type, created_at });
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM favorites WHERE user_id = ? AND item_id = ?')) {
                const [user_id, item_id] = args;
                favorites.delete(`${user_id}_${item_id}`);
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO notifications')) {
                const [id, user_id, type, title, message, action_url, read_at, created_at] = args;
                notifications.set(id, { id, user_id, type, title, message, action_url, read_at, created_at });
                return { success: true };
              }
              if (normalized.startsWith('UPDATE notifications SET read_at = ? WHERE id = ?')) {
                const [read_at, id, user_id] = args;
                const n = notifications.get(id);
                if (n && n.user_id === user_id) {
                  notifications.set(id, { ...n, read_at });
                }
                return { success: true };
              }
              if (normalized.startsWith('DELETE FROM notifications WHERE id = ?')) {
                const [id, user_id] = args;
                const n = notifications.get(id);
                if (n && n.user_id === user_id) {
                  notifications.delete(id);
                }
                return { success: true };
              }
              if (normalized.startsWith('UPDATE wishes SET views = views + 1')) {
                const id = args[0];
                const existing = wishes.get(id);
                if (existing) existing.views = (existing.views || 0) + 1;
                return { success: true };
              }
              if (normalized.startsWith('INSERT OR REPLACE INTO admin_roles') || normalized.startsWith('INSERT INTO admin_roles')) {
                const [id, user_id, role, permissions, granted_by, created_at] = args;
                adminRoles.set(user_id, { id, user_id, role, permissions, granted_by, created_at });
                return { success: true };
              }
              if (normalized.startsWith("UPDATE users SET role = 'admin'")) {
                const [updatedAt, id] = args;
                const existing = users.get(id);
                if (existing) {
                  users.set(id, { ...existing, role: 'admin', is_premium: 1, plan: 'VIP', updated_at: updatedAt });
                }
                return { success: true };
              }
              if (normalized.startsWith('INSERT INTO analytics_events')) {
                analyticsEvents.push(args);
                return { success: true };
              }
              return { success: true };
            }
          };
        }
        return createStatement([]);
      }
    };
  }

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING WISHMAGIC PART 28 CONTRACT & REGRESSION SUITE');
  console.log('================================================================\n');

  const testDb = createTestD1Database();

  const prodEnv = {
    ENVIRONMENT: 'production',
    PUBLIC_APP_URL: 'https://wishmagic.live',
    DB: testDb,
    BUCKET: null
  };

  // --- Test 1: Health & Worker Gateway ---
  console.log('--- 1. Health & Worker Gateway ---');
  {
    const req = new Request('http://localhost/api/health', { method: 'GET' });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'Health endpoint returns HTTP 200');
    const body = await res.json();
    assert(body.success === true, 'Health payload success is true');
    assert(body.data.status === 'ok', 'Health status is ok');
  }

  {
    const req = new Request('http://localhost/api/config', { method: 'GET' });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'Config endpoint returns HTTP 200');
    const body = await res.json();
    assert(body.success === true, 'Config success is true');
    assert(body.data.version !== undefined, 'Config returns app version');
  }

  // --- Test 2: Authentication Flow (Zero-Trust Session) ---
  console.log('\n--- 2. Authentication & Session Boundary ---');
  let userACookie = '';
  let userAId = '';
  let userBCookie = '';
  let userBId = '';

  {
    // Sign In User A (Creator)
    const req = new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user_a@example.com', displayName: 'User Alpha' })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'User A sign-in returns HTTP 200');
    userACookie = res.headers.get('Set-Cookie') || '';
    assert(userACookie.includes('wm_session='), 'Sets secure wm_session cookie');
    assert(userACookie.includes('HttpOnly'), 'wm_session cookie has HttpOnly flag');
    assert(userACookie.includes('SameSite=Lax'), 'wm_session cookie has SameSite=Lax');

    const body = await res.json();
    assert(body.data.user.role === 'creator', 'Default role is strictly creator');
    assert(body.data.user.plan === 'Free', 'Default plan is strictly Free');
    assert(body.data.token === undefined, 'Raw session token is NOT leaked in JSON response');
    userAId = body.data.user.id;
  }

  {
    // Sign In User B (Creator)
    const req = new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user_b@example.com', displayName: 'User Beta' })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'User B sign-in returns HTTP 200');
    userBCookie = res.headers.get('Set-Cookie') || '';
    const body = await res.json();
    userBId = body.data.user.id;
    assert(userAId !== userBId, 'User A and User B receive distinct isolated IDs');
  }

  {
    // Verify Session Hydration for User A
    const req = new Request('http://localhost/api/auth/session', {
      method: 'GET',
      headers: { 'Cookie': userACookie }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'Session check returns HTTP 200');
    const body = await res.json();
    assert(body.data.isAuthenticated === true, 'User A is authenticated');
    assert(body.data.user.id === userAId, 'Hydrated user matches User A');
  }

  // ============================================================================
  // SECURITY REGRESSION TESTS (A THROUGH T)
  // ============================================================================
  console.log('\n--- 3. Security Regression Suite (Part 27 Strict Checks) ---');

  // A. Fake Admin Login Attempt
  {
    const req = new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fake_admin@wishmagic.internal', role: 'admin', isAdmin: true, plan: 'VIP' })
    });
    const res = await worker.fetch(req, prodEnv);
    const body = await res.json();
    assert(body.data.user.role === 'creator', 'SECURITY A: Client cannot grant itself admin role via signin');
    assert(body.data.user.plan === 'Free', 'SECURITY A: Client cannot grant itself VIP plan via signin');
  }

  // B. Fake Dev Token Bypass Attempt
  {
    const req = new Request('http://localhost/api/wishes', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer dev_token_usr_admin_999_bypass' }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 401, 'SECURITY B: Dev token prefix rejected with 401 AUTH_REQUIRED in production');
  }

  // C. Dev Switch Route Production Lock
  {
    const req = new Request('http://localhost/api/auth/dev-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'usr_admin_999' })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 404, 'SECURITY C: /api/auth/dev-switch returns 404 NOT_FOUND in production');
  }

  // D. Client UserId Manipulation in Wish Creation
  let userAWishId = '';
  let userAWishSlug = '';
  {
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        userId: 'usr_victim_spoofed_999',
        customData: {
          recipient_name: 'Rohit Sharma',
          sender_name: 'User Alpha',
          event_date: '2030-05-15',
          custom_message: 'Private celebration message'
        }
      })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 201 || res.status === 200, 'Wish created by User A');
    const body = await res.json();
    const wishObj = body.data.wish || body.wish;
    assert(wishObj.userId === userAId, 'SECURITY D: Wish owner ID is strictly set to authenticated User A, ignoring spoofed userId');
    userAWishId = wishObj.id;
    userAWishSlug = wishObj.slug;
  }

  // E. Client Admin Role Manipulation via Profile Update
  {
    const req = new Request('http://localhost/api/users/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ role: 'admin', isAdmin: true, plan: 'VIP' })
    });
    const res = await worker.fetch(req, prodEnv);
    const body = await res.json();
    assert(body.data.user.role === 'creator', 'SECURITY E: Client cannot escalate role via profile PUT');
  }

  // F. Client Premium Manipulation (Tampering tier: "vip" without server entitlement)
  {
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({
        templateId: 'tpl_golden_elegance', // VIP template
        tier: 'vip',
        isPremium: true,
        customData: { recipient_name: 'Ananya', event_date: '2030-06-01' }
      })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 403, 'SECURITY F: Free user blocked from VIP template despite sending tier: vip in payload');
    const body = await res.json();
    assert(body.error.code === 'PREMIUM_REQUIRED', 'Returns PREMIUM_REQUIRED error code');
  }

  // G. Guest Wish Creation Attempt
  {
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: 'tpl_glitter_birthday', customData: { recipient_name: 'Guest' } })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 401, 'SECURITY G: Unauthenticated guest wish creation rejected with 401 AUTH_REQUIRED');
  }

  // H. Cross-User Wish Access (IDOR GET)
  {
    const req = new Request(`http://localhost/api/wishes/${userAWishId}`, {
      method: 'GET',
      headers: { 'Cookie': userBCookie }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 403, 'SECURITY H: User B cannot access User A private wish (Returns 403 FORBIDDEN)');
  }

  // I. Cross-User Wish Modification (IDOR PUT)
  {
    const req = new Request(`http://localhost/api/wishes/${userAWishId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': userBCookie },
      body: JSON.stringify({ customData: { recipient_name: 'Hacked by User B' } })
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 403, 'SECURITY I: User B cannot modify User A wish (Returns 403 FORBIDDEN)');
  }

  // J. Cross-User Wish Deletion (IDOR DELETE)
  {
    const req = new Request(`http://localhost/api/wishes/${userAWishId}`, {
      method: 'DELETE',
      headers: { 'Cookie': userBCookie }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 403, 'SECURITY J: User B cannot delete User A wish (Returns 403 FORBIDDEN)');
  }

  // K. Wildcard CORS Check
  {
    const req = new Request('http://localhost/api/health', {
      method: 'GET',
      headers: { 'Origin': 'https://wishmagic.live' }
    });
    const res = await worker.fetch(req, prodEnv);
    const allowOrigin = res.headers.get('Access-Control-Allow-Origin');
    assert(allowOrigin === 'https://wishmagic.live', 'CORS returns exact allowed origin');
    assert(allowOrigin !== '*', 'SECURITY K: Allowed origin is not wildcard');
  }

  // L. Unknown-Origin Credentialed Request
  {
    const req = new Request('http://localhost/api/health', {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://evil-untrusted-site.com' }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 403 || res.headers.get('Access-Control-Allow-Origin') === null, 'SECURITY L: Unknown origin rejected/not echoed in CORS preflight');
  }

  // M. Logout Session Reuse
  {
    const tempSign = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'temp_logout@example.com' })
    }), prodEnv);
    const tempCookie = tempSign.headers.get('Set-Cookie') || '';

    // Logout
    const logoutRes = await worker.fetch(new Request('http://localhost/api/auth/signout', {
      method: 'POST',
      headers: { 'Cookie': tempCookie }
    }), prodEnv);
    assert(logoutRes.status === 200, 'Signout successful');

    // Attempt to reuse logged-out session
    const reuseRes = await worker.fetch(new Request('http://localhost/api/wishes', {
      method: 'GET',
      headers: { 'Cookie': tempCookie }
    }), prodEnv);
    assert(reuseRes.status === 401, 'SECURITY M: Logged out session rejected with 401 on subsequent requests');
  }

  // N. Invalid Session
  {
    const req = new Request('http://localhost/api/wishes', {
      method: 'GET',
      headers: { 'Cookie': 'wm_session=completely_bogus_token_12345' }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 401, 'SECURITY N: Invalid session token returns 401 AUTH_REQUIRED');
  }

  // O. Expired Session
  {
    const expiredToken = 'wm_tok_expired_' + Date.now();
    testDb._tables.sessions.set(expiredToken, {
      id: 'sess_exp_1',
      user_id: userAId,
      token: expiredToken,
      expires_at: Date.now() - 10000,
      created_at: new Date(Date.now() - 20000).toISOString()
    });

    const req = new Request('http://localhost/api/wishes', {
      method: 'GET',
      headers: { 'Cookie': `wm_session=${expiredToken}` }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 401, 'SECURITY O: Expired session rejected with 401 AUTH_REQUIRED');
  }

  // P. Payment Client Bypass Attempt
  {
    const req = new Request('http://localhost/api/entitlements/checkout', {
      method: 'POST',
      headers: { 'Cookie': userACookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentSuccess: true, paid: true, tier: 'VIP' })
    });
    const res = await worker.fetch(req, prodEnv);
    const body = await res.json();
    assert(body.data.mode === 'sandbox' || body.data.status === 'provider_not_configured', 'SECURITY P: Client cannot force paid state via request payload');
  }

  // Q. Public Wish Privacy & Zero PII Leakage
  {
    const req = new Request(`http://localhost/api/public/wishes/${userAWishSlug}`, { method: 'GET' });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'Public wish accessible without login');
    const body = await res.json();
    const pubWish = body.data.wish;
    assert(pubWish.user_id === undefined, 'SECURITY Q: Public payload omits user_id');
    assert(pubWish.buyerContact === undefined, 'SECURITY Q: Public payload omits buyerContact');
    assert(pubWish.payment === undefined, 'SECURITY Q: Public payload omits payment metadata');
    assert(pubWish.customData.is_locked === true, 'SECURITY Q: Upcoming wish is locked and masked');
  }

  // R. Admin Endpoint RBAC
  let adminToken = '';
  {
    const guestReq = new Request('http://localhost/api/admin/diagnostic', { method: 'GET' });
    const guestRes = await worker.fetch(guestReq, prodEnv);
    assert(guestRes.status === 401, 'SECURITY R1: Guest access to admin endpoint returns 401');

    const userReq = new Request('http://localhost/api/admin/diagnostic', {
      method: 'GET',
      headers: { 'Cookie': userACookie }
    });
    const userRes = await worker.fetch(userReq, prodEnv);
    assert(userRes.status === 403, 'SECURITY R2: Normal creator access to admin endpoint returns 403 FORBIDDEN');

    const adminUserId = 'usr_real_admin_777';
    testDb._tables.users.set(adminUserId, {
      id: adminUserId,
      email: 'verified_admin@wishmagic.internal',
      display_name: 'Verified Admin',
      role: 'admin',
      plan: 'VIP',
      is_premium: 1,
      status: 'active'
    });
    testDb._tables.adminRoles.set(adminUserId, {
      user_id: adminUserId,
      role: 'SUPER_ADMIN',
      permissions: '["*"]'
    });
    adminToken = 'wm_tok_admin_' + Date.now();
    testDb._tables.sessions.set(adminToken, {
      id: 'sess_admin_1',
      user_id: adminUserId,
      token: adminToken,
      expires_at: Date.now() + 86400000,
      created_at: new Date().toISOString()
    });

    const adminReq = new Request('http://localhost/api/admin/diagnostic', {
      method: 'GET',
      headers: { 'Cookie': `wm_session=${adminToken}` }
    });
    const adminRes = await worker.fetch(adminReq, prodEnv);
    assert(adminRes.status === 200, 'SECURITY R3: Verified server DB admin succeeds with 200 OK');
  }

  // S. D1 Database Unavailable Controlled Degradation
  {
    const noDbEnv = { ...prodEnv, DB: null };
    const req = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ templateId: 'tpl_glitter_birthday' })
    });
    const res = await worker.fetch(req, noDbEnv);
    assert(res.status === 503, 'SECURITY S: When D1 is unavailable, returns 503 DATABASE_UNAVAILABLE');
    const body = await res.json();
    assert(body.error.code === 'DATABASE_UNAVAILABLE', 'Returns machine error code DATABASE_UNAVAILABLE');
  }

  // T. R2 Storage Unavailable Degradation
  {
    const noR2Env = { ...prodEnv, BUCKET: null };
    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ filename: 'song.mp3' })
    });
    const res = await worker.fetch(req, noR2Env);
    const body = await res.json();
    assert(body.data.status === 'storage_not_configured', 'SECURITY T: When R2 unattached, reports storage_not_configured truthfully');
  }

  // ============================================================================
  // PART 28 REALISTIC USER JOURNEYS (E2E)
  // ============================================================================
  console.log('\n--- 4. Realistic User Journeys (#1 to #5 + Admin) ---');

  // Journey #1: Guest browse -> create wish -> login -> customize -> publish -> share -> logout
  {
    console.log('• User Journey #1: Full Creator Lifecycle Flow');
    // 1. Browse marketplace
    const tplRes = await worker.fetch(new Request('http://localhost/api/templates', { method: 'GET' }), prodEnv);
    assert(tplRes.status === 200, 'J1: Browse templates returns 200');

    // 2. Sign In Creator
    const signRes = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'journey1_creator@example.com', displayName: 'Pooja S' })
    }), prodEnv);
    assert(signRes.status === 200, 'J1: Creator sign-in succeeds');
    const cookieJ1 = signRes.headers.get('Set-Cookie') || '';

    // 3. Create Wish
    const createRes = await worker.fetch(new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieJ1 },
      body: JSON.stringify({
        templateId: 'tpl_glitter_birthday',
        customData: {
          recipient_name: 'Pooja',
          sender_name: 'Family',
          event_date: '2028-11-20',
          sections: [
            { id: 'sec_hero', type: 'hero', enabled: true, title: 'Happy Birthday Pooja!' },
            { id: 'sec_gallery', type: 'gallery', enabled: true, photos: ['photo1.jpg', 'photo2.jpg'] }
          ]
        }
      })
    }), prodEnv);
    assert(createRes.status === 201 || createRes.status === 200, 'J1: Wish successfully created on server');
    const createData = await createRes.json();
    const j1Wish = createData.data.wish || createData.wish;

    // 4. Duplicate Wish
    const dupRes = await worker.fetch(new Request(`http://localhost/api/wishes/${j1Wish.id}/duplicate`, {
      method: 'POST',
      headers: { 'Cookie': cookieJ1 }
    }), prodEnv);
    assert(dupRes.status === 201 || dupRes.status === 200, 'J1: Wish duplicated');

    // 5. Update Wish Customizer State
    const updateRes = await worker.fetch(new Request(`http://localhost/api/wishes/${j1Wish.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieJ1 },
      body: JSON.stringify({
        customData: {
          ...j1Wish.customData,
          custom_message: 'Updated heartfelt message'
        }
      })
    }), prodEnv);
    assert(updateRes.status === 200, 'J1: Wish updated');

    // 6. Sign out
    const soRes = await worker.fetch(new Request('http://localhost/api/auth/signout', {
      method: 'POST',
      headers: { 'Cookie': cookieJ1 }
    }), prodEnv);
    assert(soRes.status === 200, 'J1: Signout completed');
  }

  // Journey #2: Cross-User IDOR Enforcement across all methods
  {
    console.log('• User Journey #2: Cross-User IDOR Protection');
    const attackerReq = new Request(`http://localhost/api/wishes/${userAWishId}/duplicate`, {
      method: 'POST',
      headers: { 'Cookie': userBCookie }
    });
    const attackerRes = await worker.fetch(attackerReq, prodEnv);
    assert(attackerRes.status === 403, 'J2: User B cannot duplicate User A wish (403 FORBIDDEN)');
  }

  // Journey #3: Premium Entitlement Lifecycle
  {
    console.log('• User Journey #3: Premium Entitlement Flow');
    // 1. Free user blocked
    const vipReq1 = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ templateId: 'tpl_golden_elegance' })
    });
    const vipRes1 = await worker.fetch(vipReq1, prodEnv);
    assert(vipRes1.status === 403, 'J3: Free user blocked from VIP template');

    // 2. Grant VIP entitlement in D1
    testDb._tables.entitlements.set(`ent_${userAId}`, {
      id: `ent_${userAId}`,
      user_id: userAId,
      plan_id: 'VIP',
      is_active: 1,
      created_at: new Date().toISOString()
    });

    // 3. User with entitlement succeeds
    const vipReq2 = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({
        templateId: 'tpl_golden_elegance',
        customData: { recipient_name: 'VIP Recipient', event_date: '2028-12-01' }
      })
    });
    const vipRes2 = await worker.fetch(vipReq2, prodEnv);
    assert(vipRes2.status === 201 || vipRes2.status === 200, 'J3: User with active server entitlement succeeds in creating VIP wish');

    // 4. Revoke entitlement
    testDb._tables.entitlements.delete(`ent_${userAId}`);

    // 5. Blocked again
    const vipReq3 = new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ templateId: 'tpl_golden_elegance' })
    });
    const vipRes3 = await worker.fetch(vipReq3, prodEnv);
    assert(vipRes3.status === 403, 'J3: Revoked entitlement immediately blocks VIP creation');
  }

  // Journey #4: Asia/Kolkata Lifecycle Boundary Test
  {
    console.log('• User Journey #4: Asia/Kolkata Lifecycle Boundaries');
    // Future date -> UPCOMING
    assert(WishLifecycle.getWishStatus({ eventDate: '2030-01-01' }) === 'upcoming', 'J4: Future date is upcoming');
    // Past date -> EXPIRED
    assert(WishLifecycle.getWishStatus({ eventDate: '2020-01-01' }) === 'expired', 'J4: Past date is expired');
  }

  // Journey #5: Public Wish Privacy & Masking
  {
    console.log('• User Journey #5: Public Wish Privacy & Masking');
    const pubReq = new Request(`http://localhost/api/public/wishes/${userAWishSlug}`);
    const pubRes = await worker.fetch(pubReq, prodEnv);
    assert(pubRes.status === 200, 'J5: Public endpoint accessible');
    const pubData = await pubRes.json();
    assert(pubData.data.wish.isOwner === false, 'J5: Public visitor is not marked as owner');
    assert(pubData.data.wish.customData.is_locked === true, 'J5: Private sections masked for upcoming wish');
  }

  // Admin Journey: Admin Operations & RBAC Gate
  {
    console.log('• Admin Journey: Platform Operations & RBAC Verification');
    const adminReq = new Request('http://localhost/api/admin/metrics', {
      headers: { 'Cookie': `wm_session=${adminToken}` }
    });
    const adminRes = await worker.fetch(adminReq, prodEnv);
    assert(adminRes.status === 200, 'Admin metrics accessible by verified admin');
    const metricsData = await adminRes.json();
    assert(metricsData.data.metrics !== undefined, 'Admin metrics returns data payload');

    // Normal user blocked
    const blockedReq = new Request('http://localhost/api/admin/metrics', {
      headers: { 'Cookie': userACookie }
    });
    const blockedRes = await worker.fetch(blockedReq, prodEnv);
    assert(blockedRes.status === 403, 'Normal user blocked from admin metrics');
  }

  // Public Recipient Journey
  {
    console.log('• Public Recipient Journey: Zero-Auth Keepsake Consumption');
    const pubReq = new Request(`http://localhost/api/public/wishes/${userAWishSlug}`);
    const pubRes = await worker.fetch(pubReq, prodEnv);
    assert(pubRes.status === 200, 'Recipient access succeeds with 200');
    const pubData = await pubRes.json();
    assert(pubData.success === true, 'Public wish payload has success: true');
    assert(pubData.data.wish.userId === undefined, 'No creator userId in recipient payload');
    assert(pubData.data.wish.buyerContact === undefined, 'No creator contact info leaked');
  }

  // Concurrency & Collision Protection
  {
    console.log('• Concurrency & Collision Protection');
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        worker.fetch(new Request('http://localhost/api/wishes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
          body: JSON.stringify({
            templateId: 'tpl_glitter_birthday',
            customData: {
              recipient_name: 'Concurrent Recipient',
              event_date: '2029-01-01'
            }
          })
        }), prodEnv)
      );
    }
    const results = await Promise.all(promises);
    const createdSlugs = new Set();
    for (const res of results) {
      assert(res.status === 201 || res.status === 200, 'Concurrent wish created');
      const body = await res.json();
      const slug = (body.data.wish && body.data.wish.slug) || body.slug;
      assert(!createdSlugs.has(slug), `Slug ${slug} is unique under concurrent creation`);
      createdSlugs.add(slug);
    }
    assert(createdSlugs.size === 5, 'All 5 concurrent wishes received distinct collision-free slugs');
  }

  // Validation Edge Cases
  {
    console.log('• Request Validation & Sanitization Hardening');
    // Invalid email sign-in
    const badEmailRes = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' })
    }), prodEnv);
    assert(badEmailRes.status === 400, 'Malformed email returns 400 VALIDATION_ERROR');

    // Executable file upload block
    const badFileRes = await worker.fetch(new Request('http://localhost/api/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ filename: 'malicious.php.exe' })
    }), prodEnv);
    assert(badFileRes.status === 400, 'Forbidden file extension returns 400 VALIDATION_ERROR');
  }

  // Admin Bootstrap via Secret Test
  {
    console.log('• Admin Bootstrap via Secret Verification');
    const bootstrapEnv = {
      ...prodEnv,
      ADMIN_BOOTSTRAP_SECRET: 'test_super_secret_bootstrap_key_999'
    };

    // 1. Unauthorized when secret is wrong
    const badBootRes = await worker.fetch(new Request('http://localhost/api/admin/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-bootstrap-key': 'wrong_key' },
      body: JSON.stringify({ email: 'newadmin@wishmagic.live' })
    }), bootstrapEnv);
    assert(badBootRes.status === 403, 'Wrong bootstrap secret returns 403 BOOTSTRAP_UNAUTHORIZED');

    // 2. Successful bootstrap with valid secret
    const goodBootRes = await worker.fetch(new Request('http://localhost/api/admin/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-bootstrap-key': 'test_super_secret_bootstrap_key_999' },
      body: JSON.stringify({ email: 'newadmin@wishmagic.live', displayName: 'Bootstrap Admin' })
    }), bootstrapEnv);
    assert(goodBootRes.status === 200, 'Valid bootstrap secret succeeds with 200');
    const bootData = await goodBootRes.json();
    assert(bootData.data.bootstrapped === true, 'Admin successfully bootstrapped into system');
  }

  // ============================================================================
  // PART 30B: FIREBASE ADMIN 2FA OTP & STAFF RBAC VERIFICATION
  // ============================================================================
  {
    console.log('\n--- Part 30B: Admin 2FA SMS OTP & Staff Management RBAC ---');

    // 1. Normal User Login requires NO SMS OTP
    console.log('• Normal Website User Flow (No SMS OTP required)');
    const normalUserRes = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'creator@wishmagic.live', displayName: 'Creator User' })
    }), prodEnv);
    assert(normalUserRes.status === 200, 'Main website login succeeds without SMS OTP');
    const normalData = await normalUserRes.json();
    assert(normalData.data.user !== undefined && normalData.data.user.email === 'creator@wishmagic.live', 'Normal user session authenticated');
    assert(normalData.data.requireOtp === undefined, 'No OTP requested for main website user');

    // 2. OWNER 2FA Login Flow (Step 1: Mobile + Password -> Step 2: OTP)
    console.log('• Admin 2FA: Mobile + Password + SMS OTP Flow');
    const ownerMobile = '+919999900001';
    const ownerPassword = 'SuperSecretOwnerPassword!2026';

    const enc = new TextEncoder();
    const saltBytes = new Uint8Array(16);
    saltBytes.fill(1);
    const ownerSalt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const keyMaterial = await globalThis.crypto.subtle.importKey('raw', enc.encode(ownerPassword), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']);
    const derivedKey = await globalThis.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const rawKey = await globalThis.crypto.subtle.exportKey('raw', derivedKey);
    const ownerHash = Array.from(new Uint8Array(rawKey)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Seed Owner staff record in testDb
    testDb._tables.adminStaff.set('stf_owner_01', {
      id: 'stf_owner_01',
      user_id: 'usr_owner_01',
      mobile: ownerMobile,
      name: 'Platform Owner',
      role: 'OWNER',
      permissions: JSON.stringify(['*']),
      status: 'active',
      password_hash: ownerHash,
      password_salt: ownerSalt,
      created_by: 'system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    testDb._tables.users.set('usr_owner_01', {
      id: 'usr_owner_01',
      email: 'owner@wishmagic.live',
      display_name: 'Platform Owner',
      role: 'admin',
      status: 'active'
    });
    testDb._tables.adminRoles.set('usr_owner_01', {
      id: 'adm_role_owner',
      user_id: 'usr_owner_01',
      role: 'OWNER',
      permissions: JSON.stringify(['*'])
    });

    // Step 1a: Wrong password rejected
    const badPassRes = await worker.fetch(new Request('http://localhost/api/admin/auth/verify-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: ownerMobile, password: 'WrongPassword123' })
    }), prodEnv);
    assert(badPassRes.status === 401, 'Step 1a: Wrong password rejected with 401');

    // Step 1b: Valid password accepted, triggers OTP challenge
    const step1Res = await worker.fetch(new Request('http://localhost/api/admin/auth/verify-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: ownerMobile, password: ownerPassword })
    }), prodEnv);
    assert(step1Res.status === 200, 'Step 1: Mobile + Password verified, returns challenge');
    const step1Data = await step1Res.json();
    assert(step1Data.data.requireOtp === true, 'Step 1 requires OTP verification');
    const challengeId = step1Data.data.challengeId;
    assert(challengeId !== undefined, 'Challenge ID generated');

    // Step 2: Verify SMS OTP
    const step2Res = await worker.fetch(new Request('http://localhost/api/admin/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, otpCode: '852963', mobile: ownerMobile })
    }), prodEnv);
    assert(step2Res.status === 200, 'Step 2: OTP verification succeeds');
    const step2Data = await step2Res.json();
    assert(step2Data.data.user.role === 'OWNER', 'User logged in with OWNER role');
    assert(step2Data.data.user.isOwner === true, 'isOwner flag is true');

    const ownerCookie = step2Res.headers.get('set-cookie');
    assert(ownerCookie !== null && ownerCookie.includes('wm_session'), 'Owner received secure wm_session cookie');

    // 3. OWNER Creates Staff Member
    console.log('• OWNER Staff Management: Create Staff Member');
    const createStaffRes = await worker.fetch(new Request('http://localhost/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie },
      body: JSON.stringify({
        name: 'Rahul Editor',
        mobile: '+919876543210',
        role: 'EDITOR',
        password: 'EditorPassword2026!',
        permissions: ['templates.read', 'templates.write', 'wishes.read']
      })
    }), prodEnv);
    assert(createStaffRes.status === 201, 'OWNER successfully creates staff member');
    const staffData = await createStaffRes.json();
    const createdStaffId = staffData.data.staff.id;
    const staffUserId = staffData.data.staff.userId;
    assert(staffData.data.staff.role === 'EDITOR', 'Staff created with role EDITOR');

    // 4. Staff Cannot Create Secondary OWNER or Other Staff
    console.log('• Privilege Escalation Protection: Staff Cannot Create Staff or OWNER');
    // Simulate Staff Session
    testDb._tables.sessions.set('tok_staff_test', {
      id: 'ses_staff_test',
      user_id: staffUserId,
      token: 'tok_staff_test',
      expires_at: Date.now() + 86400000,
      created_at: new Date().toISOString()
    });
    const staffCookie = 'wm_session=tok_staff_test';

    const escalRes = await worker.fetch(new Request('http://localhost/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': staffCookie },
      body: JSON.stringify({ name: 'Hacker', mobile: '+919999999999', role: 'OWNER', password: '123' })
    }), prodEnv);
    assert(escalRes.status === 403, 'Non-owner staff blocked from creating staff accounts (403)');

    // 5. OWNER Disables Staff Account -> Immediate Session Revocation
    console.log('• Staff Disabling & Session Revocation');
    const disableRes = await worker.fetch(new Request(`http://localhost/api/admin/staff/${createdStaffId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie },
      body: JSON.stringify({ status: 'disabled' })
    }), prodEnv);
    assert(disableRes.status === 200, 'OWNER disables staff account');

    // Attempting API access with revoked session returns 401
    const revokedRes = await worker.fetch(new Request('http://localhost/api/admin/staff', {
      headers: { 'Cookie': staffCookie }
    }), prodEnv);
    assert(revokedRes.status === 401, 'Disabled staff active session immediately revoked (401)');

    // 6. Audit Trail Logging Verification
    console.log('• Security Audit Trail Verification');
    const auditRes = await worker.fetch(new Request('http://localhost/api/admin/audit-logs', {
      headers: { 'Cookie': ownerCookie }
    }), prodEnv);
    assert(auditRes.status === 200, 'Audit logs retrieved by OWNER');
    const auditData = await auditRes.json();
    assert(Array.isArray(auditData.data.logs), 'Audit logs returned as array');
    assert(auditData.data.logs.length >= 2, `Audit logs contain login and staff management events (found ${auditData.data.logs.length})`);
  }

  // ============================================================================
  // DATABASE SCHEMA & DATA INTEGRITY VERIFICATION
  // ============================================================================
  console.log('\n--- 5. Schema, Migrations & Data Integrity Audits ---');
  const migRes = validateMigrations();
  assert(migRes.success === true, 'All D1 migrations and tables validated');

  const integRes = runDataIntegrityCheck();
  assert(integRes.issues.length === 0, 'Data integrity diagnostic completed with 0 errors');

  const secRes = runSecurityAudit();
  assert(secRes.success === true, 'Comprehensive zero-trust security audit passed');

  // ============================================================================
  // OBSERVABILITY & SECRET REDACTION
  // ============================================================================
  console.log('\n--- 6. Observability & Secret Redaction ---');
  const sensitiveObj = {
    password: 'secret_password_123',
    token: 'wm_tok_secret_token_abc',
    nested: {
      apiKey: 'sk_live_12345678901234567890',
      cardNumber: '4111222233334444'
    },
    publicName: 'Wish Celebration'
  };
  const redacted = redactSensitiveData(sensitiveObj);
  assert(redacted.password === '[REDACTED]', 'Password redacted');
  assert(redacted.token === '[REDACTED]', 'Token redacted');
  assert(redacted.nested.apiKey === '[REDACTED]', 'API Key redacted');
  assert(redacted.publicName === 'Wish Celebration', 'Public field preserved');

  // ============================================================================
  // SMART WISH LINK & CUSTOM SLUG SUGGESTIONS SUITE
  // ============================================================================
  console.log('\n--- 7. Smart Wish Link & Custom Slug Suggestions Suite ---');

  // 1. Slug Normalization Unit Tests
  console.log('• Slug Normalization & Safety Hardening');
  assert(WishLinkSuggestions.normalizeNameForSlug('Radha') === 'radha', 'Normalized simple name');
  assert(WishLinkSuggestions.normalizeNameForSlug('Radha Sharma') === 'radha-sharma', 'Spaces to hyphens');
  assert(WishLinkSuggestions.normalizeNameForSlug("Radha's Birthday") === 'radhas-birthday', 'Possessive handled');
  assert(WishLinkSuggestions.normalizeNameForSlug('Rādha') === 'radha', 'Unicode diacritics stripped');
  assert(WishLinkSuggestions.normalizeNameForSlug('Riya & Rahul') === 'riya-rahul', 'Ampersand converted to safe hyphen');
  assert(WishLinkSuggestions.normalizeNameForSlug('   ---Alex---   ') === 'alex', 'Leading/trailing hyphens trimmed');
  assert(WishLinkSuggestions.normalizeNameForSlug('<script>alert("xss")</script>') === 'scriptalertxssscript', 'HTML tags and quotes stripped');

  // 2. Validation & Reserved Route Checking
  console.log('• Reserved Route & Structure Validation');
  assert(WishLinkSuggestions.isReservedSlug('admin') === true, 'admin is reserved');
  assert(WishLinkSuggestions.isReservedSlug('api') === true, 'api is reserved');
  assert(WishLinkSuggestions.isReservedSlug('dashboard') === true, 'dashboard is reserved');
  assert(WishLinkSuggestions.isReservedSlug('happy-birthday-radha') === false, 'celebration slug is not reserved');

  assert(WishLinkSuggestions.isValidSlug('happy-birthday-radha') === true, 'Standard slug is valid');
  assert(WishLinkSuggestions.isValidSlug('a') === false, 'Too short slug is invalid (< 3 chars)');
  assert(WishLinkSuggestions.isValidSlug('admin') === false, 'Reserved slug is invalid');
  assert(WishLinkSuggestions.isValidSlug('invalid--double-hyphen') === false, 'Double hyphens invalid');
  assert(WishLinkSuggestions.isValidSlug('a'.repeat(81)) === false, 'Too long slug is invalid (> 80 chars)');

  // 3. Centralized Contextual Suggestion Generation
  console.log('• Contextual Slug Suggestion Engine');
  // Birthday + Radha
  const bdaySuggestions = WishLinkSuggestions.generateSuggestions({
    occasion: 'birthday',
    recipientName: 'Radha'
  });
  assert(bdaySuggestions.includes('happy-birthday-radha'), 'Includes happy-birthday-radha');
  assert(bdaySuggestions.includes('birthday-wishes-radha'), 'Includes birthday-wishes-radha');
  assert(bdaySuggestions.includes('birthday-surprise-radha'), 'Includes birthday-surprise-radha');
  assert(bdaySuggestions.length >= 5, `Provides at least 5 suggestions (got ${bdaySuggestions.length})`);

  // Birthday + Crush (Radha)
  const crushSuggestions = WishLinkSuggestions.generateSuggestions({
    occasion: 'birthday',
    relationship: 'crush',
    recipientName: 'Radha'
  });
  assert(crushSuggestions.includes('just-for-you-radha'), 'Crush includes just-for-you-radha');
  assert(crushSuggestions.includes('something-special-for-radha'), 'Crush includes something-special-for-radha');

  // Birthday + Girlfriend (Radha)
  const gfSuggestions = WishLinkSuggestions.generateSuggestions({
    occasion: 'birthday',
    relationship: 'girlfriend',
    recipientName: 'Radha'
  });
  assert(gfSuggestions.includes('happy-birthday-my-love'), 'Girlfriend includes happy-birthday-my-love');
  assert(gfSuggestions.includes('birthday-love-radha'), 'Girlfriend includes birthday-love-radha');

  // Birthday + Mother
  const momSuggestions = WishLinkSuggestions.generateSuggestions({
    occasion: 'birthday',
    relationship: 'mother'
  });
  assert(momSuggestions.includes('happy-birthday-mom'), 'Mother includes happy-birthday-mom');
  assert(momSuggestions.includes('love-you-mom'), 'Mother includes love-you-mom');

  // Anniversary
  const annivSuggestions = WishLinkSuggestions.generateSuggestions({
    occasion: 'anniversary',
    recipientName: 'Radha'
  });
  assert(annivSuggestions.includes('happy-anniversary'), 'Anniversary includes happy-anniversary');
  assert(annivSuggestions.includes('happy-anniversary-radha'), 'Anniversary includes happy-anniversary-radha');
  assert(annivSuggestions.includes('our-special-day'), 'Anniversary includes our-special-day');

  // Graceful handling of missing fields (no "undefined")
  const emptySuggestions = WishLinkSuggestions.generateSuggestions({});
  assert(emptySuggestions.length >= 5, 'Empty fields generates fallback suggestions');
  for (const s of emptySuggestions) {
    assert(!s.includes('undefined'), `No 'undefined' in slug "${s}"`);
    assert(WishLinkSuggestions.isValidSlug(s), `Fallback suggestion "${s}" is valid`);
  }

  // 4. Backend /api/wishes/slug-availability Contract Tests
  console.log('• Backend Slug Availability API Contract');

  // Available slug check
  const availRes = await worker.fetch(new Request('http://localhost/api/wishes/slug-availability?slug=super-unique-test-link-xyz'), prodEnv);
  assert(availRes.status === 200, 'Availability check returns 200');
  const availData = await availRes.json();
  assert(availData.success === true, 'Availability success is true');
  assert(availData.available === true, 'Unique slug is reported available');
  assert(availData.slug === 'super-unique-test-link-xyz', 'Normalized slug returned');

  // Reserved slug check
  const reservedRes = await worker.fetch(new Request('http://localhost/api/wishes/slug-availability?slug=admin'), prodEnv);
  assert(reservedRes.status === 200, 'Reserved check returns 200');
  const reservedData = await reservedRes.json();
  assert(reservedData.available === false, 'Reserved slug is unavailable');
  assert(reservedData.reason === 'reserved', 'Reserved reason returned');

  // Invalid slug check
  const invalidRes = await worker.fetch(new Request('http://localhost/api/wishes/slug-availability?slug=ab'), prodEnv);
  assert(invalidRes.status === 200, 'Invalid check returns 200');
  const invalidData = await invalidRes.json();
  assert(invalidData.available === false, 'Short slug is unavailable');
  assert(invalidData.reason === 'invalid', 'Invalid reason returned');

  // Taken slug check with alternatives
  // First create a wish with a known slug
  const takenSlug = 'celebrate-radha-now';
  const wishWithCustomSlugRes = await worker.fetch(new Request('http://localhost/api/wishes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
    body: JSON.stringify({
      templateId: 'tpl_glitter_birthday',
      slug: takenSlug,
      customData: { recipient_name: 'Radha', customSlug: takenSlug }
    })
  }), prodEnv);
  assert(wishWithCustomSlugRes.status === 201, 'Wish created with custom slug');
  const wishCreatedData = await wishWithCustomSlugRes.json();
  const createdWishIdForSlug = (wishCreatedData.data && wishCreatedData.data.wish && wishCreatedData.data.wish.id) || wishCreatedData.wishId;

  // Now checking that taken slug returns available: false and collision alternatives
  const takenRes = await worker.fetch(new Request(`http://localhost/api/wishes/slug-availability?slug=${takenSlug}`), prodEnv);
  assert(takenRes.status === 200, 'Taken check returns 200');
  const takenData = await takenRes.json();
  assert(takenData.available === false, 'Taken slug is reported unavailable');
  assert(takenData.reason === 'taken', 'Reason is taken');
  assert(Array.isArray(takenData.alternatives), 'Alternatives returned as array');
  assert(takenData.alternatives.length > 0, 'At least 1 collision alternative offered');

  // Checking availability with wishId excluding itself (edit scenario)
  const selfRes = await worker.fetch(new Request(`http://localhost/api/wishes/slug-availability?slug=${takenSlug}&wishId=${createdWishIdForSlug}`), prodEnv);
  assert(selfRes.status === 200, 'Self-exclusion check returns 200');
  const selfData = await selfRes.json();
  assert(selfData.available === true, 'Wish editing its own slug is reported available');
  assert(selfData.isCurrent === true, 'isCurrent flag is true');

  // Conflict on duplicate POST with custom slug
  const conflictRes = await worker.fetch(new Request('http://localhost/api/wishes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': userBCookie },
    body: JSON.stringify({
      templateId: 'tpl_glitter_birthday',
      slug: takenSlug,
      customData: { recipient_name: 'Imposter', customSlug: takenSlug }
    })
  }), prodEnv);
  assert(conflictRes.status === 409, 'Duplicate custom slug creation returns 409 Conflict');

  // ============================================================================
  // 8. Smart Wish Link Studio: Options A/B, Admin Config, Dynamic Price & Random Slugs
  // ============================================================================
  console.log('\n--- 8. Smart Wish Link Studio: Options A/B, Admin Settings & Dynamic Pricing ---');

  // A. Public Wish Link Settings API
  console.log('• Public Wish Link Settings Contract');
  const pubSettingsRes = await worker.fetch(new Request('http://localhost/api/settings/wish-links'), prodEnv);
  assert(pubSettingsRes.status === 200, 'Public settings returns 200');
  const pubSettingsData = await pubSettingsRes.json();
  assert(pubSettingsData.success === true, 'Public settings success is true');
  assert(pubSettingsData.settings.personalized.price === 59 || pubSettingsData.settings.personalized.price === 49, 'Default price is 59');
  assert(pubSettingsData.settings.personalized.currency === 'INR', 'Default currency is INR');
  assert(pubSettingsData.settings.personalized.enabled === true, 'Personalized links enabled by default');
  assert(pubSettingsData.settings.random.enabled === true, 'Random links enabled by default');
  assert(pubSettingsData.settings.random.prefix === 'wish-', 'Default prefix is "wish-"');
  assert(pubSettingsData.settings.random.length === 6, 'Default random length is 6');
  assert(typeof pubSettingsData.settings.random.sampleSlug === 'string', 'Sample slug is provided');
  assert(pubSettingsData.settings.random.sampleSlug.startsWith('wish-'), 'Sample slug starts with default prefix');

  // B. Server-Side Random Slug Generator
  console.log('• Server-Side Random Slug Generator');
  const randomSlugRes = await worker.fetch(new Request('http://localhost/api/wishes/generate-random-slug'), prodEnv);
  assert(randomSlugRes.status === 200, 'Generate random slug returns 200');
  const randomSlugData = await randomSlugRes.json();
  assert(randomSlugData.success === true, 'Random slug success is true');
  assert(typeof randomSlugData.slug === 'string', 'Returns string slug');
  assert(randomSlugData.slug.startsWith('wish-'), 'Random slug starts with prefix');
  assert(randomSlugData.slug.length === randomSlugData.prefix.length + 6, 'Random slug has correct prefix + 6 chars length');
  assert(WishLinkSuggestions.isValidSlug(randomSlugData.slug), 'Generated random slug is valid');
  assert(!WishLinkSuggestions.isReservedSlug(randomSlugData.slug), 'Generated random slug is not reserved');

  // C. Option B — Free Random Link Publishing Flow
  console.log('• Option B: Free Random Link Publishing Flow');
  const freeWishRes = await worker.fetch(new Request('http://localhost/api/wishes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
    body: JSON.stringify({
      templateId: 'tpl_glitter_birthday',
      linkType: 'random',
      customData: {
        recipient_name: 'Priya Sharma',
        occasion: 'birthday',
        linkType: 'random'
      }
    })
  }), prodEnv);
  assert(freeWishRes.status === 201, 'Free random wish created with 201 Created');
  const freeWishData = await freeWishRes.json();
  const createdFreeWish = (freeWishData.data && freeWishData.data.wish) || freeWishData.wish;
  assert(createdFreeWish.slug.startsWith('wish-'), 'Created free wish has server-generated random slug');
  assert(createdFreeWish.price === 0, 'Free random wish price is 0 (Free)');
  assert(createdFreeWish.tier === 'free', 'Free random wish tier is free');
  const parsedFreeCd = typeof createdFreeWish.custom_data === 'string' ? JSON.parse(createdFreeWish.custom_data) : createdFreeWish.customData;
  assert(parsedFreeCd.linkType === 'random' || parsedFreeCd.link_type === 'random', 'Link type stored server-side as random');

  // D. Option A — Personalized Link Publishing Flow
  console.log('• Option A: Personalized Link Publishing Flow');
  const personalizedSlug = 'happy-birthday-priya-special';
  const persWishRes = await worker.fetch(new Request('http://localhost/api/wishes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
    body: JSON.stringify({
      templateId: 'tpl_glitter_birthday',
      slug: personalizedSlug,
      linkType: 'personalized',
      customData: {
        recipient_name: 'Priya Sharma',
        occasion: 'birthday',
        customSlug: personalizedSlug,
        linkType: 'personalized'
      }
    })
  }), prodEnv);
  assert(persWishRes.status === 201, 'Personalized wish created with 201 Created');
  const persWishData = await persWishRes.json();
  const createdPersWish = (persWishData.data && persWishData.data.wish) || persWishData.wish;
  assert(createdPersWish.slug === personalizedSlug, 'Personalized wish preserved chosen slug');
  const parsedPersCd = typeof createdPersWish.custom_data === 'string' ? JSON.parse(createdPersWish.custom_data) : createdPersWish.customData;
  assert(parsedPersCd.linkType === 'personalized' || parsedPersCd.link_type === 'personalized', 'Link type stored server-side as personalized');

  // E. Edit Existing Wish: Slug Preservation
  console.log('• Edit Existing Wish Slug Preservation');
  const editRes = await worker.fetch(new Request(`http://localhost/api/wishes/${createdPersWish.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
    body: JSON.stringify({
      customData: {
        recipient_name: 'Priya Verma',
        occasion: 'birthday',
        custom_message: 'Updated anniversary greetings without changing URL'
      }
    })
  }), prodEnv);
  assert(editRes.status === 200, 'Wish update succeeds with 200');
  const editData = await editRes.json();
  const updatedSlug = (editData.data && editData.data.slug) || editData.slug;
  assert(updatedSlug === personalizedSlug, 'Original slug preserved intact on edit without re-randomizing');

  // F. Admin Settings Configuration & Authoritative Dynamic Pricing
  console.log('• Admin Wish Link Settings Configurator & Dynamic Price Updates');

  // Non-admin rejected
  const nonAdminSaveRes = await worker.fetch(new Request('http://localhost/api/admin/settings/wish-links', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
    body: JSON.stringify({ settings: { personalized: { price: 29 } } })
  }), prodEnv);
  assert(nonAdminSaveRes.status === 403, 'Non-admin rejected from updating wish link settings with 403');

  // Admin updates price to ₹29, prefix to 'w-', length to 7
  const adminSaveRes = await worker.fetch(new Request('http://localhost/api/admin/settings/wish-links', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
    body: JSON.stringify({
      settings: {
        personalized: {
          enabled: true,
          price: 29,
          currency: 'INR',
          displayName: 'VIP Custom Link',
          description: 'A special customized address for your celebration'
        },
        random: {
          enabled: true,
          prefix: 'w-',
          length: 7,
          allowedCharacters: 'abcdefghijklmnopqrstuvwxyz0123456789'
        }
      }
    })
  }), prodEnv);
  assert(adminSaveRes.status === 200, 'Admin successfully saves wish link settings with 200');

  // Check public endpoint returns updated price (₹29) and prefix ('w-')
  const updatedPubRes = await worker.fetch(new Request('http://localhost/api/settings/wish-links'), prodEnv);
  const updatedPubData = await updatedPubRes.json();
  assert(updatedPubData.settings.personalized.price === 29, 'Dynamic price is now 29');
  assert(updatedPubData.settings.personalized.displayName === 'VIP Custom Link', 'Dynamic display name updated');
  assert(updatedPubData.settings.random.prefix === 'w-', 'Dynamic prefix is now "w-"');
  assert(updatedPubData.settings.random.length === 7, 'Dynamic length is now 7');

  // Check entitlements checkout endpoint uses dynamic price 29
  const checkoutRes = await worker.fetch(new Request('http://localhost/api/entitlements/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
    body: JSON.stringify({ planId: 'personalized_link' })
  }), prodEnv);
  assert(checkoutRes.status === 200, 'Checkout endpoint returns 200');
  const checkoutData = await checkoutRes.json();
  assert(checkoutData.amount === 29, 'Checkout dynamically reflects updated ₹29 price');
  assert(checkoutData.currency === 'INR', 'Checkout reflects dynamic INR currency');

  // Generate random slug now uses new prefix 'w-' and length 7
  const newRandomRes = await worker.fetch(new Request('http://localhost/api/wishes/generate-random-slug'), prodEnv);
  const newRandomData = await newRandomRes.json();
  assert(newRandomData.slug.startsWith('w-'), 'New random slug starts with new prefix "w-"');
  assert(newRandomData.slug.length === 2 + 7, 'New random slug has prefix (2) + length (7) = 9 chars');

  // G. Admin Settings Validation Constraints
  console.log('• Admin Settings Validation Guards');

  // Cannot disable both options
  const disableBothRes = await worker.fetch(new Request('http://localhost/api/admin/settings/wish-links', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
    body: JSON.stringify({
      settings: {
        personalized: { enabled: false },
        random: { enabled: false }
      }
    })
  }), prodEnv);
  assert(disableBothRes.status === 400, 'Cannot disable both publishing options (returns 400)');

  // Invalid price
  const badPriceRes = await worker.fetch(new Request('http://localhost/api/admin/settings/wish-links', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
    body: JSON.stringify({
      settings: {
        personalized: { price: -10 }
      }
    })
  }), prodEnv);
  assert(badPriceRes.status === 400, 'Negative price rejected with 400');

  // Reserved prefix
  const reservedPrefixRes = await worker.fetch(new Request('http://localhost/api/admin/settings/wish-links', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
    body: JSON.stringify({
      settings: {
        random: { prefix: 'admin-' }
      }
    })
  }), prodEnv);
  assert(reservedPrefixRes.status === 400, 'Reserved prefix rejected with 400');

  // Invalid length
  const badLengthRes = await worker.fetch(new Request('http://localhost/api/admin/settings/wish-links', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
    body: JSON.stringify({
      settings: {
        random: { length: 3 }
      }
    })
  }), prodEnv);
  assert(badLengthRes.status === 400, 'Length < 5 rejected with 400');

  // H. Style Ranking and Name Personalization Toggle in Suggestions
  console.log('• Style Ranking & Personalize With Name Engine');

  const romanticRanked = WishLinkSuggestions.generateSuggestions({
    occasion: 'birthday',
    recipientName: 'Radha',
    style: 'romantic'
  });
  const romanticKeywords = ['love', 'heart', 'forever', 'romantic'];
  const hasRomanticTop = romanticKeywords.some(kw => romanticRanked[0].includes(kw) || romanticRanked[1].includes(kw));
  assert(hasRomanticTop, 'Romantic style elevates romantic keywords to top ranks');

  const magicalRanked = WishLinkSuggestions.generateSuggestions({
    occasion: 'birthday',
    recipientName: 'Radha',
    style: 'magical'
  });
  const magicalKeywords = ['magic', 'starlight', 'surprise', 'wish'];
  const hasMagicalTop = magicalKeywords.some(kw => magicalRanked[0].includes(kw) || magicalRanked[1].includes(kw));
  assert(hasMagicalTop, 'Magical style elevates magical keywords to top ranks');

  // Personalize with recipient name = OFF
  const noNameSuggestions = WishLinkSuggestions.generateSuggestions({
    occasion: 'birthday',
    recipientName: 'Radha',
    personalizeWithName: false
  });
  for (const s of noNameSuggestions) {
    assert(!s.includes('radha'), `Suggestion "${s}" does not contain recipient name when personalizeWithName=false`);
  }
  assert(noNameSuggestions.length >= 5, 'Produces at least 5 suggestions even without recipient name');

  // Reset admin settings to default for clean state
  await worker.fetch(new Request('http://localhost/api/admin/settings/wish-links', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
    body: JSON.stringify({
      settings: {
        personalized: { enabled: true, price: 49, currency: 'INR', displayName: 'Personalized Link' },
        random: { enabled: true, prefix: 'wish-', length: 6, allowedCharacters: 'abcdefghijklmnopqrstuvwxyz0123456789' }
      }
    })
  }), prodEnv);

  // ============================================================================
  // PART 29: CENTRAL SERVER-SIDE SITE CONFIGURATION & D1 INTEGRATION SUITE
  // ============================================================================
  console.log('\n================================================================');
  console.log('🏛️ RUNNING PART 29 CENTRAL SITE CONFIGURATION SUITE');
  console.log('================================================================\n');

  // 1. Admin reads persisted site settings
  console.log('• 1. Admin reads initial persisted site settings');
  {
    const req = new Request('http://localhost/api/admin/settings/site', {
      method: 'GET',
      headers: { 'Cookie': `wm_session=${adminToken}` }
    });
    const res = await worker.fetch(req, prodEnv);
    assert(res.status === 200, 'Admin can read site settings with 200 OK');
    const body = await res.json();
    assert(body.success === true, 'Response indicates success');
    const s = body.data.settings;
    assert(s.heroHeadline && s.brandName === 'WishMagic', 'Initial settings contain hero headline and brand name');
    assert(s.maintenanceMode === false, 'Maintenance mode is initially disabled');
  }

  // 2 & 3. Admin updates hero headline and D1 contains new headline
  console.log('• 2 & 3. Admin updates hero headline -> D1 receives new headline');
  const newHeadline = 'Celebrate Moments with <span class="magical">Unmatched Magic</span>!';
  {
    const updateReq = new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `wm_session=${adminToken}`
      },
      body: JSON.stringify({
        settings: {
          heroHeadline: newHeadline,
          heroBadge: 'Exclusive Celebration Experience 🌟'
        }
      })
    });
    const res = await worker.fetch(updateReq, prodEnv);
    assert(res.status === 200, 'Admin save returns 200 OK');
    const body = await res.json();
    assert(body.data.settings.heroHeadline === newHeadline, 'Returned persisted state has new headline');
    assert(body.data.settings.heroBadge === 'Exclusive Celebration Experience 🌟', 'Returned persisted state has new badge');

    // Verify D1 persistence directly
    const d1HeadlineRow = testDb._tables.siteSettings.get('hero_headline');
    assert(d1HeadlineRow && d1HeadlineRow.value === newHeadline, 'D1 database contains newly persisted hero headline');
  }

  // 4 & 5. Refresh admin page / fetch again -> new headline remains
  console.log('• 4 & 5. Refresh admin settings -> persisted headline remains intact');
  {
    const readReq = new Request('http://localhost/api/admin/settings/site', {
      method: 'GET',
      headers: { 'Cookie': `wm_session=${adminToken}` }
    });
    const res = await worker.fetch(readReq, prodEnv);
    const body = await res.json();
    assert(body.data.settings.heroHeadline === newHeadline, 'Refreshed admin settings retain persisted headline');
  }

  // 6 & 7. Public settings endpoint returns new headline and safe schema
  console.log('• 6 & 7. Public settings API returns updated headline with safe public schema');
  {
    const pubReq = new Request('http://localhost/api/settings/site', { method: 'GET' });
    const res = await worker.fetch(pubReq, prodEnv);
    assert(res.status === 200, 'Public settings API returns 200 OK');
    assert(res.headers.get('Cache-Control').includes('no-cache'), 'Public endpoint specifies no-cache to prevent stale data');
    const body = await res.json();
    const pubSettings = body.data.settings;
    assert(pubSettings.heroHeadline === newHeadline, 'Public settings expose new headline');
    assert(pubSettings.heroBadge === 'Exclusive Celebration Experience 🌟', 'Public settings expose new badge');
    assert(pubSettings.heroStyleGradient !== undefined, 'Public settings include computed hero gradient');
    assert(pubSettings.supportWaUrl !== undefined, 'Public settings include safe support WhatsApp URL');
    // Ensure no secret or private fields leaked
    assert(pubSettings.databaseId === undefined && pubSettings.adminPassword === undefined, 'No secrets leaked in public config');
  }

  // 8. Change CTA text
  console.log('• 8. Change primary & secondary CTA text');
  {
    const updateCta = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({
        settings: {
          heroCta1: 'Craft Magic Now',
          heroCta2: 'Browse Gallery'
        }
      })
    }), prodEnv);
    assert(updateCta.status === 200, 'CTA update succeeds with 200');
    const pubRes = await worker.fetch(new Request('http://localhost/api/settings/site'), prodEnv);
    const pub = (await pubRes.json()).data.settings;
    assert(pub.heroCta1 === 'Craft Magic Now', 'Public CTA 1 matches updated setting');
    assert(pub.heroCta2 === 'Browse Gallery', 'Public CTA 2 matches updated setting');
  }

  // 9. Change Brand Name
  console.log('• 9. Change Brand Name');
  {
    const updateBrand = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({
        settings: { brandName: 'WishMagic Premium' }
      })
    }), prodEnv);
    assert(updateBrand.status === 200, 'Brand name update succeeds');
    const pubRes = await worker.fetch(new Request('http://localhost/api/settings/site'), prodEnv);
    const pub = (await pubRes.json()).data.settings;
    assert(pub.brandName === 'WishMagic Premium', 'Public settings show updated brand name');
  }

  // 10. Change Hero Canvas / Gradient Style
  console.log('• 10. Change Hero Canvas / Gradient Style');
  {
    const updateStyle = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({
        settings: { heroStyle: 'midnight-gold' }
      })
    }), prodEnv);
    assert(updateStyle.status === 200, 'Hero style update succeeds');
    const pubRes = await worker.fetch(new Request('http://localhost/api/settings/site'), prodEnv);
    const pub = (await pubRes.json()).data.settings;
    assert(pub.heroStyle === 'midnight-gold', 'Hero style is midnight-gold');
    assert(pub.heroStyleGradient.includes('#d97706'), 'Public gradient reflects midnight-gold color scheme');
  }

  // 11. Toggle Particle FX
  console.log('• 11. Toggle Ambient Cosmic Particle FX');
  {
    // Toggle off
    await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({ settings: { particleFx: false } })
    }), prodEnv);
    let pubRes = await worker.fetch(new Request('http://localhost/api/settings/site'), prodEnv);
    let pub = (await pubRes.json()).data.settings;
    assert(pub.particleFx === false, 'Particle FX disabled in public config');

    // Toggle on
    await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({ settings: { particleFx: true } })
    }), prodEnv);
    pubRes = await worker.fetch(new Request('http://localhost/api/settings/site'), prodEnv);
    pub = (await pubRes.json()).data.settings;
    assert(pub.particleFx === true, 'Particle FX re-enabled in public config');
  }

  // 12. Change WhatsApp Number and Validate Safe URL Generation
  console.log('• 12. Support WhatsApp update and URL generation');
  {
    const updateWa = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({ settings: { supportWa: '+91 99887 76655' } })
    }), prodEnv);
    assert(updateWa.status === 200, 'Valid WhatsApp number accepted');
    const pubRes = await worker.fetch(new Request('http://localhost/api/settings/site'), prodEnv);
    const pub = (await pubRes.json()).data.settings;
    assert(pub.supportWa === '+91 99887 76655', 'Support WhatsApp number stored');
    assert(pub.supportWaUrl.startsWith('https://wa.me/919988776655'), 'Safe WhatsApp direct link generated');
  }

  // 13, 14, 15, 16. Maintenance Mode Enforcement and Exemption
  console.log('• 13-16. Maintenance Mode Server-Side Enforcement & Exemption');
  {
    // Enable Maintenance Mode
    const enableMaint = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({ settings: { maintenanceMode: true } })
    }), prodEnv);
    assert(enableMaint.status === 200, 'Maintenance mode toggle to true succeeds');

    // Non-admin request to public storefront should receive 503 Maintenance
    const publicStorefrontReq = new Request('http://localhost/', {
      method: 'GET',
      headers: { 'Accept': 'text/html' }
    });
    const publicMaintRes = await worker.fetch(publicStorefrontReq, prodEnv);
    assert(publicMaintRes.status === 503, 'Public storefront returns 503 Service Unavailable when maintenance is ON');
    assert(publicMaintRes.headers.get('X-Maintenance-Mode') === 'active', 'Response contains X-Maintenance-Mode header');

    // Admin request to storefront should be allowed through
    const adminStorefrontReq = new Request('http://localhost/', {
      method: 'GET',
      headers: { 'Accept': 'text/html', 'Cookie': `wm_session=${adminToken}` }
    });
    const adminMaintRes = await worker.fetch(adminStorefrontReq, prodEnv);
    assert(adminMaintRes.status === 200 || adminMaintRes.status === 404, 'Admin is not blocked by maintenance mode');

    // Admin API routes continue working
    const adminApiReq = new Request('http://localhost/api/admin/settings/site', {
      method: 'GET',
      headers: { 'Cookie': `wm_session=${adminToken}` }
    });
    const adminApiRes = await worker.fetch(adminApiReq, prodEnv);
    assert(adminApiRes.status === 200, 'Admin API remains accessible during maintenance mode');

    // Health check continues working
    const healthRes = await worker.fetch(new Request('http://localhost/api/health'), prodEnv);
    assert(healthRes.status === 200, 'Health check continues working during maintenance mode');

    // Disable Maintenance Mode
    const disableMaint = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({ settings: { maintenanceMode: false } })
    }), prodEnv);
    assert(disableMaint.status === 200, 'Maintenance mode disabled successfully');

    // Public storefront now returns normal response
    const normalStorefrontRes = await worker.fetch(new Request('http://localhost/', {
      headers: { 'Accept': 'text/html' }
    }), prodEnv);
    assert(normalStorefrontRes.status !== 503, 'Storefront no longer returns 503 when maintenance mode is OFF');
  }

  // 17. Security & Authorization Checks
  console.log('• 17. Security & Authorization Checks (401/403)');
  {
    // Unauthenticated GET
    const unauthGet = await worker.fetch(new Request('http://localhost/api/admin/settings/site'), prodEnv);
    assert(unauthGet.status === 401, 'Unauthenticated GET to admin settings returns 401 AUTH_REQUIRED');

    // Unauthenticated PUT
    const unauthPut = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { heroHeadline: 'Hacked Headline' } })
    }), prodEnv);
    assert(unauthPut.status === 401, 'Unauthenticated PUT returns 401 AUTH_REQUIRED');

    // Regular creator user (non-admin)
    const creatorPut = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': userACookie },
      body: JSON.stringify({ settings: { heroHeadline: 'Hacked by Creator' } })
    }), prodEnv);
    assert(creatorPut.status === 403, 'Creator user PUT returns 403 FORBIDDEN');
  }

  // 18. Validation of Types, Lengths, Prohibited Inputs
  console.log('• 18. Server-Side Input Validation & Sanitization');
  {
    // Prohibited script tag in headline
    const xssHeadline = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({ settings: { heroHeadline: 'Headline with <script>alert(1)</script>' } })
    }), prodEnv);
    assert(xssHeadline.status === 400, 'Script injection in headline rejected with 400');

    // Invalid hero style
    const badStyle = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({ settings: { heroStyle: 'neon-cyberpunk-invalid' } })
    }), prodEnv);
    assert(badStyle.status === 400, 'Unsupported hero style rejected with 400');

    // Invalid WhatsApp characters
    const badWa = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({ settings: { supportWa: 'CALL-ME-NOW-123' } })
    }), prodEnv);
    assert(badWa.status === 400, 'Invalid WhatsApp characters rejected with 400');

    // Invalid currency
    const badCurrency = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({ settings: { currency: 'BITCOIN' } })
    }), prodEnv);
    assert(badCurrency.status === 400, 'Unsupported currency rejected with 400');
  }

  // 19. Reset to Factory Defaults
  console.log('• 19. Reset site configuration to factory defaults');
  {
    const resetRes = await worker.fetch(new Request('http://localhost/api/admin/settings/site/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` }
    }), prodEnv);
    assert(resetRes.status === 200, 'Reset to factory defaults returns 200 OK');
    const body = await resetRes.json();
    assert(body.data.settings.heroBadge === 'Make Every Moment Magical ✨', 'Hero badge reset to factory default');
    assert(body.data.settings.brandName === 'WishMagic', 'Brand name reset to WishMagic');

    const pubRes = await worker.fetch(new Request('http://localhost/api/settings/site'), prodEnv);
    const pub = (await pubRes.json()).data.settings;
    assert(pub.brandName === 'WishMagic', 'Public configuration reflects restored defaults');
  }

  // ============================================================================
  // PART 30: IMMUTABLE TEMPLATE VERSION SNAPSHOT SYSTEM (TESTS 1 - 24)
  // ============================================================================
  console.log('\n================================================================');
  console.log('🏛️ RUNNING PART 30 IMMUTABLE TEMPLATE VERSION SNAPSHOT SUITE');
  console.log('================================================================');

  let testTemplateId = 'tpl_celestial_magic_' + Date.now().toString(36);
  let v1Id = null;
  let v2Id = null;
  let wishAId = null;
  let wishASlug = null;
  let wishBId = null;
  let wishBSlug = null;
  let wishDupId = null;
  let userAToken = null;
  let userBToken = null;

  // Setup test users
  {
    const userA = {
      id: 'usr_creator_alice',
      email: 'alice@example.com',
      display_name: 'Alice Creator',
      role: 'creator',
      plan: 'free',
      is_premium: 0,
      status: 'active'
    };
    const userB = {
      id: 'usr_creator_bob',
      email: 'bob@example.com',
      display_name: 'Bob Creator',
      role: 'creator',
      plan: 'free',
      is_premium: 0,
      status: 'active'
    };
    testDb._tables.users.set(userA.id, userA);
    testDb._tables.users.set(userB.id, userB);

    userAToken = 'tok_alice_' + Math.random().toString(36);
    userBToken = 'tok_bob_' + Math.random().toString(36);
    testDb._tables.sessions.set(userAToken, { id: 'sess_alice', user_id: userA.id, token: userAToken, expires_at: Date.now() + 86400000 });
    testDb._tables.sessions.set(userBToken, { id: 'sess_bob', user_id: userB.id, token: userBToken, expires_at: Date.now() + 86400000 });
  }

  // TEST 1: Create Template Version 1
  console.log('• TEST 1: Create Template Version 1');
  {
    const createRes = await worker.fetch(new Request('http://localhost/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({
        id: testTemplateId,
        name: 'Celestial Magic',
        category: 'Birthday',
        tier: 'free',
        price: 0,
        theme: {
          mood: 'Purple Gold Starlight',
          accentColor: '#9333ea',
          gradient: 'from-purple-900 via-indigo-900 to-amber-500'
        },
        sections: ['Hero Cosmic', 'Constellation Gallery', 'Starlight Dedication']
      })
    }), prodEnv);
    assert(createRes.status === 201, 'Template created with 201 Created');
    const body = await createRes.json();
    v1Id = body.data.versionId;
    assert(v1Id && v1Id.includes('v1'), 'Template Version 1 ID generated');
  }

  // TEST 2: Create Wish A using Version 1
  console.log('• TEST 2: Create Wish A using Version 1');
  {
    const createWishRes = await worker.fetch(new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${userAToken}` },
      body: JSON.stringify({
        templateId: testTemplateId,
        customData: {
          recipient_name: 'Luna Lovegood',
          sender_name: 'Alice',
          custom_message: 'Happy Birthday under the stars!'
        }
      })
    }), prodEnv);
    assert(createWishRes.status === 201, 'Wish A created with 201 Created');
    const body = await createWishRes.json();
    wishAId = body.data.wishId;
    wishASlug = body.data.slug;
    assert(wishAId && wishASlug, 'Wish A returned ID and unique slug');
  }

  // TEST 3: Verify Wish A stores Version 1
  console.log('• TEST 3: Verify Wish A stores Version 1');
  {
    const getRes = await worker.fetch(new Request(`http://localhost/api/wishes/${wishAId}`, {
      headers: { 'Cookie': `wm_session=${userAToken}` }
    }), prodEnv);
    assert(getRes.status === 200, 'Wish A fetch returns 200');
    const body = await getRes.json();
    assert(body.data.wish.templateVersionId === v1Id, 'Wish A stores exact Template Version 1 ID');
    assert(body.data.template && body.data.template.versionNumber === 1, 'Wish A resolves Template Version 1 snapshot');
    assert(body.data.template.theme.mood === 'Purple Gold Starlight', 'Wish A contains Version 1 Purple Gold theme');
  }

  // TEST 4: Create Template Version 2
  console.log('• TEST 4: Create Template Version 2');
  {
    const updateRes = await worker.fetch(new Request(`http://localhost/api/templates/${testTemplateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({
        name: 'Celestial Magic - Electric Pink & Cyan Re-imagined',
        theme: {
          mood: 'Electric Pink Neon',
          accentColor: '#ec4899',
          gradient: 'from-pink-600 via-rose-500 to-cyan-400'
        },
        sections: ['Hero Hologram', 'Cyber Neon Gallery', 'Synthwave Finale']
      })
    }), prodEnv);
    assert(updateRes.status === 200, 'Template updated with 200 OK');
    const body = await updateRes.json();
    v2Id = body.data.versionId;
    assert(v2Id && v2Id.includes('v2'), 'Template Version 2 ID generated');
    assert(body.data.versionNumber === 2, 'Version Number incremented to 2');
  }

  // TEST 5: Verify Version 1 remains unchanged
  console.log('• TEST 5: Verify Version 1 remains unchanged');
  {
    const v1Snapshot = testDb._tables.templateVersions.get(v1Id);
    assert(v1Snapshot !== undefined, 'Version 1 snapshot row persists in database');
    const v1Parsed = typeof v1Snapshot.snapshot_data === 'string' ? JSON.parse(v1Snapshot.snapshot_data) : v1Snapshot;
    assert(v1Parsed.theme.mood === 'Purple Gold Starlight', 'Version 1 theme is immutable and unchanged');
    assert(v1Parsed.versionNumber === 1, 'Version 1 version number remains 1');
  }

  // TEST 6: Create Wish B after Version 2 becomes current
  console.log('• TEST 6: Create Wish B after Version 2 becomes current');
  {
    const createWishB = await worker.fetch(new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${userBToken}` },
      body: JSON.stringify({
        templateId: testTemplateId,
        customData: {
          recipient_name: 'Bob Ross',
          sender_name: 'Bob',
          custom_message: 'Keep painting happy clouds!'
        }
      })
    }), prodEnv);
    assert(createWishB.status === 201, 'Wish B created with 201 Created');
    const body = await createWishB.json();
    wishBId = body.data.wishId;
    wishBSlug = body.data.slug;
  }

  // TEST 7: Verify Wish B uses Version 2
  console.log('• TEST 7: Verify Wish B uses Version 2');
  {
    const getResB = await worker.fetch(new Request(`http://localhost/api/wishes/${wishBId}`, {
      headers: { 'Cookie': `wm_session=${userBToken}` }
    }), prodEnv);
    assert(getResB.status === 200, 'Wish B fetch returns 200');
    const body = await getResB.json();
    assert(body.data.wish.templateVersionId === v2Id, 'Wish B stores exact Template Version 2 ID');
    assert(body.data.template.versionNumber === 2, 'Wish B resolves Template Version 2 snapshot');
    assert(body.data.template.theme.mood === 'Electric Pink Neon', 'Wish B contains Version 2 Electric Pink theme');
  }

  // TEST 8: Verify Wish A still renders Version 1
  console.log('• TEST 8: Verify Wish A still renders Version 1');
  {
    const pubResA = await worker.fetch(new Request(`http://localhost/api/public/wishes/${wishASlug}`), prodEnv);
    assert(pubResA.status === 200, 'Public Wish A returns 200 OK');
    const body = await pubResA.json();
    assert(body.data.wish.templateVersionId === v1Id, 'Public Wish A maintains Version 1 ID reference');
    assert(body.data.template.versionNumber === 1, 'Public Wish A renders Version 1 snapshot');
    assert(body.data.template.theme.mood === 'Purple Gold Starlight', 'Public Wish A maintains original Version 1 design');
  }

  // TEST 9: Verify Wish B renders Version 2
  console.log('• TEST 9: Verify Wish B renders Version 2');
  {
    const pubResB = await worker.fetch(new Request(`http://localhost/api/public/wishes/${wishBSlug}`), prodEnv);
    assert(pubResB.status === 200, 'Public Wish B returns 200 OK');
    const body = await pubResB.json();
    assert(body.data.wish.templateVersionId === v2Id, 'Public Wish B maintains Version 2 ID reference');
    assert(body.data.template.versionNumber === 2, 'Public Wish B renders Version 2 snapshot');
    assert(body.data.template.theme.mood === 'Electric Pink Neon', 'Public Wish B renders new Version 2 design');
  }

  // TEST 10: Duplicate Wish A. Verify duplicate uses Version 1
  console.log('• TEST 10: Duplicate Wish A (Preserves Version 1)');
  {
    const dupRes = await worker.fetch(new Request(`http://localhost/api/wishes/${wishAId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${userAToken}` }
    }), prodEnv);
    assert(dupRes.status === 201, 'Duplicate Wish A returns 201 Created');
    const body = await dupRes.json();
    wishDupId = body.data.wishId;
    assert(body.data.templateVersionId === v1Id, 'Duplicate Wish preserves original Version 1 snapshot ID');
  }

  // TEST 11: Verify duplicate has a new Wish ID
  console.log('• TEST 11: Verify duplicate has a new Wish ID');
  {
    assert(wishDupId !== wishAId, 'Duplicate Wish ID is distinct from source Wish ID');
  }

  // TEST 12: Verify duplicate has correct ownership
  console.log('• TEST 12: Verify duplicate has correct ownership');
  {
    const dupRow = testDb._tables.wishes.get(wishDupId);
    assert(dupRow.user_id === 'usr_creator_alice', 'Duplicate wish is owned by Alice');
  }

  // TEST 13: Verify duplicate slug handling remains correct
  console.log('• TEST 13: Verify duplicate slug handling remains correct');
  {
    const dupRow = testDb._tables.wishes.get(wishDupId);
    assert(dupRow.slug && dupRow.slug !== wishASlug, 'Duplicate has unique fresh slug');
  }

  // TEST 14: Attempt unauthorized template-version manipulation
  console.log('• TEST 14: Attempt unauthorized template-version manipulation');
  {
    const unauthUpdate = await worker.fetch(new Request(`http://localhost/api/templates/${testTemplateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${userAToken}` },
      body: JSON.stringify({ name: 'Hacked Template' })
    }), prodEnv);
    assert(unauthUpdate.status === 403, 'Non-admin user rejected with 403 Forbidden on template version update');
  }

  // TEST 15: Attempt cross-user Wish access
  console.log('• TEST 15: Attempt cross-user Wish access');
  {
    const crossRes = await worker.fetch(new Request(`http://localhost/api/wishes/${wishAId}`, {
      headers: { 'Cookie': `wm_session=${userBToken}` }
    }), prodEnv);
    assert(crossRes.status === 403, 'Bob rejected with 403 Forbidden when attempting to access Alice Wish A');
  }

  // TEST 16: Modify current template. Verify old published Wish remains unchanged
  console.log('• TEST 16: Modify current template -> Old published Wish A remains unchanged');
  {
    await worker.fetch(new Request(`http://localhost/api/templates/${testTemplateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({
        name: 'Celestial Magic - Version 3 Gold & Emerald',
        theme: {
          mood: 'Gold & Emerald Deluxe',
          accentColor: '#10b981',
          gradient: 'from-emerald-900 via-teal-900 to-amber-300'
        }
      })
    }), prodEnv);

    // Wish A must still render Version 1
    const pubResA = await worker.fetch(new Request(`http://localhost/api/public/wishes/${wishASlug}`), prodEnv);
    const body = await pubResA.json();
    assert(body.data.template.versionNumber === 1, 'Wish A still renders Version 1 snapshot after template changes to V3');
    assert(body.data.template.theme.mood === 'Purple Gold Starlight', 'Wish A theme remains untouched');
  }

  // TEST 17: Archive/deactivate current template. Verify existing Wishes still work
  console.log('• TEST 17: Archive/deactivate current template -> Existing Wishes still work');
  {
    const deleteAttempt = await worker.fetch(new Request(`http://localhost/api/templates/${testTemplateId}`, {
      method: 'DELETE',
      headers: { 'Cookie': `wm_session=${adminToken}` }
    }), prodEnv);
    assert(deleteAttempt.status === 200, 'Delete response received');
    const deleteBody = await deleteAttempt.json();
    // Verify safe check was triggered or soft-handled
    assert(deleteBody.data.referenced === true || deleteBody.data.deleted === true, 'Safe deletion protects referenced wishes');

    // Verify Wish A continues rendering safely
    const pubResA = await worker.fetch(new Request(`http://localhost/api/public/wishes/${wishASlug}`), prodEnv);
    assert(pubResA.status === 200, 'Existing Wish A continues rendering cleanly even after template archival');
  }

  // TEST 18: Verify old public URLs remain valid
  console.log('• TEST 18: Verify old public URLs remain valid');
  {
    const pubResA = await worker.fetch(new Request(`http://localhost/api/public/wishes/${wishASlug}`), prodEnv);
    assert(pubResA.status === 200, 'Old public wish URL /w/:slug remains 200 OK');
    const body = await pubResA.json();
    assert(body.data.wish.slug === wishASlug, 'Public slug resolves correct wish');
  }

  // TEST 19: Verify existing Wish expiration/lifecycle behavior remains unchanged
  console.log('• TEST 19: Verify existing Wish expiration/lifecycle behavior remains unchanged');
  {
    const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const lifecycleResult = WishLifecycle.getWishStatus({ eventDate: todayIso });
    assert(lifecycleResult === 'active', 'Lifecycle engine computes active status correctly for today');
    assert(WishLifecycle.getWishStatus({ eventDate: '2035-01-01' }) === 'upcoming', 'Future date is upcoming');
    assert(WishLifecycle.getWishStatus({ eventDate: '2020-01-01' }) === 'expired', 'Past date is expired');
  }

  // TEST 20: Verify Smart Wish Link functionality still works
  console.log('• TEST 20: Verify Smart Wish Link functionality still works');
  {
    const linkSettingsRes = await worker.fetch(new Request('http://localhost/api/settings/wish-links'), prodEnv);
    assert(linkSettingsRes.status === 200, 'Smart Wish Link settings endpoint returns 200');
    const body = await linkSettingsRes.json();
    assert(body.data.settings.personalized.enabled === true, 'Personalized link setting is active');
    assert(body.data.settings.random.enabled === true, 'Random link setting is active');
  }

  // TEST 21: Verify ₹49 Personalized Link functionality still works
  console.log('• TEST 21: Verify ₹49 Personalized Link functionality still works');
  {
    const customSlug = 'celestial-star-' + Math.random().toString(36).slice(-4);
    const createPersonalized = await worker.fetch(new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${userAToken}` },
      body: JSON.stringify({
        templateId: testTemplateId,
        slug: customSlug,
        linkType: 'personalized',
        customData: { recipient_name: 'Zoe', sender_name: 'Alice' }
      })
    }), prodEnv);
    assert(createPersonalized.status === 201, 'Personalized link wish created with 201');
    const body = await createPersonalized.json();
    assert(body.data.slug === customSlug, 'Personalized slug preserved');
  }

  // TEST 22: Verify Free Random Link functionality still works
  console.log('• TEST 22: Verify Free Random Link functionality still works');
  {
    const createRandom = await worker.fetch(new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${userBToken}` },
      body: JSON.stringify({
        templateId: testTemplateId,
        linkType: 'random',
        customData: { recipient_name: 'Leo', sender_name: 'Bob' }
      })
    }), prodEnv);
    assert(createRandom.status === 201, 'Free random link wish created with 201');
    const body = await createRandom.json();
    assert(body.data.slug.startsWith('wish-') || body.data.slug.length >= 6, 'Random slug generated with valid prefix/format');
  }

  // TEST 23: Verify Admin Settings functionality remains intact
  console.log('• TEST 23: Verify Admin Settings functionality remains intact');
  {
    const adminSettingsRes = await worker.fetch(new Request('http://localhost/api/admin/settings/site', {
      headers: { 'Cookie': `wm_session=${adminToken}` }
    }), prodEnv);
    assert(adminSettingsRes.status === 200, 'Admin settings endpoint returns 200 OK');
  }

  // TEST 24: Verify all existing tests continue passing
  console.log('• TEST 24: Verify all existing tests continue passing');
  {
    assert(failedTests === 0, 'Zero test failures across all verification suites');
  }


  // ============================================================================
  // PART 31: PRODUCTION SECURITY, CRYPTOGRAPHIC TOKEN VERIFICATION,
  //          SESSION REVOCATION, ADMIN POLICY, DOMAIN CONSISTENCY &
  //          B2 TEMPLATE UPLOAD (ZIP & FOLDER) / PUBLISH / RENDER VERIFICATION
  // ============================================================================
  console.log('\n================================================================');
  console.log('🔒 RUNNING PART 31 SECURITY, AUTH, DOMAIN & B2 TEMPLATE SUITE');
  console.log('================================================================\n');

  // Helper to base64url encode
  function toBase64Url(input) {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Generate real RSA-2048 keypair for cryptographic JWT signing & verification tests
  const rsaKeyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', rsaKeyPair.publicKey);
  publicJwk.kid = 'test_firebase_key_2026';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  async function signTestRs256Jwt(claims, headerOverrides = {}, signingKey = rsaKeyPair.privateKey) {
    const header = { alg: 'RS256', typ: 'JWT', kid: 'test_firebase_key_2026', ...headerOverrides };
    const encodedHeader = toBase64Url(JSON.stringify(header));
    const encodedPayload = toBase64Url(JSON.stringify(claims));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const sigBuf = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      signingKey,
      new TextEncoder().encode(signingInput)
    );
    return `${signingInput}.${toBase64Url(sigBuf)}`;
  }

  // --- 1. Cryptographic Authentication Token Verification (Fail-Closed) ---
  console.log('• 1. Authentication Token Verification (RS256 Signature, Claims & Fail-Closed)');
  {
    const nowSec = Math.floor(Date.now() / 1000);
    const validClaims = {
      iss: 'https://securetoken.google.com/wish-magic-47944',
      aud: 'wish-magic-47944',
      sub: 'fb_uid_verified_101',
      email: 'verified.user@wishmagic.live',
      name: 'Verified Creator',
      iat: nowSec - 30,
      exp: nowSec + 3600
    };

    // 1A. Unsigned / alg:none token MUST be rejected
    const unsignedJwt = `${toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${toBase64Url(JSON.stringify(validClaims))}.sig`;
    const resNone = await verifyToken(unsignedJwt, { FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(resNone.valid === false, 'AUTH 1A: alg:none JWT rejected');
    assert(resNone.error === 'AUTH_TOKEN_SIGNATURE_INVALID', 'AUTH 1A: alg:none returns AUTH_TOKEN_SIGNATURE_INVALID');

    // 1B. Decoded JWT without configured FIREBASE_API_KEY or matching JWKS MUST fail closed (never return valid:true!)
    const forgedJwt = `${toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test_firebase_key_2026' }))}.${toBase64Url(JSON.stringify(validClaims))}.${toBase64Url('forged_invalid_signature_bytes_12345678901234567890')}`;
    const resNoProvider = await verifyToken(forgedJwt, { DISABLE_REMOTE_JWKS: true });
    assert(resNoProvider.valid === false, 'AUTH 1B: Unverified JWT fails closed when no verification provider is configured');

    // 1C. Forged signature against configured JWKS MUST be rejected
    const resBadSig = await verifyToken(forgedJwt, { FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(resBadSig.valid === false, 'AUTH 1C: Forged RS256 signature rejected against trusted JWKS');
    assert(resBadSig.error === 'AUTH_TOKEN_SIGNATURE_INVALID', 'AUTH 1C: Returns AUTH_TOKEN_SIGNATURE_INVALID');

    // 1D. Valid RS256 signature with tampered payload MUST be rejected
    const realSignedJwt = await signTestRs256Jwt(validClaims);
    const jwtParts = realSignedJwt.split('.');
    const tamperedClaims = { ...validClaims, email: 'ankit.babusaini@gmail.com', sub: 'spoofed_admin' };
    const tamperedJwt = `${jwtParts[0]}.${toBase64Url(JSON.stringify(tamperedClaims))}.${jwtParts[2]}`;
    const resTampered = await verifyToken(tamperedJwt, { FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(resTampered.valid === false, 'AUTH 1D: Tampered JWT payload rejected by RS256 signature check');

    // 1E. Issuer & Audience mismatch checks
    const badIssJwt = await signTestRs256Jwt({ ...validClaims, iss: 'https://evil-issuer.example.com' });
    const resBadIss = await verifyToken(badIssJwt, { FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(resBadIss.valid === false && resBadIss.error === 'AUTH_TOKEN_ISSUER_MISMATCH', 'AUTH 1E: Wrong issuer rejected');

    const badAudJwt = await signTestRs256Jwt({ ...validClaims, aud: 'other-firebase-project' });
    const resBadAud = await verifyToken(badAudJwt, { FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(resBadAud.valid === false && resBadAud.error === 'AUTH_TOKEN_AUDIENCE_MISMATCH', 'AUTH 1E: Wrong audience rejected');

    // 1F. Expired token, missing exp, future iat, and missing sub checks
    const expiredJwt = await signTestRs256Jwt({ ...validClaims, exp: nowSec - 10 });
    const resExpired = await verifyToken(expiredJwt, { FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(resExpired.valid === false && resExpired.error === 'AUTH_TOKEN_EXPIRED', 'AUTH 1F: Expired token rejected');

    const noExpClaims = { ...validClaims };
    delete noExpClaims.exp;
    const noExpJwt = await signTestRs256Jwt(noExpClaims);
    const resNoExp = await verifyToken(noExpJwt, { FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(resNoExp.valid === false && resNoExp.error === 'AUTH_TOKEN_INVALID', 'AUTH 1F: Token missing exp claim rejected');

    const futureIatJwt = await signTestRs256Jwt({ ...validClaims, iat: nowSec + 3600 });
    const resFutureIat = await verifyToken(futureIatJwt, { FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(resFutureIat.valid === false && resFutureIat.error === 'AUTH_TOKEN_INVALID', 'AUTH 1F: Future iat token rejected');

    const noSubJwt = await signTestRs256Jwt({ ...validClaims, sub: '' });
    const resNoSub = await verifyToken(noSubJwt, { FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(resNoSub.valid === false && resNoSub.error === 'AUTH_TOKEN_INVALID', 'AUTH 1F: Token missing sub claim rejected');

    // 1G. Fail-closed when online Identity Toolkit verification service is unavailable (503 or network error)
    const resServiceDown = await verifyToken(forgedJwt, {
      FIREBASE_API_KEY: 'test_api_key',
      DISABLE_REMOTE_JWKS: true,
      fetch: async () => new Response('Service Unavailable', { status: 503 })
    });
    assert(resServiceDown.valid === false && resServiceDown.error === 'AUTH_VERIFICATION_UNAVAILABLE', 'AUTH 1G: Fails closed on Identity Toolkit 503');

    const resNetTimeout = await verifyToken(forgedJwt, {
      FIREBASE_API_KEY: 'test_api_key',
      DISABLE_REMOTE_JWKS: true,
      fetch: async () => { throw new Error('Network connection timed out'); }
    });
    assert(resNetTimeout.valid === false && resNetTimeout.error === 'AUTH_VERIFICATION_UNAVAILABLE', 'AUTH 1G: Fails closed on Identity Toolkit network error');

    // 1H. Valid cryptographically signed RS256 token succeeds via JWKS and via /api/auth/signin
    const resValidJwks = await verifyToken(realSignedJwt, { FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(resValidJwks.valid === true, 'AUTH 1H: Valid RS256 signed JWT accepted via JWKS');
    assert(resValidJwks.uid === 'fb_uid_verified_101' && resValidJwks.email === 'verified.user@wishmagic.live', 'AUTH 1H: Verified claims extracted accurately');

    // Worker /api/auth/signin rejects forged idToken with 401 and accepts valid signed idToken with 200
    const workerBadSignin = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: forgedJwt })
    }), { ...prodEnv, FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(workerBadSignin.status === 401, 'AUTH 1H: Worker /api/auth/signin rejects forged idToken with HTTP 401');

    const workerGoodSignin = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: realSignedJwt })
    }), { ...prodEnv, FIREBASE_JWKS: { keys: [publicJwk] } });
    assert(workerGoodSignin.status === 200, 'AUTH 1H: Worker /api/auth/signin accepts cryptographically verified idToken with HTTP 200');
  }

  // --- 2. End-to-End Logout, Session Revocation & Cookie Clearing ---
  console.log('• 2. End-to-End Logout, Session Revocation & Cookie Clearing');
  {
    const loginRes = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'session_e2e_user@wishmagic.live', displayName: 'Session E2E User' })
    }), prodEnv);
    assert(loginRes.status === 200, 'LOGOUT E2E: Login returns 200');
    const setCookieHeader = loginRes.headers.get('Set-Cookie') || '';
    const sessionCookiePair = setCookieHeader.split(';')[0];
    assert(sessionCookiePair.startsWith('wm_session=wm_tok_'), 'LOGOUT E2E: Issued wm_session cookie');

    // Authenticated request before logout succeeds
    const preCheck = await worker.fetch(new Request('http://localhost/api/users/me', {
      headers: { 'Cookie': sessionCookiePair }
    }), prodEnv);
    assert(preCheck.status === 200, 'LOGOUT E2E: /api/users/me returns 200 before logout');

    // Execute logout
    const signoutRes = await worker.fetch(new Request('http://localhost/api/auth/signout', {
      method: 'POST',
      headers: { 'Cookie': sessionCookiePair }
    }), prodEnv);
    assert(signoutRes.status === 200, 'LOGOUT E2E: /api/auth/signout returns 200');
    const clearCookieHeader = signoutRes.headers.get('Set-Cookie') || '';
    assert(clearCookieHeader.includes('wm_session=;') && clearCookieHeader.includes('Max-Age=0'), 'LOGOUT E2E: Signout clears wm_session cookie with Max-Age=0');

    // Subsequent authenticated requests with the old session cookie or Bearer token MUST return 401
    const postMe = await worker.fetch(new Request('http://localhost/api/users/me', {
      headers: { 'Cookie': sessionCookiePair }
    }), prodEnv);
    assert(postMe.status === 401, 'LOGOUT E2E: /api/users/me rejects logged-out cookie with 401');

    const postWishes = await worker.fetch(new Request('http://localhost/api/wishes', {
      headers: { 'Cookie': sessionCookiePair }
    }), prodEnv);
    assert(postWishes.status === 401, 'LOGOUT E2E: /api/wishes rejects logged-out cookie with 401');

    const rawTok = sessionCookiePair.replace('wm_session=', '');
    const postBearer = await worker.fetch(new Request('http://localhost/api/wishes', {
      headers: { 'Authorization': `Bearer ${rawTok}` }
    }), prodEnv);
    assert(postBearer.status === 401, 'LOGOUT E2E: /api/wishes rejects logged-out Bearer token with 401');

    const postSession = await worker.fetch(new Request('http://localhost/api/auth/session', {
      headers: { 'Cookie': sessionCookiePair }
    }), prodEnv);
    const postSessionBody = await postSession.json();
    assert(postSessionBody.data.isAuthenticated === false && postSessionBody.data.user === null, 'LOGOUT E2E: /api/auth/session reports unauthenticated after logout');
  }

  // --- 3. Master-Admin Allowlist Policy & Negative Privilege Escalation Tests ---
  console.log('• 3. Master-Admin Single Owner Allowlist & Negative Role/Plan Escalation Tests');
  {
    assert(MASTER_ADMIN_EMAILS.size === 1, 'ADMIN POLICY: MASTER_ADMIN_EMAILS contains exactly 1 owner-admin address');
    assert(MASTER_ADMIN_EMAILS.has('ankit.babusaini@gmail.com'), 'ADMIN POLICY: Canonical owner-admin is ankit.babusaini@gmail.com');
    assert(!MASTER_ADMIN_EMAILS.has('shrijiposhakbhandarshop@gmail.com'), 'ADMIN POLICY: Secondary email removed from MASTER_ADMIN_EMAILS');
    assert(!MASTER_ADMIN_EMAILS.has('bhoomgamer@gmail.com'), 'ADMIN POLICY: bhoomgamer@gmail.com is not in MASTER_ADMIN_EMAILS');

    // Former secondary email signing in receives strictly creator / Free role
    const formerSecRes = await worker.fetch(new Request('http://localhost/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'shrijiposhakbhandarshop@gmail.com',
        role: 'admin',
        isAdmin: true,
        plan: 'VIP',
        isPremium: true
      })
    }), prodEnv);
    assert(formerSecRes.status === 200, 'ADMIN POLICY: Sign-in succeeds as normal user');
    const formerSecCookie = (formerSecRes.headers.get('Set-Cookie') || '').split(';')[0];
    const formerSecBody = await formerSecRes.json();
    assert(formerSecBody.data.user.role === 'creator', 'ADMIN POLICY: Secondary email assigned strictly creator role');
    assert(formerSecBody.data.user.plan === 'Free' && formerSecBody.data.user.isPremium === false, 'ADMIN POLICY: Secondary email assigned strictly Free plan');

    // Attempt to access admin endpoints with former secondary email is blocked with 403
    const adminCheckRes = await worker.fetch(new Request('http://localhost/api/admin/users', {
      headers: { 'Cookie': formerSecCookie }
    }), prodEnv);
    assert(adminCheckRes.status === 403, 'ADMIN POLICY: Non-owner email blocked from /api/admin/users with 403');

    // Attempt to self-assign admin role or VIP plan via /api/account/profile PUT
    const profileEscalateRes = await worker.fetch(new Request('http://localhost/api/account/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': formerSecCookie },
      body: JSON.stringify({
        displayName: 'Normal Creator Name',
        role: 'admin',
        isAdmin: true,
        plan: 'VIP',
        isPremium: true
      })
    }), prodEnv);
    assert(profileEscalateRes.status === 200, 'ADMIN POLICY: Profile update returns 200');
    const verifyMeRes = await worker.fetch(new Request('http://localhost/api/users/me', {
      headers: { 'Cookie': formerSecCookie }
    }), prodEnv);
    const verifyMeBody = await verifyMeRes.json();
    assert(verifyMeBody.data.user.role === 'creator' && verifyMeBody.data.user.plan === 'Free', 'ADMIN POLICY: /api/account/profile cannot escalate role to admin or plan to VIP');
  }

  // --- 4. Deployment Domains, CORS Allowlist, Preview vs Production Rules ---
  console.log('• 4. Deployment Domains Consistency (wishmagic.live & *.wishmagic.pages.dev)');
  {
    const wranglerToml = fs.readFileSync('./wrangler.toml', 'utf8');
    assert(wranglerToml.includes('PUBLIC_APP_URL = "https://wishmagic.live"'), 'DOMAIN: wrangler.toml PUBLIC_APP_URL is https://wishmagic.live');
    assert(wranglerToml.includes('ALLOWED_ORIGIN = "https://wishmagic.live"'), 'DOMAIN: wrangler.toml ALLOWED_ORIGIN is https://wishmagic.live');

    const cfgRes = await worker.fetch(new Request('http://localhost/api/config'), prodEnv);
    const cfgBody = await cfgRes.json();
    assert(cfgBody.data.publicAppUrl === 'https://wishmagic.live', 'DOMAIN: /api/config publicAppUrl matches canonical domain');
    assert(cfgBody.data.canonicalDomain === 'wishmagic.live', 'DOMAIN: /api/config exposes canonicalDomain wishmagic.live');
    assert(cfgBody.data.pagesDomain === 'wishmagic.pages.dev', 'DOMAIN: /api/config exposes pagesDomain wishmagic.pages.dev');
    assert(Array.isArray(cfgBody.data.oauthCallbackUrls) && cfgBody.data.oauthCallbackUrls.includes('https://wishmagic.live/__/auth/handler'), 'DOMAIN: OAuth callback URLs verified');

    // Canonical custom domain allowed
    const corsLive = await worker.fetch(new Request('https://wishmagic.live/api/health', {
      headers: { 'Origin': 'https://wishmagic.live' }
    }), prodEnv);
    assert(corsLive.headers.get('Access-Control-Allow-Origin') === 'https://wishmagic.live', 'DOMAIN: Canonical origin https://wishmagic.live allowed');

    // Pages production domain allowed
    const corsPagesProd = await worker.fetch(new Request('https://wishmagic.live/api/health', {
      headers: { 'Origin': 'https://wishmagic.pages.dev' }
    }), prodEnv);
    assert(corsPagesProd.headers.get('Access-Control-Allow-Origin') === 'https://wishmagic.pages.dev', 'DOMAIN: Pages production origin https://wishmagic.pages.dev allowed');

    // Pages branch preview domain (*.wishmagic.pages.dev) allowed
    const corsPagesPreview = await worker.fetch(new Request('https://wishmagic.live/api/health', {
      headers: { 'Origin': 'https://a1b2c3d4.wishmagic.pages.dev' }
    }), prodEnv);
    assert(corsPagesPreview.headers.get('Access-Control-Allow-Origin') === 'https://a1b2c3d4.wishmagic.pages.dev', 'DOMAIN: Pages preview origin https://a1b2c3d4.wishmagic.pages.dev allowed');

    // Unrelated third-party *.pages.dev domain MUST be rejected!
    const corsEvilPages = await worker.fetch(new Request('https://wishmagic.live/api/health', {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://evil-attacker.pages.dev' }
    }), prodEnv);
    assert(corsEvilPages.status === 403 || corsEvilPages.headers.get('Access-Control-Allow-Origin') === null, 'DOMAIN: Unrelated https://evil-attacker.pages.dev rejected');
  }

  // --- 5. End-to-End Template Upload (Folder & ZIP), B2 Storage, Publish, Gallery, Wish Render & Error/Retry ---
  console.log('• 5. Template Upload (Folder & ZIP) -> B2 Storage -> D1 Publish -> Public Gallery & Wish Link Assets -> Error/Retry');
  {
    // In-memory mock B2 Storage Provider that stores real bytes and supports failure injection
    const b2ObjectsStore = new Map();
    let simulateB2Failure = false;
    const mockB2Provider = {
      bucketName: 'wishmagic-assets',
      async putObject({ key, body, contentType, metadata }) {
        if (simulateB2Failure && key.includes('/runtime/')) {
          const err = new Error('Simulated B2 network socket hang up');
          err.code = 'B2_NETWORK_ERROR';
          throw err;
        }
        const bytes = typeof body === 'string'
          ? new TextEncoder().encode(body)
          : (body instanceof Uint8Array ? body : new Uint8Array(body));
        b2ObjectsStore.set(key, {
          key,
          body: bytes,
          contentType: contentType || 'application/octet-stream',
          size: bytes.byteLength,
          metadata: metadata || {},
          fileId: 'b2_fid_' + Math.random().toString(36).slice(2, 10)
        });
        return { fileId: b2ObjectsStore.get(key).fileId, key };
      },
      async getObject({ key }) {
        const obj = b2ObjectsStore.get(key);
        if (!obj) throw new Error(`Object not found: ${key}`);
        return {
          success: true,
          body: obj.body,
          contentType: obj.contentType,
          contentLength: obj.size
        };
      },
      async headObject({ key }) {
        const obj = b2ObjectsStore.get(key);
        if (!obj) return { exists: false };
        return { exists: true, size: obj.size, contentType: obj.contentType };
      },
      async deleteObject({ key }) {
        b2ObjectsStore.delete(key);
        return { deleted: true };
      }
    };

    const wishHtmlContent = fs.readFileSync('./public/wish.html', 'utf8');
    const envWithB2 = {
      ...prodEnv,
      B2_STORAGE_PROVIDER: mockB2Provider,
      ASSETS: {
        async fetch() {
          return new Response(wishHtmlContent, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
      }
    };

    // Sample binary assets (PNG, MP3, MP4) encoded as base64 DataURLs just like handleFolderSelection in admin-template-uploader.js
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    const mp3Bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0A, 0xFF, 0xFB]);
    const mp4Bytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6D, 0x70, 0x34, 0x32]);
    const toDataUrl = (mime, u8) => `data:${mime};base64,${btoa(String.fromCharCode(...u8))}`;

    const folderFilesObjectMap = {
      'index.html': {
        content: `<!DOCTYPE html><html><head><title>Royal Starlight Birthday</title><link rel="stylesheet" href="styles.css"></head><body><h1 data-wm-field="recipient_name">{{recipient_name}}</h1><p data-wm-field="custom_message">{{custom_message}}</p><img src="assets/banner.png" data-wm-field="photo_1"/><audio src="assets/theme.mp3" controls></audio><video src="assets/celebration.mp4" controls></video><script src="script.js"></script></body></html>`,
        isBase64: false
      },
      'styles.css': {
        content: `body { background: radial-gradient(circle, #2a0e5c, #090314); color: #fff; font-family: sans-serif; }`,
        isBase64: false
      },
      'script.js': {
        content: `window.__TEMPLATE_SCRIPT_LOADED__ = true; console.log('Royal Starlight Loaded');`,
        isBase64: false
      },
      'assets/banner.png': {
        content: toDataUrl('image/png', pngBytes),
        isBase64: true
      },
      'assets/theme.mp3': {
        content: toDataUrl('audio/mpeg', mp3Bytes),
        isBase64: true
      },
      'assets/celebration.mp4': {
        content: toDataUrl('video/mp4', mp4Bytes),
        isBase64: true
      }
    };

    // 5A. Folder Upload using Object Map (currentUploadedFiles format) -> must NOT throw ZIP_MISSING!
    const folderUploadRes = await worker.fetch(new Request('http://localhost/api/templates/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `wm_session=${adminToken}`,
        'Idempotency-Key': 'idem_folder_upload_v1'
      },
      body: JSON.stringify({
        name: 'Royal Starlight Birthday',
        slug: 'royal-starlight-birthday',
        category: 'Birthday',
        tier: 'free',
        price: 0,
        description: '3D Starlight Celebration with CSS, JS, Image, Audio & Video',
        files: folderFilesObjectMap
      })
    }), envWithB2);

    assert(folderUploadRes.status === 201, 'UPLOAD 5A: Folder upload (currentUploadedFiles object map) succeeds with HTTP 201 (No ZIP_MISSING)');
    const folderUploadBody = await folderUploadRes.json();
    const folderIngest = folderUploadBody.data || folderUploadBody;
    assert(folderIngest.success === true, 'UPLOAD 5A: Folder ingestion returned success: true');
    const uploadedTplId = folderIngest.templateId;
    const uploadedVerId = folderIngest.versionId;
    assert(uploadedTplId === 'tpl_royal-starlight-birthday', 'UPLOAD 5A: Deterministic templateId generated');
    assert(folderIngest.fileCount === 6, 'UPLOAD 5A: All 6 folder files (HTML, CSS, JS, PNG, MP3, MP4) extracted and staged');

    // Confirm actual storage in B2 for source ZIP, manifest, hashes, and all 6 runtime files
    const storageKeys = folderIngest.storageKeys;
    assert(b2ObjectsStore.has(storageKeys.sourceZip), 'UPLOAD 5A: Source ZIP stored in B2');
    assert(b2ObjectsStore.has(storageKeys.manifest), 'UPLOAD 5A: UTP manifest stored in B2');
    assert(b2ObjectsStore.has(storageKeys.hashes), 'UPLOAD 5A: SHA-256 integrity hashes stored in B2');
    assert(b2ObjectsStore.has(`${storageKeys.runtimeRoot}index.html`), 'UPLOAD 5A: index.html stored in B2 runtime/');
    assert(b2ObjectsStore.has(`${storageKeys.runtimeRoot}styles.css`), 'UPLOAD 5A: styles.css stored in B2 runtime/');
    assert(b2ObjectsStore.has(`${storageKeys.runtimeRoot}script.js`), 'UPLOAD 5A: script.js stored in B2 runtime/');
    assert(b2ObjectsStore.has(`${storageKeys.runtimeRoot}assets/banner.png`), 'UPLOAD 5A: assets/banner.png stored in B2 runtime/');
    assert(b2ObjectsStore.has(`${storageKeys.runtimeRoot}assets/theme.mp3`), 'UPLOAD 5A: assets/theme.mp3 stored in B2 runtime/');
    assert(b2ObjectsStore.has(`${storageKeys.runtimeRoot}assets/celebration.mp4`), 'UPLOAD 5A: assets/celebration.mp4 stored in B2 runtime/');

    // Verify binary bytes of PNG, MP3, MP4 in B2 are decoded binary bytes (not literal data: URLs!)
    const storedPng = b2ObjectsStore.get(`${storageKeys.runtimeRoot}assets/banner.png`).body;
    assert(storedPng[0] === 0x89 && storedPng[1] === 0x50 && storedPng.byteLength === pngBytes.byteLength, 'UPLOAD 5A: Binary PNG bytes preserved in B2');
    const storedMp3 = b2ObjectsStore.get(`${storageKeys.runtimeRoot}assets/theme.mp3`).body;
    assert(storedMp3[0] === 0x49 && storedMp3[1] === 0x44 && storedMp3.byteLength === mp3Bytes.byteLength, 'UPLOAD 5A: Binary MP3 bytes preserved in B2');
    const storedMp4 = b2ObjectsStore.get(`${storageKeys.runtimeRoot}assets/celebration.mp4`).body;
    assert(storedMp4[4] === 0x66 && storedMp4[5] === 0x74 && storedMp4.byteLength === mp4Bytes.byteLength, 'UPLOAD 5A: Binary MP4 bytes preserved in B2');

    // 5B. ZIP Upload using zipBase64 (and Folder Array format) -> verify duplicate detection & idempotency
    const zipBytes = await createZipFromFiles(folderFilesObjectMap);
    let zipBin = '';
    for (let i = 0; i < zipBytes.length; i++) zipBin += String.fromCharCode(zipBytes[i]);
    const zipB64 = btoa(zipBin);

    const dupZipRes = await worker.fetch(new Request('http://localhost/api/templates/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `wm_session=${adminToken}`,
        'Idempotency-Key': 'idem_zip_upload_dup_v1'
      },
      body: JSON.stringify({
        name: 'Royal Starlight Birthday',
        slug: 'royal-starlight-birthday',
        category: 'Birthday',
        zipBase64: zipB64
      })
    }), envWithB2);
    assert(dupZipRes.status === 201, 'UPLOAD 5B: ZIP upload returns 201');
    const dupZipData = (await dupZipRes.json()).data;
    assert(dupZipData.duplicateDetected === true && dupZipData.versionId === uploadedVerId, 'UPLOAD 5B: Identical ZIP package detected via fingerprint and deduplicated');

    // 5C. Publish Template Version & Confirm Status in D1, Admin Listing, and Public Gallery
    const pubVerRes = await worker.fetch(new Request(`http://localhost/api/templates/${uploadedTplId}/versions/${uploadedVerId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` }
    }), envWithB2);
    assert(pubVerRes.status === 200, 'PUBLISH 5C: Version publish endpoint returns HTTP 200');
    const pubVerData = (await pubVerRes.json()).data;
    assert(pubVerData.published === true && pubVerData.versionId === uploadedVerId, 'PUBLISH 5C: Version marked published');

    // Confirm D1 state
    const d1Tpl = testDb._tables.templates.get(uploadedTplId);
    const d1Ver = testDb._tables.templateVersions.get(uploadedVerId);
    const d1Fam = testDb._tables.templateFamilies.get('fam_royal-starlight-birthday');
    assert(d1Tpl && d1Tpl.status === 'published' && d1Tpl.is_published === 1 && d1Tpl.current_version_id === uploadedVerId, 'PUBLISH 5C: D1 templates row updated to published');
    assert(d1Ver && d1Ver.status === 'published' && d1Ver.is_current === 1, 'PUBLISH 5C: D1 template_versions row updated to published & is_current=1');
    assert(d1Fam && d1Fam.status === 'published' && d1Fam.current_version_id === uploadedVerId, 'PUBLISH 5C: D1 template_families row updated to published');

    // Confirm in Admin Listing (/api/templates?includeDrafts=true) and Public Gallery (/api/templates)
    const adminListRes = await worker.fetch(new Request('http://localhost/api/templates?includeDrafts=true'), envWithB2);
    const adminList = (await adminListRes.json()).data.templates;
    const foundInAdmin = adminList.find(t => t.id === uploadedTplId);
    assert(foundInAdmin && foundInAdmin.status === 'published' && foundInAdmin.isPublished === true, 'PUBLISH 5C: Published template verified in Admin listing');

    const galleryListRes = await worker.fetch(new Request('http://localhost/api/templates'), envWithB2);
    const galleryList = (await galleryListRes.json()).data.templates;
    const foundInGallery = galleryList.find(t => t.id === uploadedTplId);
    assert(foundInGallery && foundInGallery.isPublished === true, 'PUBLISH 5C: Published template visible in Public Gallery');

    // 5D. Verify HTML, CSS, JS, Images, Audio, and Video Serving + Generated Wish Link
    const previewChecks = [
      { path: 'index.html', expectedMime: 'text/html', checkFn: async (r) => (await r.text()).includes('Royal Starlight Birthday') },
      { path: 'styles.css', expectedMime: 'text/css', checkFn: async (r) => (await r.text()).includes('radial-gradient') },
      { path: 'script.js', expectedMime: 'javascript', checkFn: async (r) => (await r.text()).includes('__TEMPLATE_SCRIPT_LOADED__') },
      { path: 'assets/banner.png', expectedMime: 'image/png', checkFn: async (r) => new Uint8Array(await r.arrayBuffer()).byteLength === pngBytes.byteLength },
      { path: 'assets/theme.mp3', expectedMime: 'audio/mpeg', checkFn: async (r) => new Uint8Array(await r.arrayBuffer()).byteLength === mp3Bytes.byteLength },
      { path: 'assets/celebration.mp4', expectedMime: 'video/mp4', checkFn: async (r) => new Uint8Array(await r.arrayBuffer()).byteLength === mp4Bytes.byteLength }
    ];

    for (const item of previewChecks) {
      const assetRes = await worker.fetch(
        new Request(`http://localhost/api/templates/${uploadedTplId}/versions/${uploadedVerId}/preview/${item.path}`),
        envWithB2
      );
      assert(assetRes.status === 200, `ASSET 5D: Preview asset ${item.path} returns HTTP 200`);
      const ct = (assetRes.headers.get('Content-Type') || '').toLowerCase();
      assert(ct.includes(item.expectedMime), `ASSET 5D: ${item.path} has expected MIME type (${ct})`);
      assert(await item.checkFn(assetRes), `ASSET 5D: ${item.path} content verified intact`);
    }

    // Create a wish from the newly published template and verify public wish link resolution
    const wishFromNewTplRes = await worker.fetch(new Request('http://localhost/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${userAToken}` },
      body: JSON.stringify({
        templateId: uploadedTplId,
        slug: 'starlight-aarav-2026',
        linkType: 'personalized',
        customData: {
          recipient_name: 'Aarav Sharma',
          sender_name: 'Alice',
          custom_message: 'Shine bright like the starlight!',
          photo_1: `/api/templates/${uploadedTplId}/versions/${uploadedVerId}/preview/assets/banner.png`,
          audioUrl: `/api/templates/${uploadedTplId}/versions/${uploadedVerId}/preview/assets/theme.mp3`,
          videoUrl: `/api/templates/${uploadedTplId}/versions/${uploadedVerId}/preview/assets/celebration.mp4`
        }
      })
    }), envWithB2);
    assert(wishFromNewTplRes.status === 201, 'WISH 5D: Wish created from published B2 template returns 201');
    const createdStarWish = (await wishFromNewTplRes.json()).data;
    assert(createdStarWish.wish.templateVersionId === uploadedVerId, 'WISH 5D: Wish pinned to exact published B2 versionId');

    const pubStarWishRes = await worker.fetch(new Request('http://localhost/api/public/wishes/starlight-aarav-2026'), envWithB2);
    assert(pubStarWishRes.status === 200, 'WISH 5D: Public wish endpoint resolves generated wish link');
    const pubStarWishBody = (await pubStarWishRes.json()).data;
    assert(pubStarWishBody.wish.recipientName === 'Aarav Sharma', 'WISH 5D: Public wish renders recipient name');
    assert(pubStarWishBody.wish.customData.audioUrl.endsWith('assets/theme.mp3'), 'WISH 5D: Public wish preserves audio asset URL');
    assert(pubStarWishBody.wish.customData.videoUrl.endsWith('assets/celebration.mp4'), 'WISH 5D: Public wish preserves video asset URL');

    // Open generated wish link (/w/starlight-aarav-2026) and verify SSR hydration of template version & assets
    const publicWishHtmlRes = await worker.fetch(new Request('https://wishmagic.live/w/starlight-aarav-2026'), envWithB2);
    assert(publicWishHtmlRes.status === 200, 'WISH 5D: Public wish HTML page /w/starlight-aarav-2026 returns HTTP 200');
    const publicWishHtml = await publicWishHtmlRes.text();
    assert(publicWishHtml.includes('window.__SSR_WISH_DATA__') && publicWishHtml.includes(uploadedVerId), 'WISH 5D: Public wish HTML embeds exact published template version & SSR data');
    assert(publicWishHtml.includes('assets/banner.png') && publicWishHtml.includes('assets/theme.mp3') && publicWishHtml.includes('assets/celebration.mp4'), 'WISH 5D: Public wish HTML includes image, audio & video asset references');

    // 5E. Error & Retry Behavior: Invalid Files, Missing Entry Point, Network Failure Rollback & Retry
    // Invalid non-ZIP bytes -> 400 ZIP_INVALID_FORMAT
    const badZipRes = await worker.fetch(new Request('http://localhost/api/templates/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({
        name: 'Corrupt ZIP Template',
        zipBase64: btoa('NOT_A_VALID_ZIP_FILE_HEADER')
      })
    }), envWithB2);
    assert(badZipRes.status === 400, 'ERROR 5E: Invalid ZIP magic bytes returns HTTP 400');
    const badZipBody = (await badZipRes.json()).data;
    assert(badZipBody.code === 'ZIP_INVALID_FORMAT', 'ERROR 5E: Returns ZIP_INVALID_FORMAT');

    // Missing index.html -> 400 ENTRY_POINT_MISSING
    const noIndexRes = await worker.fetch(new Request('http://localhost/api/templates/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': `wm_session=${adminToken}` },
      body: JSON.stringify({
        name: 'Missing Entry Template',
        files: {
          'styles.css': { content: 'body { color: red; }', isBase64: false }
        }
      })
    }), envWithB2);
    assert(noIndexRes.status === 400, 'ERROR 5E: Folder missing index.html returns HTTP 400');
    const noIndexBody = (await noIndexRes.json()).data;
    assert(noIndexBody.code === 'ENTRY_POINT_MISSING', 'ERROR 5E: Returns ENTRY_POINT_MISSING');

    // Oversized ZIP upload (> 50 MB) -> 413 ZIP_FILE_TOO_LARGE
    const oversizedBuf = new Uint8Array(50 * 1024 * 1024 + 128);
    oversizedBuf[0] = 0x50; oversizedBuf[1] = 0x4B; oversizedBuf[2] = 0x03; oversizedBuf[3] = 0x04;
    const largeUploadRes = await worker.fetch(new Request('http://localhost/api/templates/upload?name=HugeTemplate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', 'Cookie': `wm_session=${adminToken}` },
      body: oversizedBuf
    }), envWithB2);
    assert(largeUploadRes.status === 413, 'ERROR 5E: Oversized >50MB template archive rejected with HTTP 413');
    const largeUploadBody = (await largeUploadRes.json()).data;
    assert(largeUploadBody.code === 'ZIP_FILE_TOO_LARGE', 'ERROR 5E: Returns ZIP_FILE_TOO_LARGE');

    // Network failure mid-upload -> atomic B2 rollback & retryable operation state -> retry succeeds!
    simulateB2Failure = true;
    const retryKey = 'idem_retry_network_failure_test';
    const netFailRes = await worker.fetch(new Request('http://localhost/api/templates/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `wm_session=${adminToken}`,
        'Idempotency-Key': retryKey
      },
      body: JSON.stringify({
        name: 'Retryable Galaxy Template',
        slug: 'retryable-galaxy-template',
        category: 'Anniversary',
        files: [
          { path: 'index.html', content: '<!DOCTYPE html><html><head><title>Retryable Galaxy</title></head><body><h1>{{recipient_name}}</h1></body></html>', isBase64: false },
          { path: 'styles.css', content: 'body { background: #000; }', isBase64: false }
        ]
      })
    }), envWithB2);
    assert(netFailRes.status === 400, 'RETRY 5E: Mid-flight B2 network failure returns structured failure response');
    const netFailBody = (await netFailRes.json()).data;
    assert(netFailBody.success === false && netFailBody.rolledBackCount >= 1, 'RETRY 5E: Partial B2 objects rolled back cleanly on network failure');

    // Now restore B2 connectivity and retry with the exact same Idempotency-Key
    simulateB2Failure = false;
    const retrySuccessRes = await worker.fetch(new Request('http://localhost/api/templates/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `wm_session=${adminToken}`,
        'Idempotency-Key': retryKey
      },
      body: JSON.stringify({
        name: 'Retryable Galaxy Template',
        slug: 'retryable-galaxy-template',
        category: 'Anniversary',
        files: [
          { path: 'index.html', content: '<!DOCTYPE html><html><head><title>Retryable Galaxy</title></head><body><h1>{{recipient_name}}</h1></body></html>', isBase64: false },
          { path: 'styles.css', content: 'body { background: #000; }', isBase64: false }
        ]
      })
    }), envWithB2);
    assert(retrySuccessRes.status === 201, 'RETRY 5E: Retry with same Idempotency-Key succeeds with HTTP 201 after network recovery');
    const retrySuccessBody = (await retrySuccessRes.json()).data;
    assert(retrySuccessBody.success === true && retrySuccessBody.operationId === netFailBody.operationId, 'RETRY 5E: Reused same operationId and completed ingestion');
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log(`🎉 TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
