import type { D1Database } from '@cloudflare/workers-types';
import { builtinUniformAsset, uniformAssetReferences, uniformAssetSchema, uniformAssetRefSchema,
  UNIFORM_IMAGE_MAX_BYTES, UNIFORM_THUMBNAIL_MAX_BYTES } from '@my-app/shared';
import type { UniformAsset, UniformAssetRef, UniformDesign } from '@my-app/shared';

import {UniformAssetError} from './uniformAssetError';
export {UniformAssetError} from './uniformAssetError';
import {getStorageBody} from './uniformStorage';
import type {UniformStorageBindings} from './uniformStorage';
export type UniformAssetVersionRow = { metadata_json: string; image_key: string | null; thumbnail_key: string | null; source_key: string | null };
export async function assetVersion(db: D1Database, ref: UniformAssetRef): Promise<{ asset: UniformAsset; row?: UniformAssetVersionRow } | null> {
  if (!uniformAssetRefSchema.safeParse(ref).success) return null;
  const builtin = builtinUniformAsset(ref);
  if (builtin) return { asset: builtin };
  const row = await db.prepare('SELECT metadata_json,image_key,thumbnail_key,source_key FROM uniform_asset_versions WHERE asset_id=? AND revision=?')
    .bind(ref.id, ref.revision).first<UniformAssetVersionRow>();
  return row ? { asset: uniformAssetSchema.parse(JSON.parse(row.metadata_json)), row } : null;
}
export async function validateUniformReferences(db: D1Database, design: UniformDesign, allowDraft = false) {
  for (const { kind, ref } of uniformAssetReferences(design)) {
    const version = await assetVersion(db, ref);
    if (!version || version.asset.kind !== kind || (!allowDraft && version.asset.status !== 'published')) {
      throw new UniformAssetError('使用する素材の種類・公開状態・バージョンを確認してください。');
    }
  }
}
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
/** Revalidate browser conversion at the storage boundary. Strict RGBA/RGB PNG
 * only; reject APNG, executable suffixes, CRC errors and decompression bombs. */
export async function validateUniformPng(dataUrl: string, maxDimension: number, thumbnail = false) {
  const limit = thumbnail ? UNIFORM_THUMBNAIL_MAX_BYTES : UNIFORM_IMAGE_MAX_BYTES;
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl) || dataUrl.slice(22).length % 4) throw new UniformAssetError('変換済みのPNG画像を指定してください。');
  const raw = atob(dataUrl.slice(22));
  if (raw.length > limit) throw new UniformAssetError(thumbnail ? 'サムネイルが大きすぎます。' : '画像は4MB以内です。', 413);
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const bad = () => { throw new UniformAssetError('PNG画像が破損しているか、未対応の形式です。'); };
  if (bytes.length < 57 || ![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n) || view.getUint32(8) !== 13) bad();
  const width = view.getUint32(16), height = view.getUint32(20), depth = bytes[24], color = bytes[25];
  if (!width || !height || width > maxDimension || height > maxDimension || depth !== 8 || ![2,6].includes(color)
    || bytes[26] || bytes[27] || bytes[28]) bad();
  let offset = 8, end = false;
  const compressed: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset);
    if (size > bytes.length - offset - 12) bad();
    const type = String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if (crc32(bytes.subarray(offset+4,offset+8+size)) !== view.getUint32(offset+8+size)) bad();
    if ((offset===8 && type!=='IHDR') || !['IHDR','IDAT','IEND','sRGB','gAMA','cHRM','pHYs'].includes(type) || (type==='IHDR' && offset!==8)) bad();
    if (type==='IDAT') compressed.push(bytes.subarray(offset+8,offset+8+size));
    offset += size+12;
    if (type==='IEND') { if (size || offset!==bytes.length) bad(); end=true; break; }
  }
  if (!end || !compressed.length) bad();
  const stride = width * (color===6 ? 4 : 3)+1, expected = height*stride;
  const input = new Blob(compressed.map(part => new Uint8Array(part).buffer)).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let count = 0;
  try {
    while (true) {
      const { value, done } = await input.read();
      if (done) break;
      if (count+value.length>expected) { await input.cancel(); bad(); }
      for (let i=(stride-count%stride)%stride;i<value.length;i+=stride) if (value[i]>4) bad();
      count += value.length;
    }
    if (count!==expected) bad();
  } catch { try { await input.cancel(); } catch {} bad(); }
  return { bytes, width, height };
}
export async function storageObject(env: UniformStorageBindings, key: string | null, type: string) {
  if (!key) throw new UniformAssetError('素材画像が見つかりません。', 404);
  const body = await getStorageBody(env,key);
  return new Response(body as unknown as ReadableStream, { headers: { 'Content-Type': type,
    'Cache-Control': type==='image/png' ? 'public, max-age=31536000, immutable' : 'private, no-store',
    'X-Content-Type-Options':'nosniff', 'Content-Disposition':type==='image/png'?'inline':'attachment; filename="uniform-drawing.json"' } });
}
