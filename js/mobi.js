// mobi（PalmDB/PalmDOC）解析，尽力提取纯文本
import { decodeUtf8, decodeGbk, latin1Decode } from './decoder.js'

// PalmDOC 压缩解码
function palmdocDecompress(data) {
  const out = []
  let i = 0
  while (i < data.length) {
    const b = data[i++]
    if (b === 0) { out.push(0) }
    else if (b <= 8) { for (let j = 0; j < b; j++) out.push(data[i++]) }
    else if (b <= 0x7F) { out.push(b) }
    else if (b <= 0xBF) {
      const b2 = data[i++]
      const pair = ((b << 8) | b2) & 0x3FFF
      const dist = pair >> 3
      const len = (pair & 0x7) + 3
      const start = out.length - dist
      for (let j = 0; j < len; j++) out.push(out[start + j])
    } else {
      const b2 = data[i++]
      const ch = (b ^ 0x80) & 0xFF
      out.push(ch)
      out.push(b2)
    }
  }
  return new Uint8Array(out)
}

// 提取 mobi 文本，buf 为 ArrayBuffer/Uint8Array
export function extractMobiText(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  let magic = ''
  for (let i = 60; i < 68; i++) magic += String.fromCharCode(bytes[i])
  if (bytes.length < 78 || magic !== 'BOOKMOBI') {
    throw new Error('该文件不是有效的 mobi/PalmDB 格式（mobi 为亚马逊私有格式，建议先用 Calibre 转为 txt/epub 后再处理）')
  }
  const numRecords = view.getUint16(76)
  const records = []
  for (let i = 0; i < numRecords; i++) {
    const off = 78 + i * 8
    records.push({
      offset: view.getUint32(off),
      len: (i + 1 < numRecords)
        ? view.getUint32(78 + (i + 1) * 8) - view.getUint32(off)
        : bytes.length - view.getUint32(off)
    })
  }
  if (!records.length) throw new Error('mobi 文件内部无记录数据')

  // record0 = PalmDOC 头 + MOBI 头
  const r0 = records[0]
  const compression = view.getUint16(r0.offset) // 1=无压缩 2=PalmDOC 17=HUFF/CDIC
  const textLength = view.getUint32(r0.offset + 4)
  const recordCount = view.getUint16(r0.offset + 8)
  const recordSize = view.getUint16(r0.offset + 10)
  const encryption = view.getUint16(r0.offset + 12)
  if (encryption !== 0) throw new Error('该 mobi 文件已加密（DRM），无法解析')
  if (compression === 17) throw new Error('该 mobi 使用 HUFF/CDIC 压缩，暂不支持，建议转为 txt/epub')

  // 提取文本记录（record 1 ~ recordCount）
  const chunks = []
  for (let i = 1; i <= Math.min(recordCount, records.length - 1); i++) {
    const rec = records[i]
    let data = bytes.slice(rec.offset, rec.offset + Math.min(rec.len, recordSize))
    if (compression === 2) data = palmdocDecompress(data)
    chunks.push(data)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const raw = new Uint8Array(total)
  let pos = 0
  chunks.forEach(c => { raw.set(c, pos); pos += c.length })
  const trimmed = raw.slice(0, Math.min(raw.length, textLength || raw.length))

  // 尝试 UTF-8，失败回退 GBK / Latin1
  let text
  try {
    text = decodeUtf8(trimmed)
  } catch (_) {
    try { text = decodeGbk(trimmed) }
    catch (__) { text = latin1Decode(trimmed) }
  }
  // 清理 mobi 内部标记
  text = text.replace(/<mbp:pagebreak\s*\/?>/gi, '\n')
    .replace(/<[^>]{0,80}?>/g, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
  return text
}
