const crc32Table = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

const crc32 = (u8) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = crc32Table[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

const le16 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255]);

const le32 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);

const concatBytes = (parts) => {
  const size = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(size);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
};

export const makeZip = async (files) => {
  const chunks = [];
  const central = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const hdr = [
      le32(0x04034b50), le16(20), le16(0), le16(0), le16(0), le16(0),
      le32(crc), le32(data.length), le32(data.length), le16(nameBytes.length), le16(0)
    ];
    const local = concatBytes([...hdr, nameBytes, data]);
    chunks.push(local);
    const cenHdr = [
      le32(0x02014b50), le16(20), le16(20), le16(0), le16(0), le16(0), le16(0),
      le32(crc), le32(data.length), le32(data.length), le16(nameBytes.length), le16(0), le16(0), le16(0), le16(0),
      le32(offset)
    ];
    central.push(concatBytes([...cenHdr, nameBytes]));
    offset += local.length;
  }
  const centralDir = concatBytes(central);
  const end = concatBytes([le32(0x06054b50), le16(0), le16(0), le16(files.length), le16(files.length), le32(centralDir.length), le32(offset), le16(0)]);
  const zipBytes = concatBytes([...chunks, centralDir, end]);
  return new Blob([zipBytes], { type: 'application/zip' });
};
