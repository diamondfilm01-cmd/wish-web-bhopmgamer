/**
 * WishMagic Storage Abstraction Layer (Part 19)
 * 
 * Provides a clean interface for image and file storage providers:
 * - ImgBB (Images)
 * - Backblaze B2 (Template files, audio)
 * - Cloudflare R2 (Hybrid fallback)
 * 
 * Does NOT perform direct network calls with mocked keys, but normalizes
 * references, metadata, paths, and lifecycle statuses.
 */

export const StorageProvider = {
  IMGBB: 'imgbb',
  B2: 'b2',
  R2: 'r2'
};

export const AssetStatus = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  RETIRED: 'retired',
  DELETED: 'deleted'
};

export class StorageProviderManager {
  constructor(providers = {}) {
    this.providers = {
      [StorageProvider.IMGBB]: {
        name: 'ImgBB',
        type: 'images',
        allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        maxBytes: 32 * 1024 * 1024
      },
      [StorageProvider.B2]: {
        name: 'Backblaze B2',
        type: 'files',
        allowedMime: [
          'text/html',
          'text/css',
          'application/javascript',
          'audio/mpeg',
          'audio/wav',
          'audio/ogg',
          'application/json'
        ],
        maxBytes: 100 * 1024 * 1024
      },
      [StorageProvider.R2]: {
        name: 'Cloudflare R2',
        type: 'hybrid',
        allowedMime: ['*/*'],
        maxBytes: 100 * 1024 * 1024
      },
      ...providers
    };
  }

  getProviderForAsset(assetType, mimeType) {
    if (mimeType && mimeType.startsWith('image/')) {
      return StorageProvider.IMGBB;
    }
    if (mimeType && (mimeType.startsWith('audio/') || mimeType.includes('javascript') || mimeType.includes('html') || mimeType.includes('css'))) {
      return StorageProvider.B2;
    }
    return StorageProvider.R2;
  }

  normalizeAssetMetadata(raw) {
    const mime = raw.mimeType || raw.mime_type || 'application/octet-stream';
    const provider = raw.storageProvider || raw.storage_provider || this.getProviderForAsset(raw.type, mime);
    
    return {
      storageProvider: provider,
      storageKey: raw.storageKey || raw.storage_key || raw.objectKey || raw.object_key || '',
      providerAssetId: raw.providerAssetId || raw.provider_asset_id || null,
      originalUrl: raw.originalUrl || raw.url || '',
      displayUrl: raw.displayUrl || raw.url || '',
      thumbnailUrl: raw.thumbnailUrl || raw.thumbnail_url || null,
      mimeType: mime,
      sizeBytes: Number(raw.sizeBytes || raw.size_bytes || 0),
      status: raw.status || AssetStatus.ACTIVE,
      sha256: raw.sha256 || null
    };
  }

  isSafeToDelete(dependencies = {}) {
    // If referenced by any active wish or immutable template version, deletion is blocked
    const wishCount = dependencies.publishedWishCount || 0;
    const versionCount = dependencies.templateVersionCount || 0;
    
    if (wishCount > 0 || versionCount > 0) {
      return {
        safe: false,
        action: 'archive',
        reason: `Asset is referenced by ${wishCount} published wish(es) and ${versionCount} immutable version(s). It must be archived rather than deleted.`
      };
    }
    return {
      safe: true,
      action: 'delete'
    };
  }
}

export const defaultStorageManager = new StorageProviderManager();

// Part 20: Real B2 Storage Integration
export {
  B2StorageProvider,
  getB2Config,
  buildTemplateStorageKeys,
  computeSha256Hex,
  computeSha1Hex,
  getMimeType
} from './storage-provider.js';

// Part 21: Real ImgBB Image Storage Integration
export {
  ImgBBProvider,
  getImgBBConfig,
  validateImageBuffer,
  parseImageDimensions,
  resolveSlotImage,
  checkImageDeletionSafety,
  IMAGE_LIMITS
} from './imgbb-provider.js';
