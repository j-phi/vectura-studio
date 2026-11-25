/**
 * ImageCodec — compact, lossless storage of noise-rack RGBA images inside .vectura payloads.
 *
 * Legacy files wrote every pixel byte as a JSON number (`data: [r,g,b,a,...]`), which made a
 * two-image document hundreds of MB. The compact form is
 *   { width, height, encoding: 'rgba8-base64', data: '<base64>' }
 * and a byte-identical later image is written as { width, height, sameAs: '<earlier id>' }.
 * decode() accepts every form (legacy arrays, base64, sameAs) so old files keep loading.
 * Everything here is synchronous (Save must not await before saveBlob — TUX-054).
 */
(() => {
  const ENCODING = 'rgba8-base64';
  const CHUNK = 3 * 16384; // multiple of 3 so chunk base64 strings concatenate cleanly

  const toBase64 = (bytes) => {
    if (typeof btoa !== 'function' && typeof Buffer !== 'undefined') {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    }
    const parts = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      parts.push(btoa(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)))));
    }
    return parts.join('');
  };

  const fromBase64 = (str) => {
    if (typeof atob !== 'function' && typeof Buffer !== 'undefined') {
      const buf = Buffer.from(str, 'base64');
      return new Uint8ClampedArray(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    }
    const bin = atob(str);
    const out = new Uint8ClampedArray(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  };

  const hashBytes = (d) => {
    let h = 0x811c9dc5;
    const step = Math.max(1, Math.floor(d.length / 4096));
    for (let i = 0; i < d.length; i += step) { h ^= d[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h;
  };

  const sameBytes = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  };

  const asBytes = (data) => {
    if (ArrayBuffer.isView(data) && data.BYTES_PER_ELEMENT === 1) return data; // isView: safe across realms
    if (Array.isArray(data)) return Uint8ClampedArray.from(data);
    return null;
  };

  // { id: {width,height,data} } -> { id: compact | sameAs ref }. Entries without usable data are skipped.
  const encodeAll = (images) => {
    const out = {};
    const seen = []; // { id, bytes, hash }
    Object.entries(images || {}).forEach(([id, img]) => {
      const bytes = img && asBytes(img.data);
      if (!bytes) return;
      const hash = hashBytes(bytes);
      const twin = seen.find((s) => s.hash === hash && sameBytes(s.bytes, bytes));
      if (twin) {
        out[id] = { width: img.width, height: img.height, sameAs: twin.id };
        return;
      }
      seen.push({ id, bytes, hash });
      out[id] = { width: img.width, height: img.height, encoding: ENCODING, data: toBase64(bytes) };
    });
    return out;
  };

  // Decode one entry; `lookup(id)` resolves sameAs refs. Returns null for anything unusable.
  const decodeOne = (img, lookup, depth = 0) => {
    if (!img || typeof img !== 'object') return null;
    if (typeof img.sameAs === 'string') {
      if (depth > 8) return null;
      const ref = lookup(img.sameAs, depth + 1);
      return ref ? { width: img.width ?? ref.width, height: img.height ?? ref.height, data: ref.data } : null;
    }
    if (Array.isArray(img.data)) {
      return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
    }
    if (typeof img.data === 'string') {
      if (img.encoding !== ENCODING) {
        console.warn(`ImageCodec: unknown image encoding "${img.encoding}"; image skipped`);
        return null;
      }
      try { return { width: img.width, height: img.height, data: fromBase64(img.data) }; } catch (err) {
        console.warn('ImageCodec: could not decode image data', err);
        return null;
      }
    }
    return null;
  };

  // payload.images (any mix of forms) -> { id: {width,height,data:Uint8ClampedArray} }. sameAs images share one buffer.
  const decodeAll = (images) => {
    const out = {};
    if (!images || typeof images !== 'object') return out;
    const lookup = (id, depth = 0) => {
      if (out[id]) return out[id];
      const v = decodeOne(images[id], lookup, depth);
      if (v) out[id] = v;
      return v;
    };
    Object.keys(images).forEach((id) => { lookup(id); });
    return out;
  };

  // Shallow copy of a payload with compact images (already-compact entries pass through untouched).
  const compactPayload = (payload) => {
    if (!payload || typeof payload !== 'object' || !payload.images || typeof payload.images !== 'object') return payload;
    const legacy = {};
    const out = {};
    Object.entries(payload.images).forEach(([id, img]) => {
      if (img && Array.isArray(img.data)) legacy[id] = img;
      else out[id] = img;
    });
    if (!Object.keys(legacy).length) return payload;
    const encoded = encodeAll(legacy);
    // Keep original id order; a sameAs ref always points at a legacy id that is itself encoded in full.
    const images = {};
    Object.keys(payload.images).forEach((id) => { images[id] = encoded[id] || out[id]; });
    return { ...payload, images };
  };

  const Vectura = (window.Vectura = window.Vectura || {});
  Vectura.ImageCodec = { ENCODING, encodeAll, decodeAll, compactPayload, toBase64, fromBase64 };
})();
