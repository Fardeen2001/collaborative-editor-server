/**
 * Mongoose .lean() returns BSON Binary for Buffer fields — not Node Buffer.
 * `new Uint8Array(binary)` silently yields 0 bytes; use these helpers instead.
 */
function binaryByteLength(data) {
  if (!data) return 0;
  if (typeof data.length === 'function') return data.length();
  if (typeof data.length === 'number') return data.length;
  if (typeof data.byteLength === 'number') return data.byteLength;
  return 0;
}

function toUint8Array(data) {
  if (!data) {
    throw new Error('Missing binary data');
  }

  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data);
  }

  if (data instanceof Uint8Array) {
    return data;
  }

  // BSON Binary from mongoose lean()
  if (typeof data.length === 'function' && data.buffer) {
    const len = data.length();
    if (len === 0) {
      throw new Error('Binary data is empty');
    }
    return new Uint8Array(data.buffer, data.byteOffset || 0, len);
  }

  if (data.buffer instanceof ArrayBuffer) {
    const len = data.byteLength ?? data.length;
    return new Uint8Array(data.buffer, data.byteOffset || 0, len);
  }

  throw new Error('Unsupported binary data type');
}

function toBuffer(data) {
  return Buffer.from(toUint8Array(data));
}

module.exports = { binaryByteLength, toUint8Array, toBuffer };
