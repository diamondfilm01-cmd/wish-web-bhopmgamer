/**
 * WishMagic Advanced Public Link, Sharing, SEO & Social Preview Engine
 * Part 15: Centralized Slug Generation, Web Share API, WhatsApp/Telegram/SMS,
 * Pure QR Code Generator with Download, Social Card Previewer, and Rich Metas
 */

(function(window) {
  'use strict';

  // =========================================================================
  // 1. SLUG & URL NORMALIZATION SERVICE
  // =========================================================================
  const WishSlugService = {
    /**
     * Sanitizes a string into a URL-friendly slug component
     */
    slugify(text) {
      if (!text) return '';
      return String(text)
        .normalize('NFD') // Normalize accented characters
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric chars (emojis, punctuation)
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
    },

    /**
     * Generates a 5-character collision-resistant random alphanumeric suffix
     */
    generateRandomSuffix(length = 5) {
      const chars = '23456789abcdefghjkmnpqrstuvwxyz'; // readable subset (no 0, o, 1, l, i)
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    },

    /**
     * Generates a unique, meaningful and readable slug for a wish
     * Format examples:
     * - "ankit-to-kritika-x7k92"
     * - "happy-birthday-alex-m3q91"
     * - "celebrate-sam-8k2j1"
     */
    generateWishSlug(wishOrCustomData, existingSlugs = []) {
      const data = wishOrCustomData.customData || wishOrCustomData || {};
      const recipient = this.slugify(data.recipient_name || data.recipientName || wishOrCustomData.recipientName || '');
      const sender = this.slugify(data.sender_name || data.senderName || wishOrCustomData.buyerName || wishOrCustomData.senderName || '');
      const occasion = this.slugify(data.occasion || wishOrCustomData.category || 'celebration');

      let baseSlug = '';
      if (sender && recipient) {
        baseSlug = `${sender}-to-${recipient}`;
      } else if (recipient) {
        baseSlug = `${recipient}-${occasion}`;
      } else {
        baseSlug = `magical-${occasion}`;
      }

      // Truncate base slug if too long
      if (baseSlug.length > 35) {
        baseSlug = baseSlug.slice(0, 35).replace(/-+$/, '');
      }

      let slug = '';
      let attempts = 0;
      const existingSet = new Set(existingSlugs.map(s => String(s).toLowerCase()));

      do {
        const suffix = this.generateRandomSuffix(attempts > 5 ? 6 : 5);
        slug = `${baseSlug}-${suffix}`;
        attempts++;
      } while (existingSet.has(slug) && attempts < 20);

      return slug;
    },

    /**
     * Returns full canonical public URL for a given wish or slug
     */
    getPublicUrl(wishOrSlug) {
      const origin = (typeof window !== 'undefined' && window.location && window.location.origin) 
        ? window.location.origin 
        : 'https://wishmagic.live';

      if (typeof wishOrSlug === 'string') {
        const clean = wishOrSlug.replace(/^\/+/, '').replace(/^w\//, '');
        return `${origin}/w/${clean}`;
      }

      const wish = wishOrSlug || {};
      const identifier = wish.slug || wish.id || 'special-celebration';
      return `${origin}/w/${identifier}`;
    }
  };

  // =========================================================================
  // 2. EMBEDDED ISO/IEC 18004 COMPLIANT QR CODE ENGINE (Pure Vector & Canvas)
  // =========================================================================
  /**
   * Ultra-reliable, 100% standard ISO/IEC 18004 QR Code Generator.
   * Encodes URLs into standard spec QR matrix with Reed-Solomon Error Correction (Level M).
   * Compatible with all mobile cameras, Google Lens, iOS Camera, WhatsApp, and QR scanners.
   */
  const WishQRCodeEngine = (function() {
    const QRMode = { NUMBER: 1, ALPHA_NUM: 2, BYTE: 4, KANJI: 8 };
    const QREC = { L: 1, M: 0, Q: 3, H: 2 };
    const QRMask = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6, P7: 7 };

    const QRMath = {
      glog(n) {
        if (n < 1) throw new Error("glog(" + n + ")");
        return QRMath.LOG_TABLE[n];
      },
      gexp(n) {
        while (n < 0) n += 255;
        while (n >= 255) n -= 255;
        return QRMath.EXP_TABLE[n];
      },
      EXP_TABLE: new Array(256),
      LOG_TABLE: new Array(256)
    };

    for (let i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
    for (let i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
    for (let i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

    function QRPolynomial(num, shift) {
      let offset = 0;
      while (offset < num.length && num[offset] === 0) offset++;
      this.num = new Array(num.length - offset + shift);
      for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
      for (let i = num.length - offset; i < this.num.length; i++) this.num[i] = 0;
    }

    QRPolynomial.prototype = {
      get(i) { return this.num[i]; },
      getLength() { return this.num.length; },
      multiply(e) {
        const num = new Array(this.getLength() + e.getLength() - 1).fill(0);
        for (let i = 0; i < this.getLength(); i++) {
          for (let j = 0; j < e.getLength(); j++) {
            num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
          }
        }
        return new QRPolynomial(num, 0);
      },
      mod(e) {
        if (this.getLength() - e.getLength() < 0) return this;
        const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
        const num = new Array(this.getLength());
        for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i);
        for (let i = 0; i < e.getLength(); i++) {
          num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
        }
        return new QRPolynomial(num, 0).mod(e);
      }
    };

    const RS_TABLE = [
      [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
      [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
      [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
      [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
      [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
      [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
      [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
      [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
      [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
      [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
      [4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13],
      [2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15]
    ];

    function QRRSBlock(totalCount, dataCount) {
      this.totalCount = totalCount;
      this.dataCount = dataCount;
    }

    QRRSBlock.getRSBlocks = function(type, ec) {
      const idx = (type - 1) * 4 + (ec === QREC.L ? 0 : ec === QREC.M ? 1 : ec === QREC.Q ? 2 : 3);
      const row = RS_TABLE[idx];
      if (!row) throw new Error("RS table out of range: " + type);
      const list = [];
      for (let i = 0; i < row.length / 3; i++) {
        const count = row[i * 3 + 0];
        const total = row[i * 3 + 1];
        const data = row[i * 3 + 2];
        for (let j = 0; j < count; j++) list.push(new QRRSBlock(total, data));
      }
      return list;
    };

    function QRBitBuffer() {
      this.buffer = [];
      this.length = 0;
    }

    QRBitBuffer.prototype = {
      get(i) {
        return ((this.buffer[Math.floor(i / 8)] >>> (7 - i % 8)) & 1) === 1;
      },
      put(num, len) {
        for (let i = 0; i < len; i++) {
          this.putBit(((num >>> (len - i - 1)) & 1) === 1);
        }
      },
      putBit(bit) {
        const idx = Math.floor(this.length / 8);
        if (this.buffer.length <= idx) this.buffer.push(0);
        if (bit) this.buffer[idx] |= (0x80 >>> (this.length % 8));
        this.length++;
      }
    };

    function QR8BitByte(data) {
      this.mode = QRMode.BYTE;
      this.data = data;
      this.bytes = [];
      for (let i = 0; i < data.length; i++) {
        const c = data.charCodeAt(i);
        if (c > 0x10000) {
          this.bytes.push(0xF0 | ((c & 0x1C0000) >>> 18), 0x80 | ((c & 0x3F000) >>> 12), 0x80 | ((c & 0xFC0) >>> 6), 0x80 | (c & 0x3F));
        } else if (c > 0x800) {
          this.bytes.push(0xE0 | ((c & 0xF000) >>> 12), 0x80 | ((c & 0xFC0) >>> 6), 0x80 | (c & 0x3F));
        } else if (c > 0x80) {
          this.bytes.push(0xC0 | ((c & 0x7C0) >>> 6), 0x80 | (c & 0x3F));
        } else {
          this.bytes.push(c);
        }
      }
    }

    QR8BitByte.prototype = {
      getLength() { return this.bytes.length; },
      write(buf) {
        for (let i = 0; i < this.bytes.length; i++) buf.put(this.bytes[i], 8);
      }
    };

    const QRUtil = {
      PATTERN_POS: [
        [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
        [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58]
      ],
      G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
      G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
      getBCHTypeInfo(data) {
        let d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
          d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15)));
        }
        return ((data << 10) | d) ^ QRUtil.G15_MASK;
      },
      getBCHDigit(data) {
        let digit = 0;
        while (data !== 0) { digit++; data >>>= 1; }
        return digit;
      },
      getPatternPosition(type) {
        return QRUtil.PATTERN_POS[type - 1] || [];
      },
      getMask(p, i, j) {
        switch (p) {
          case QRMask.P0: return (i + j) % 2 === 0;
          case QRMask.P1: return i % 2 === 0;
          case QRMask.P2: return j % 3 === 0;
          case QRMask.P3: return (i + j) % 3 === 0;
          case QRMask.P4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
          case QRMask.P5: return ((i * j) % 2) + ((i * j) % 3) === 0;
          case QRMask.P6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
          case QRMask.P7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
          default: return false;
        }
      },
      getErrorCorrectPolynomial(len) {
        let a = new QRPolynomial([1], 0);
        for (let i = 0; i < len; i++) {
          a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
        }
        return a;
      },
      getLengthInBits(mode, type) {
        if (type < 10) {
          return mode === QRMode.BYTE ? 8 : (mode === QRMode.ALPHA_NUM ? 9 : 10);
        }
        return mode === QRMode.BYTE ? 16 : (mode === QRMode.ALPHA_NUM ? 11 : 12);
      },
      getLostPoint(qr) {
        const mc = qr.getModuleCount();
        let lp = 0;
        for (let r = 0; r < mc; r++) {
          for (let c = 0; c < mc; c++) {
            let sc = 0;
            const dark = qr.isDark(r, c);
            for (let dr = -1; dr <= 1; dr++) {
              if (r + dr < 0 || mc <= r + dr) continue;
              for (let dc = -1; dc <= 1; dc++) {
                if (c + dc < 0 || mc <= c + dc) continue;
                if (dr === 0 && dc === 0) continue;
                if (dark === qr.isDark(r + dr, c + dc)) sc++;
              }
            }
            if (sc > 5) lp += (3 + sc - 5);
          }
        }
        for (let r = 0; r < mc - 1; r++) {
          for (let c = 0; c < mc - 1; c++) {
            let cnt = 0;
            if (qr.isDark(r, c)) cnt++;
            if (qr.isDark(r + 1, c)) cnt++;
            if (qr.isDark(r, c + 1)) cnt++;
            if (qr.isDark(r + 1, c + 1)) cnt++;
            if (cnt === 0 || cnt === 4) lp += 3;
          }
        }
        return lp;
      }
    };

    function QRCodeModel(typeNumber, errorCorrectLevel) {
      this.typeNumber = typeNumber;
      this.errorCorrectLevel = errorCorrectLevel;
      this.modules = null;
      this.moduleCount = 0;
      this.dataCache = null;
      this.dataList = [];
    }

    QRCodeModel.prototype = {
      addData(data) {
        this.dataList.push(new QR8BitByte(data));
        this.dataCache = null;
      },
      isDark(r, c) {
        if (r < 0 || this.moduleCount <= r || c < 0 || this.moduleCount <= c) return false;
        return Boolean(this.modules[r][c]);
      },
      getModuleCount() { return this.moduleCount; },
      make() {
        if (this.typeNumber < 1) {
          let type = 1;
          for (type = 1; type <= 12; type++) {
            const rsBlocks = QRRSBlock.getRSBlocks(type, this.errorCorrectLevel);
            const buffer = new QRBitBuffer();
            let totalDataCount = 0;
            for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
            for (let i = 0; i < this.dataList.length; i++) {
              const data = this.dataList[i];
              buffer.put(data.mode, 4);
              buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, type));
              data.write(buffer);
            }
            if (buffer.length <= totalDataCount * 8) break;
          }
          this.typeNumber = Math.min(type, 12);
        }
        this.makeImpl(false, this.getBestMaskPattern());
      },
      makeImpl(test, maskPattern) {
        this.moduleCount = this.typeNumber * 4 + 17;
        this.modules = new Array(this.moduleCount);
        for (let r = 0; r < this.moduleCount; r++) {
          this.modules[r] = new Array(this.moduleCount).fill(null);
        }
        this.setupPositionProbePattern(0, 0);
        this.setupPositionProbePattern(this.moduleCount - 7, 0);
        this.setupPositionProbePattern(0, this.moduleCount - 7);
        this.setupPositionAdjustPattern();
        this.setupTimingPattern();
        this.setupTypeInfo(test, maskPattern);
        if (this.dataCache == null) {
          this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
        }
        this.mapData(this.dataCache, maskPattern);
      },
      setupPositionProbePattern(row, col) {
        for (let r = -1; r <= 7; r++) {
          if (row + r <= -1 || this.moduleCount <= row + r) continue;
          for (let c = -1; c <= 7; c++) {
            if (col + c <= -1 || this.moduleCount <= col + c) continue;
            if ((0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
              this.modules[row + r][col + c] = true;
            } else {
              this.modules[row + r][col + c] = false;
            }
          }
        }
      },
      getBestMaskPattern() {
        let minLp = 0;
        let best = 0;
        for (let i = 0; i < 8; i++) {
          this.makeImpl(true, i);
          const lp = QRUtil.getLostPoint(this);
          if (i === 0 || minLp > lp) { minLp = lp; best = i; }
        }
        return best;
      },
      setupTimingPattern() {
        for (let r = 8; r < this.moduleCount - 8; r++) {
          if (this.modules[r][6] !== null) continue;
          this.modules[r][6] = (r % 2 === 0);
        }
        for (let c = 8; c < this.moduleCount - 8; c++) {
          if (this.modules[6][c] !== null) continue;
          this.modules[6][c] = (c % 2 === 0);
        }
      },
      setupPositionAdjustPattern() {
        const pos = QRUtil.getPatternPosition(this.typeNumber);
        for (let i = 0; i < pos.length; i++) {
          for (let j = 0; j < pos.length; j++) {
            const row = pos[i];
            const col = pos[j];
            if (this.modules[row][col] !== null) continue;
            for (let r = -2; r <= 2; r++) {
              for (let c = -2; c <= 2; c++) {
                if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) {
                  this.modules[row + r][col + c] = true;
                } else {
                  this.modules[row + r][col + c] = false;
                }
              }
            }
          }
        }
      },
      setupTypeInfo(test, maskPattern) {
        const data = (this.errorCorrectLevel << 3) | maskPattern;
        const bits = QRUtil.getBCHTypeInfo(data);
        for (let i = 0; i < 15; i++) {
          const mod = (!test && ((bits >> i) & 1) === 1);
          if (i < 6) this.modules[i][8] = mod;
          else if (i < 8) this.modules[i + 1][8] = mod;
          else this.modules[this.moduleCount - 15 + i][8] = mod;
        }
        for (let i = 0; i < 15; i++) {
          const mod = (!test && ((bits >> i) & 1) === 1);
          if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
          else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
          else this.modules[8][15 - i - 1] = mod;
        }
        this.modules[this.moduleCount - 8][8] = !test;
      },
      mapData(data, maskPattern) {
        let inc = -1;
        let row = this.moduleCount - 1;
        let bitIndex = 7;
        let byteIndex = 0;
        for (let col = this.moduleCount - 1; col > 0; col -= 2) {
          if (col === 6) col--;
          while (true) {
            for (let c = 0; c < 2; c++) {
              if (this.modules[row][col - c] === null) {
                let dark = false;
                if (byteIndex < data.length) {
                  dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
                }
                const mask = QRUtil.getMask(maskPattern, row, col - c);
                if (mask) dark = !dark;
                this.modules[row][col - c] = dark;
                bitIndex--;
                if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
              }
            }
            row += inc;
            if (row < 0 || this.moduleCount <= row) {
              row -= inc;
              inc = -inc;
              break;
            }
          }
        }
      }
    };

    QRCodeModel.createData = function(type, ec, dataList) {
      const rsBlocks = QRRSBlock.getRSBlocks(type, ec);
      const buffer = new QRBitBuffer();
      for (let i = 0; i < dataList.length; i++) {
        const data = dataList[i];
        buffer.put(data.mode, 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, type));
        data.write(buffer);
      }
      let totalDataCount = 0;
      for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
      if (buffer.length + 4 <= totalDataCount * 8) buffer.put(0, 4);
      while (buffer.length % 8 !== 0) buffer.putBit(false);
      while (true) {
        if (buffer.length >= totalDataCount * 8) break;
        buffer.put(0xEC, 8);
        if (buffer.length >= totalDataCount * 8) break;
        buffer.put(0x11, 8);
      }
      return QRCodeModel.createBytes(buffer, rsBlocks);
    };

    QRCodeModel.createBytes = function(buffer, rsBlocks) {
      let offset = 0;
      let maxDcCount = 0;
      let maxEcCount = 0;
      const dcdata = new Array(rsBlocks.length);
      const ecdata = new Array(rsBlocks.length);
      for (let r = 0; r < rsBlocks.length; r++) {
        const dcCount = rsBlocks[r].dataCount;
        const ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (let i = 0; i < dcdata[r].length; i++) {
          dcdata[r][i] = 0xff & buffer.buffer[i + offset];
        }
        offset += dcCount;
        const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
        const modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (let i = 0; i < ecdata[r].length; i++) {
          const modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
        }
      }
      let totalCodeCount = 0;
      for (let i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
      const data = new Array(totalCodeCount);
      let index = 0;
      for (let i = 0; i < maxDcCount; i++) {
        for (let r = 0; r < rsBlocks.length; r++) {
          if (i < dcdata[r].length) data[index++] = dcdata[r][i];
        }
      }
      for (let i = 0; i < maxEcCount; i++) {
        for (let r = 0; r < rsBlocks.length; r++) {
          if (i < ecdata[r].length) data[index++] = ecdata[r][i];
        }
      }
      return data;
    };

    return {
      createMatrix(text, ecLevelName = 'M') {
        const ecLevel = QREC[ecLevelName] !== undefined ? QREC[ecLevelName] : QREC.M;
        const qr = new QRCodeModel(0, ecLevel);
        qr.addData(String(text || 'https://wishmagic.live'));
        qr.make();
        const count = qr.getModuleCount();
        const matrix = [];
        for (let r = 0; r < count; r++) {
          const row = [];
          for (let c = 0; c < count; c++) {
            row.push(qr.isDark(r, c));
          }
          matrix.push(row);
        }
        return matrix;
      }
    };
  })();

  const WishQRCodeService = {
    // Helper to generate a 100% spec-compliant, crisp, scannable QR Code SVG string
    generateQRCodeSVG(text, options = {}) {
      const size = options.size || 220;
      const fgColor = options.fgColor || '#0c0217';
      const bgColor = options.bgColor || '#ffffff';
      const margin = options.margin !== undefined ? options.margin : 4; // standard ISO 4-module quiet zone

      const rawMatrix = WishQRCodeEngine.createMatrix(text, options.ecLevel || 'M');
      const matrixSize = rawMatrix.length;
      const totalModules = matrixSize + (margin * 2);
      const cellSize = size / totalModules;

      let rects = '';
      for (let r = 0; r < matrixSize; r++) {
        for (let c = 0; c < matrixSize; c++) {
          if (rawMatrix[r][c]) {
            const x = ((c + margin) * cellSize).toFixed(2);
            const y = ((r + margin) * cellSize).toFixed(2);
            const w = (cellSize + 0.05).toFixed(2);
            const h = (cellSize + 0.05).toFixed(2);
            rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fgColor}"/>`;
          }
        }
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
        <rect width="${size}" height="${size}" fill="${bgColor}"/>
        <g>${rects}</g>
      </svg>`;
    },

    // Draws 100% standard scannable QR code directly onto an HTML Canvas
    drawQRCodeToCanvas(text, canvas, options = {}) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const size = options.size || canvas.width || 320;
      canvas.width = size;
      canvas.height = size;

      const fgColor = options.fgColor || '#0c0217';
      const bgColor = options.bgColor || '#ffffff';
      const margin = options.margin !== undefined ? options.margin : 4; // standard ISO 4-module quiet zone

      const rawMatrix = WishQRCodeEngine.createMatrix(text, options.ecLevel || 'M');
      const matrixSize = rawMatrix.length;
      const totalModules = matrixSize + (margin * 2);
      const cellSize = size / totalModules;

      // Fill clean background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, size, size);

      // Draw high-contrast modules
      ctx.fillStyle = fgColor;
      for (let r = 0; r < matrixSize; r++) {
        for (let c = 0; c < matrixSize; c++) {
          if (rawMatrix[r][c]) {
            const x = (c + margin) * cellSize;
            const y = (r + margin) * cellSize;
            ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cellSize), Math.ceil(cellSize));
          }
        }
      }
    },

    // Generates a downloadable high-resolution greeting print card with QR code
    downloadQRCardPNG(url, recipientName = 'Someone Special', title = 'Celebration Surprise') {
      const canvas = document.createElement('canvas');
      const cardWidth = 800;
      const cardHeight = 1100;
      canvas.width = cardWidth;
      canvas.height = cardHeight;
      const ctx = canvas.getContext('2d');

      // 1. Luxury Dark Gradient Background
      const grad = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
      grad.addColorStop(0, '#19062e');
      grad.addColorStop(0.5, '#0c0217');
      grad.addColorStop(1, '#05000a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cardWidth, cardHeight);

      // 2. Decorative Border & Glow Orbs
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
      ctx.lineWidth = 4;
      ctx.strokeRect(30, 30, cardWidth - 60, cardHeight - 60);

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, 40, cardWidth - 80, cardHeight - 80);

      // 3. Top Header Typography
      ctx.fillStyle = '#fdf2f8';
      ctx.font = 'bold 36px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('A SPECIAL SURPRISE FOR YOU', cardWidth / 2, 120);

      ctx.fillStyle = '#f472b6';
      ctx.font = 'bold 54px "Playfair Display", serif';
      ctx.fillText(recipientName, cardWidth / 2, 195);

      ctx.fillStyle = 'rgba(216, 180, 254, 0.8)';
      ctx.font = '22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Scan this magic code with your phone camera to unwrap ✨', cardWidth / 2, 250);

      // 4. Center QR Canvas Card
      const qrBoxSize = 440;
      const qrBoxX = (cardWidth - qrBoxSize) / 2;
      const qrBoxY = 310;

      // White card backing
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 28) : ctx.fillRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);
      ctx.fill();

      // Draw standard scannable QR code onto center
      const qrTempCanvas = document.createElement('canvas');
      this.drawQRCodeToCanvas(url, qrTempCanvas, {
        size: qrBoxSize - 40,
        fgColor: '#0a0114',
        bgColor: '#ffffff',
        margin: 4
      });
      ctx.drawImage(qrTempCanvas, qrBoxX + 20, qrBoxY + 20);

      // 5. Bottom Instructions & Vanity URL
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px "Outfit", sans-serif';
      ctx.fillText('🎁 Interactive Celebration Website', cardWidth / 2, 820);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '20px monospace';
      const displayUrl = url.replace(/^https?:\/\//, '');
      ctx.fillText(displayUrl, cardWidth / 2, 865);

      ctx.fillStyle = 'rgba(244, 114, 182, 0.8)';
      ctx.font = 'bold 20px "Great Vibes", cursive, sans-serif';
      ctx.fillText('Handcrafted with love on WishMagic', cardWidth / 2, 980);

      // 6. Trigger Download
      const link = document.createElement('a');
      const filename = `WishMagic-QR-${WishSlugService.slugify(recipientName) || 'card'}.png`;
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Part 16: Track Event
      if (window.WishAnalyticsService) {
        window.WishAnalyticsService.trackEvent('qr_generated', {
          recipientName,
          metadata: { title, url }
        });
      }
    }
  };

  // =========================================================================
  // 3. SOCIAL PREVIEW METADATA & CARD BUILDER
  // =========================================================================
  const WishSocialPreview = {
    /**
     * Generates normalized OpenGraph and Twitter social card metadata
     */
    getSocialMetadata(wishOrData, template = null) {
      const data = wishOrData.customData || wishOrData || {};
      const recipient = data.recipient_name || data.recipientName || 'Someone Special';
      const sender = data.sender_name || data.senderName || 'Someone Who Cares';
      const occasion = (template && template.category) || data.occasion || 'Celebration';
      const publicUrl = WishSlugService.getPublicUrl(wishOrData);

      // Hero image resolution (prioritize photo_1 or cover photo or template thumbnail)
      let imageUrl = data.cover_photo || data.photo_1 || (data.photos && data.photos[0] && data.photos[0].src);
      if (!imageUrl && template) {
        imageUrl = template.thumbnail || (template.previewImages && template.previewImages[0]);
      }
      if (!imageUrl) {
        imageUrl = '/assets/file_ab2082.png';
      }

      const title = `${recipient}'s Magical ${occasion} Surprise ✨`;
      const description = `A personalized celebration website created with love by ${sender} for ${recipient}. Open this link to unwrap music, photographs, and memories! 💖`;

      return {
        title,
        description,
        recipient,
        sender,
        occasion,
        publicUrl,
        imageUrl,
        siteName: 'WishMagic'
      };
    },

    /**
     * Renders an interactive Social Card Preview visualizer
     * Allows creators to see how their link looks on WhatsApp, Twitter/X, and iMessage
     */
    renderSocialPreviewHTML(meta, platform = 'whatsapp') {
      const { title, description, publicUrl, imageUrl } = meta;
      const displayDomain = 'wishmagic.live';

      if (platform === 'whatsapp') {
        return `
          <div class="rounded-2xl bg-[#0b141a] p-3 text-white border border-[#202c33] shadow-lg max-w-sm mx-auto font-sans">
            <div class="rounded-xl overflow-hidden bg-[#111b21] border border-[#222e35]">
              <div class="relative w-full h-36 bg-[#182229] overflow-hidden">
                <img src="${imageUrl}" alt="Preview" class="w-full h-full object-cover"/>
                <div class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur text-[10px] font-bold text-emerald-400">
                  🎁 WishMagic
                </div>
              </div>
              <div class="p-3 space-y-1">
                <h4 class="font-bold text-xs sm:text-sm text-[#e9edef] line-clamp-1">${title}</h4>
                <p class="text-[11px] text-[#8696a0] line-clamp-2 leading-relaxed">${description}</p>
                <div class="text-[10px] text-[#00a884] font-medium pt-1 truncate">${displayDomain}</div>
              </div>
            </div>
            <div class="mt-2 text-[11px] text-[#e9edef] font-mono break-all px-1">
              ${publicUrl}
            </div>
          </div>
        `;
      }

      if (platform === 'twitter') {
        return `
          <div class="rounded-2xl bg-black p-3 text-white border border-neutral-800 shadow-lg max-w-sm mx-auto font-sans">
            <div class="rounded-2xl overflow-hidden border border-neutral-800 hover:border-neutral-700 transition">
              <div class="relative w-full h-40 bg-neutral-900 overflow-hidden">
                <img src="${imageUrl}" alt="Preview" class="w-full h-full object-cover"/>
              </div>
              <div class="p-3 bg-neutral-950 space-y-1">
                <div class="text-[10px] text-neutral-400 font-mono">${displayDomain}</div>
                <h4 class="font-bold text-xs sm:text-sm text-neutral-100 line-clamp-1">${title}</h4>
                <p class="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed">${description}</p>
              </div>
            </div>
          </div>
        `;
      }

      // Default: iMessage / Generic Rich Card
      return `
        <div class="rounded-2xl bg-[#1c1c1e] p-3 text-white border border-[#2c2c2e] shadow-lg max-w-sm mx-auto font-sans">
          <div class="rounded-xl overflow-hidden bg-[#2c2c2e]">
            <div class="relative w-full h-36 bg-[#3a3a3c] overflow-hidden">
              <img src="${imageUrl}" alt="Preview" class="w-full h-full object-cover"/>
            </div>
            <div class="p-3 space-y-1">
              <div class="text-[10px] text-[#0a84ff] font-semibold uppercase tracking-wider">WISHMAGIC.LIVE</div>
              <h4 class="font-bold text-xs sm:text-sm text-white line-clamp-1">${title}</h4>
              <p class="text-[11px] text-[#8e8e93] line-clamp-2 leading-relaxed">${description}</p>
            </div>
          </div>
        </div>
      `;
    }
  };

  // =========================================================================
  // 4. UNIVERSAL SHARE SYSTEM (Web Share, WhatsApp, Telegram, SMS, QR Modal)
  // =========================================================================
  const WishShareSystem = {
    // Expose subservices
    slug: WishSlugService,
    qr: WishQRCodeService,
    preview: WishSocialPreview,

    /**
     * Prepares pre-composed share text and URLs for different social channels
     */
    getShareChannels(wishOrData, template = null) {
      const meta = WishSocialPreview.getSocialMetadata(wishOrData, template);
      const { recipient, publicUrl } = meta;

      const rawMsg = `✨ Hey ${recipient}! I crafted a magical personalized celebration surprise website just for you 🎁.\n\nOpen it here to unwrap: ${publicUrl} 💖`;
      const encodedMsg = encodeURIComponent(rawMsg);
      const encodedUrl = encodeURIComponent(publicUrl);
      const encodedTitle = encodeURIComponent(`A Special Celebration For ${recipient} ✨`);

      return {
        whatsapp: `https://api.whatsapp.com/send?text=${encodedMsg}`,
        telegram: `https://t.telegram.org/share/url?url=${encodedUrl}&text=${encodeURIComponent(`✨ Personalized Celebration Surprise for ${recipient}!`)}`,
        twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(`Created a magical celebration surprise for ${recipient} on @WishMagic ✨`)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        sms: `sms:?&body=${encodedMsg}`,
        email: `mailto:?subject=${encodedTitle}&body=${encodedMsg}`,
        publicUrl,
        meta
      };
    },

    /**
     * Executes Native Web Share API if supported by the browser (mobile phones, Safari, Chrome)
     */
    async shareNative(wishOrData, template = null) {
      const meta = WishSocialPreview.getSocialMetadata(wishOrData, template);
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: meta.title,
            text: `✨ Special personalized celebration website created for ${meta.recipient}!`,
            url: meta.publicUrl
          });
          return true;
        } catch (e) {
          if (e.name !== 'AbortError') {
            console.warn('[WishShareSystem] Native share failed, opening modal fallback:', e);
            this.openShareModal(wishOrData, { template });
          }
          return false;
        }
      } else {
        this.openShareModal(wishOrData, { template });
        return false;
      }
    },

    /**
     * Robust Clipboard Copy with fallback
     */
    async copyLink(urlOrWish, feedbackEl = null) {
      let url = typeof urlOrWish === 'string' ? urlOrWish : WishSlugService.getPublicUrl(urlOrWish);
      let copied = false;

      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch (e) {
          copied = false;
        }
      }

      if (!copied) {
        try {
          const textArea = document.createElement('textarea');
          textArea.value = url;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          copied = document.execCommand('copy');
          document.body.removeChild(textArea);
        } catch (e) {
          copied = false;
        }
      }

      if (feedbackEl) {
        const prev = feedbackEl.innerHTML;
        feedbackEl.innerHTML = '<span>Copied! ✨</span>';
        setTimeout(() => {
          feedbackEl.innerHTML = prev;
        }, 2200);
      }

      // Part 16: Track Event
      if (window.WishAnalyticsService) {
        window.WishAnalyticsService.trackEvent('share_link_copied', {
          metadata: { url }
        });
      }

      // Part 17: Toast Feedback
      if (window.WishToast) {
        window.WishToast.show({
          title: 'Link Copied! 📋',
          message: 'Public celebration URL copied to clipboard.',
          type: 'success'
        });
      }

      return copied;
    },

    /**
     * Opens the full-featured, state-of-the-art Share & Discoverability Modal
     */
    openShareModal(wishOrData, options = {}) {
      const template = options.template || null;
      const meta = WishSocialPreview.getSocialMetadata(wishOrData, template);
      const channels = this.getShareChannels(wishOrData, template);

      // Part 16: Track Event
      if (window.WishAnalyticsService) {
        window.WishAnalyticsService.trackEvent('wish_shared', {
          wishId: wishOrData?.id || null,
          slug: wishOrData?.slug || null,
          recipientName: meta.recipient,
          category: meta.occasion,
          metadata: { title: meta.title, publicUrl: meta.publicUrl }
        });
      }

      let modal = document.getElementById('wishmagic-share-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wishmagic-share-modal';
        modal.className = 'fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-5 transition-all duration-300';
        document.body.appendChild(modal);
      }

      const qrSVG = WishQRCodeService.generateQRCodeSVG(meta.publicUrl, { size: 160, rounded: true, fgColor: '#1a062f' });

      modal.innerHTML = `
        <div class="w-full max-w-xl bg-[#0f041d] text-white rounded-3xl border border-purple-500/30 shadow-2xl p-5 sm:p-7 flex flex-col gap-4 relative max-h-[92vh] overflow-y-auto custom-scrollbar">
          
          <!-- Background Glows -->
          <div class="absolute -top-24 -left-24 w-60 h-60 bg-pink-500/20 rounded-full blur-3xl pointer-events-none"></div>
          <div class="absolute -bottom-24 -right-24 w-60 h-60 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

          <!-- Close Button -->
          <button onclick="document.getElementById('wishmagic-share-modal').classList.add('hidden')" class="absolute top-4 right-4 p-2 text-purple-300 hover:text-white rounded-full hover:bg-white/10 transition cursor-pointer z-10" title="Close Share Dialog">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>

          <!-- Modal Header -->
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 via-purple-600 to-amber-300 text-white flex items-center justify-center text-2xl shadow-lg shadow-pink-500/30 flex-shrink-0">
              🎁
            </div>
            <div>
              <h3 class="font-display text-xl sm:text-2xl font-extrabold text-white">
                Share Celebration Website
              </h3>
              <p class="text-xs text-purple-300/80">
                Created with love for <strong class="text-pink-400 font-bold">${meta.recipient}</strong>
              </p>
            </div>
          </div>

          <!-- Link Copy Bar -->
          <div class="flex flex-col gap-1.5 pt-1">
            <div class="flex items-center justify-between text-xs font-semibold text-purple-200">
              <span>Public Clean Link:</span>
              <span class="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Instant Ready
              </span>
            </div>
            <div class="flex items-center justify-between gap-2 p-1.5 pl-3.5 rounded-2xl bg-purple-950/70 border border-purple-500/40 shadow-inner">
              <input id="modal-share-link-input" type="text" readonly value="${meta.publicUrl}" class="w-full bg-transparent text-xs font-mono text-pink-200 focus:outline-none select-all truncate"/>
              <button onclick="WishShareSystem.copyLink('${meta.publicUrl}', this)" class="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:brightness-110 active:scale-95 text-white font-bold text-xs shadow flex items-center gap-1.5 flex-shrink-0 transition cursor-pointer">
                <span class="material-symbols-outlined text-[15px]">content_copy</span>
                <span>Copy Link</span>
              </button>
            </div>
          </div>

          <!-- Quick Social Action Buttons -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <!-- WhatsApp -->
            <a href="${channels.whatsapp}" target="_blank" class="py-2.5 px-3 rounded-2xl bg-[#25D366] hover:brightness-110 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition active:scale-95">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.044c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824z"/></svg>
              <span>WhatsApp</span>
            </a>

            <!-- Telegram -->
            <a href="${channels.telegram}" target="_blank" class="py-2.5 px-3 rounded-2xl bg-[#229ED9] hover:brightness-110 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition active:scale-95">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
              <span>Telegram</span>
            </a>

            <!-- SMS / iMessage -->
            <a href="${channels.sms}" class="py-2.5 px-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition active:scale-95">
              <span class="material-symbols-outlined text-[16px]">sms</span>
              <span>iMessage/SMS</span>
            </a>

            <!-- Open Live in New Tab -->
            <a href="${meta.publicUrl}" target="_blank" class="py-2.5 px-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 flex items-center justify-center gap-1.5 transition">
              <span class="material-symbols-outlined text-[16px]">open_in_new</span>
              <span>Open Link</span>
            </a>
          </div>

          <!-- Section: QR Code & Printable Greeting Card Download -->
          <div class="p-4 rounded-2xl bg-purple-950/40 border border-purple-500/20 flex flex-col sm:flex-row items-center gap-4">
            <div class="p-2 bg-white rounded-2xl shadow-xl flex-shrink-0">
              ${qrSVG}
            </div>
            <div class="flex-1 text-center sm:text-left space-y-2">
              <div class="flex items-center justify-center sm:justify-start gap-2">
                <span class="text-base">🖨️</span>
                <h4 class="font-bold text-sm text-white">Printable QR Greeting Card</h4>
              </div>
              <p class="text-[11px] text-purple-300/80 leading-relaxed">
                Download a high-resolution dark luxury card with this QR code to print inside physical gift envelopes or anniversary cards!
              </p>
              <button onclick="WishQRCodeService.downloadQRCardPNG('${meta.publicUrl}', '${meta.recipient}', '${meta.title}')" class="py-2 px-4 rounded-xl bg-purple-800/80 hover:bg-purple-700 text-purple-100 font-bold text-xs border border-purple-500/40 shadow flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer">
                <span class="material-symbols-outlined text-[16px]">download</span>
                <span>Download Print Card (PNG)</span>
              </button>
            </div>
          </div>

          <!-- Section: Live Social Card Visualizer -->
          <div class="space-y-2 pt-1">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                <span>📱 Social Card Preview</span>
                <span class="text-[10px] text-purple-400 font-normal">(How link looks when texted)</span>
              </span>
              <div class="flex items-center gap-1">
                <button onclick="WishShareSystem.switchSocialTab('whatsapp')" id="tab-soc-whatsapp" class="px-2 py-0.5 rounded-lg bg-pink-500 text-white font-bold text-[10px] cursor-pointer">WhatsApp</button>
                <button onclick="WishShareSystem.switchSocialTab('twitter')" id="tab-soc-twitter" class="px-2 py-0.5 rounded-lg text-purple-300 hover:text-white font-semibold text-[10px] cursor-pointer">Twitter/X</button>
                <button onclick="WishShareSystem.switchSocialTab('imessage')" id="tab-soc-imessage" class="px-2 py-0.5 rounded-lg text-purple-300 hover:text-white font-semibold text-[10px] cursor-pointer">iMessage</button>
              </div>
            </div>

            <div id="modal-social-preview-container">
              ${WishSocialPreview.renderSocialPreviewHTML(meta, 'whatsapp')}
            </div>
          </div>

        </div>
      `;

      modal.classList.remove('hidden');

      // Attach dynamic tab switch method
      WishShareSystem._activeMeta = meta;
    },

    switchSocialTab(platform) {
      const container = document.getElementById('modal-social-preview-container');
      if (!container || !WishShareSystem._activeMeta) return;

      container.innerHTML = WishSocialPreview.renderSocialPreviewHTML(WishShareSystem._activeMeta, platform);

      ['whatsapp', 'twitter', 'imessage'].forEach(p => {
        const btn = document.getElementById(`tab-soc-${p}`);
        if (btn) {
          if (p === platform) {
            btn.className = 'px-2 py-0.5 rounded-lg bg-pink-500 text-white font-bold text-[10px] cursor-pointer';
          } else {
            btn.className = 'px-2 py-0.5 rounded-lg text-purple-300 hover:text-white font-semibold text-[10px] cursor-pointer';
          }
        }
      });
    }
  };

  // Expose to window
  window.WishSlugService = WishSlugService;
  window.WishQRCodeService = WishQRCodeService;
  window.WishSocialPreview = WishSocialPreview;
  window.WishShareSystem = WishShareSystem;

})(typeof window !== 'undefined' ? window : this);
