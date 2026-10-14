/**
 * Zero-Dependency Pure-JS / Web-Streams ZIP Engine (JSZip-Compatible API)
 * Works natively in Cloudflare Pages Functions, Cloudflare Workers, and Node.js 18+
 * with ZERO external npm packages required.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (typeof input === 'string') return new TextEncoder().encode(input);
  return new Uint8Array(0);
}

async function deflateRaw(bytes) {
  try {
    if (typeof CompressionStream !== 'undefined') {
      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const chunks = [];
      const reader = cs.readable.getReader();
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
      }
      return out;
    }
  } catch (_) {}
  const zlib = await import('node:zlib');
  return new Uint8Array(zlib.deflateRawSync(bytes));
}
async function _unused_deflateRaw(bytes) {
  if (false) {
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    const reader = cs.readable.getReader();
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  }
  const zlib = await import('node:zlib');
  return new Uint8Array(zlib.deflateRawSync(bytes));
}

async function inflateRaw(bytes) {
  try {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const chunks = [];
      const reader = ds.readable.getReader();
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
      }
      return out;
    }
  } catch (_) {}
  const zlib = await import('node:zlib');
  return new Uint8Array(zlib.inflateRawSync(bytes));
}
async function _unused_inflateRaw(bytes) {
  if (false) {
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    const reader = ds.readable.getReader();
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  }
  const zlib = await import('node:zlib');
  return new Uint8Array(zlib.inflateRawSync(bytes));
}

class ZipEntry {
  constructor(name, dir, compressedData, method, compressedSize, uncompressedSize, rawUncompressed = null) {
    this.name = name;
    this.dir = Boolean(dir);
    this._compressedData = compressedData;
    this._method = method;
    this._rawUncompressed = rawUncompressed;
    this._data = {
      compressedSize: compressedSize ?? (compressedData ? compressedData.byteLength : 0),
      uncompressedSize: uncompressedSize ?? (rawUncompressed ? rawUncompressed.byteLength : 0)
    };
  }

  async async(type = 'uint8array') {
    let bytes = this._rawUncompressed;
    if (!bytes) {
      if (this.dir || !this._compressedData || this._compressedData.byteLength === 0) {
        bytes = new Uint8Array(0);
      } else if (this._method === 0) {
        bytes = new Uint8Array(this._compressedData);
      } else if (this._method === 8) {
        bytes = await inflateRaw(this._compressedData);
      } else {
        throw new Error(`Unsupported ZIP compression method: ${this._method}`);
      }
      this._rawUncompressed = bytes;
    }

    const fmt = String(type || 'uint8array').toLowerCase();
    if (fmt === 'uint8array') return bytes;
    if (fmt === 'arraybuffer') return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (fmt === 'nodebuffer' || fmt === 'buffer') {
      return typeof Buffer !== 'undefined' ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes;
    }
    if (fmt === 'string' || fmt === 'text') {
      return new TextDecoder('utf-8').decode(bytes);
    }
    if (fmt === 'base64') {
      if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
      let bin = '';
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
    return bytes;
  }
}

export default class JSZip {
  constructor() {
    this.files = Object.create(null);
  }

  file(name, data, options = {}) {
    if (arguments.length === 1) {
      return this.files[name] || null;
    }
    const cleanName = String(name);
    const parts = cleanName.split('/');
    if (parts.length > 1) {
      let cur = '';
      for (let i = 0; i < parts.length - 1; i++) {
        if (!parts[i] || parts[i] === '..' || parts[i] === '.' || /^[a-zA-Z]:$/.test(parts[i])) break;
        cur += parts[i] + '/';
        if (!this.files[cur]) {
          this.files[cur] = new ZipEntry(cur, true, new Uint8Array(0), 0, 0, 0, new Uint8Array(0));
        }
      }
    }
    const raw = toUint8Array(data);
    const entry = new ZipEntry(cleanName, Boolean(options.dir), null, 8, raw.byteLength, raw.byteLength, raw);
    this.files[cleanName] = entry;
    return this;
  }

  folder(name) {
    const prefix = String(name).replace(/^\/+/, '').replace(/\/+$/, '') + '/';
    if (!this.files[prefix]) {
      this.files[prefix] = new ZipEntry(prefix, true, new Uint8Array(0), 0, 0, 0, new Uint8Array(0));
    }
    const self = this;
    return {
      file(subName, data, opts) {
        return self.file(prefix + String(subName).replace(/^\/+/, ''), data, opts);
      },
      folder(subFolder) {
        return self.folder(prefix + String(subFolder).replace(/^\/+/, ''));
      }
    };
  }

  async generateAsync(options = {}) {
    const type = String(options.type || 'uint8array').toLowerCase();
    const useDeflate = String(options.compression || 'DEFLATE').toUpperCase() === 'DEFLATE';
    const encoder = new TextEncoder();

    const localChunks = [];
    const centralChunks = [];
    let localOffset = 0;
    const names = Object.keys(this.files);

    for (const name of names) {
      const entry = this.files[name];
      const nameBytes = encoder.encode(entry.name);
      const rawBytes = entry.dir ? new Uint8Array(0) : await entry.async('uint8array');
      const crc = entry.dir ? 0 : crc32(rawBytes);

      let compBytes = rawBytes;
      let method = 0;
      if (!entry.dir && useDeflate && rawBytes.byteLength > 0) {
        compBytes = await deflateRaw(rawBytes);
        method = 8;
      }

      // Local file header (30 bytes + name + compBytes)
      const lfh = new Uint8Array(30 + nameBytes.byteLength);
      const ldv = new DataView(lfh.buffer);
      ldv.setUint32(0, 0x04034b50, true); // signature
      ldv.setUint16(4, 20, true);         // version needed
      ldv.setUint16(6, 0x0800, true);     // UTF-8 flag
      ldv.setUint16(8, method, true);     // compression method
      ldv.setUint16(10, 0, true);         // mod time
      ldv.setUint16(12, 0x21, true);      // mod date
      ldv.setUint32(14, crc, true);       // crc32
      ldv.setUint32(18, compBytes.byteLength, true); // compressed size
      ldv.setUint32(22, rawBytes.byteLength, true);  // uncompressed size
      ldv.setUint16(26, nameBytes.byteLength, true); // file name length
      ldv.setUint16(28, 0, true);         // extra field length
      lfh.set(nameBytes, 30);

      localChunks.push(lfh, compBytes);

      // Central directory header (46 bytes + name)
      const cdh = new Uint8Array(46 + nameBytes.byteLength);
      const cdv = new DataView(cdh.buffer);
      cdv.setUint32(0, 0x02014b50, true); // signature
      cdv.setUint16(4, 20, true);         // version made by
      cdv.setUint16(6, 20, true);         // version needed
      cdv.setUint16(8, 0x0800, true);     // UTF-8 flag
      cdv.setUint16(10, method, true);    // method
      cdv.setUint16(12, 0, true);        // mod time
      cdv.setUint16(14, 0x21, true);      // mod date
      cdv.setUint32(16, crc, true);       // crc32
      cdv.setUint32(20, compBytes.byteLength, true); // compressed size
      cdv.setUint32(24, rawBytes.byteLength, true);  // uncompressed size
      cdv.setUint16(28, nameBytes.byteLength, true); // name len
      cdv.setUint16(30, 0, true);         // extra len
      cdv.setUint16(32, 0, true);         // comment len
      cdv.setUint16(34, 0, true);         // disk num
      cdv.setUint16(36, 0, true);         // internal attrs
      cdv.setUint32(38, entry.dir ? 0x10 : 0, true); // external attrs
      cdv.setUint32(42, localOffset, true);          // relative offset
      cdh.set(nameBytes, 46);

      centralChunks.push(cdh);
      localOffset += lfh.byteLength + compBytes.byteLength;
    }

    let centralSize = 0;
    for (const c of centralChunks) centralSize += c.byteLength;

    // End of central directory record (22 bytes)
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, names.length, true);
    edv.setUint16(10, names.length, true);
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, localOffset, true);
    edv.setUint16(20, 0, true);

    const totalSize = localOffset + centralSize + 22;
    const out = new Uint8Array(totalSize);
    let pos = 0;
    for (const c of localChunks) { out.set(c, pos); pos += c.byteLength; }
    for (const c of centralChunks) { out.set(c, pos); pos += c.byteLength; }
    out.set(eocd, pos);

    if (type === 'uint8array') return out;
    if (type === 'arraybuffer') return out.buffer;
    if (type === 'nodebuffer' || type === 'buffer') {
      return typeof Buffer !== 'undefined' ? Buffer.from(out.buffer, out.byteOffset, out.byteLength) : out;
    }
    if (type === 'base64') {
      if (typeof Buffer !== 'undefined') return Buffer.from(out).toString('base64');
      let bin = '';
      for (let i = 0; i < out.byteLength; i++) bin += String.fromCharCode(out[i]);
      return btoa(bin);
    }
    return out;
  }

  static async loadAsync(data) {
    const bytes = toUint8Array(data);
    if (bytes.byteLength < 22) {
      throw new Error('Invalid or truncated ZIP archive');
    }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Find End of Central Directory (0x06054b50) scanning backwards from end
    let eocdOffset = -1;
    const minSearch = Math.max(0, bytes.byteLength - 65557);
    for (let i = bytes.byteLength - 22; i >= minSearch; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) {
      throw new Error('End of central directory record not found (corrupted ZIP)');
    }

    const totalEntries = dv.getUint16(eocdOffset + 10, true);
    const cdSize = dv.getUint32(eocdOffset + 12, true);
    const cdOffset = dv.getUint32(eocdOffset + 16, true);

    if (cdOffset + cdSize > bytes.byteLength) {
      throw new Error('Central directory extends past end of ZIP archive');
    }

    const zip = new JSZip();
    const decoder = new TextDecoder('utf-8');
    let ptr = cdOffset;

    for (let idx = 0; idx < totalEntries; idx++) {
      if (ptr + 46 > bytes.byteLength || dv.getUint32(ptr, true) !== 0x02014b50) {
        throw new Error('Invalid central directory file header signature');
      }
      const method = dv.getUint16(ptr + 10, true);
      const compSize = dv.getUint32(ptr + 20, true);
      const uncompSize = dv.getUint32(ptr + 24, true);
      const nameLen = dv.getUint16(ptr + 28, true);
      const extraLen = dv.getUint16(ptr + 30, true);
      const commentLen = dv.getUint16(ptr + 32, true);
      const extAttr = dv.getUint32(ptr + 38, true);
      const localHeaderOffset = dv.getUint32(ptr + 42, true);

      const nameBytes = bytes.subarray(ptr + 46, ptr + 46 + nameLen);
      const name = decoder.decode(nameBytes);
      const isDir = name.endsWith('/') || ((extAttr & 0x10) !== 0 && uncompSize === 0);

      if (localHeaderOffset + 30 > bytes.byteLength || dv.getUint32(localHeaderOffset, true) !== 0x04034b50) {
        throw new Error(`Invalid local file header for entry: ${name}`);
      }
      const lNameLen = dv.getUint16(localHeaderOffset + 26, true);
      const lExtraLen = dv.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
      const dataEnd = dataStart + compSize;
      if (dataEnd > bytes.byteLength) {
        throw new Error(`Truncated compressed data for entry: ${name}`);
      }

      const compSlice = bytes.subarray(dataStart, dataEnd);
      zip.files[name] = new ZipEntry(name, isDir, compSlice, method, compSize, uncompSize, null);

      ptr += 46 + nameLen + extraLen + commentLen;
    }

    return zip;
  }
}
