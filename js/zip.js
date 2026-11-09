// 纯 JS 的 zip 解析（替代 JSZip），支持 stored / deflate
// 与小程序 utils/zip.js 保持一致，改为 ES Module
import { decodeUtf8, latin1Decode } from './decoder.js'

/* ---------- raw inflate（RFC 1951） ---------- */
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

function buildHuffman(lengths) {
  const maxSym = lengths.length - 1
  const counts = new Array(16).fill(0)
  for (let i = 0; i <= maxSym; i++) counts[lengths[i]]++
  counts[0] = 0
  const offsets = new Array(16).fill(0)
  for (let i = 1; i <= 15; i++) offsets[i] = offsets[i - 1] + counts[i - 1]
  const symbols = new Array(maxSym + 1).fill(0)
  for (let i = 0; i <= maxSym; i++) {
    if (lengths[i]) symbols[offsets[lengths[i]]++] = i
  }
  return { counts, symbols }
}

function huffDecode(tbl, br) {
  let code = 0, first = 0, index = 0
  for (let len = 1; len <= 15; len++) {
    code |= br.bit()
    const count = tbl.counts[len]
    if (code - first < count) return tbl.symbols[index + (code - first)]
    index += count
    first = (first + count) << 1
    code <<= 1
  }
  throw new Error('invalid huffman code')
}

function inflateRaw(data) {
  let pos = 0, bitBuf = 0, bitCnt = 0
  const br = {
    bit() {
      if (bitCnt === 0) {
        if (pos >= data.length) throw new Error('unexpected end of stream')
        bitBuf = data[pos++]
        bitCnt = 8
      }
      const b = bitBuf & 1
      bitBuf >>= 1
      bitCnt--
      return b
    },
    bits(n) {
      let v = 0
      for (let i = 0; i < n; i++) v |= this.bit() << i
      return v
    },
    align() { bitBuf = 0; bitCnt = 0 }
  }
  const out = []
  let final = 0
  while (!final) {
    final = br.bit()
    const type = br.bits(2)
    if (type === 0) {
      // stored
      br.align()
      if (pos + 4 > data.length) throw new Error('bad stored block')
      const len = data[pos] | (data[pos + 1] << 8)
      pos += 4
      for (let i = 0; i < len; i++) out.push(data[pos++])
    } else if (type === 1 || type === 2) {
      let litTbl, distTbl
      if (type === 1) {
        const litLens = new Array(288)
        for (let i = 0; i < 144; i++) litLens[i] = 8
        for (let i = 144; i < 256; i++) litLens[i] = 9
        for (let i = 256; i < 280; i++) litLens[i] = 7
        for (let i = 280; i < 288; i++) litLens[i] = 8
        const distLens = new Array(30).fill(5)
        litTbl = buildHuffman(litLens)
        distTbl = buildHuffman(distLens)
      } else {
        const hlit = br.bits(5) + 257
        const hdist = br.bits(5) + 1
        const hclen = br.bits(4) + 4
        const clens = new Array(19).fill(0)
        for (let i = 0; i < hclen; i++) clens[CLEN_ORDER[i]] = br.bits(3)
        const clTbl = buildHuffman(clens)
        const lens = new Array(hlit + hdist).fill(0)
        let i = 0
        while (i < hlit + hdist) {
          const sym = huffDecode(clTbl, br)
          if (sym < 16) { lens[i++] = sym }
          else if (sym === 16) {
            const rep = 3 + br.bits(2)
            const prev = lens[i - 1]
            for (let j = 0; j < rep; j++) lens[i++] = prev
          } else if (sym === 17) {
            const rep = 3 + br.bits(3)
            for (let j = 0; j < rep; j++) lens[i++] = 0
          } else {
            const rep = 11 + br.bits(7)
            for (let j = 0; j < rep; j++) lens[i++] = 0
          }
        }
        litTbl = buildHuffman(lens.slice(0, hlit))
        distTbl = buildHuffman(lens.slice(hlit))
      }
      for (;;) {
        const sym = huffDecode(litTbl, br)
        if (sym < 256) { out.push(sym) }
        else if (sym === 256) { break }
        else {
          const li = sym - 257
          if (li >= LEN_BASE.length) throw new Error('invalid length symbol')
          const len = LEN_BASE[li] + br.bits(LEN_EXTRA[li])
          const dsym = huffDecode(distTbl, br)
          const dist = DIST_BASE[dsym] + br.bits(DIST_EXTRA[dsym])
          const start = out.length - dist
          if (start < 0) throw new Error('invalid distance')
          for (let j = 0; j < len; j++) out.push(out[start + j])
        }
      }
    } else {
      throw new Error('invalid deflate block type')
    }
  }
  return new Uint8Array(out)
}

/* ---------- zip 解析 ---------- */
function findEocd(buf, view) {
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65536; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i
  }
  return -1
}

function parseZipEntries(buf) {
  const view = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength)
  const eocd = findEocd(buf, view)
  if (eocd < 0) throw new Error('不是有效的 zip/epub 文件')
  const count = view.getUint16(eocd + 10, true)
  let off = view.getUint32(eocd + 16, true)
  const files = {}
  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.length || view.getUint32(off, true) !== 0x02014b50) break
    const method = view.getUint16(off + 10, true)
    const compSize = view.getUint32(off + 20, true)
    const nameLen = view.getUint16(off + 28, true)
    const extraLen = view.getUint16(off + 30, true)
    const commentLen = view.getUint16(off + 32, true)
    const lho = view.getUint32(off + 42, true)
    let name = ''
    for (let j = 0; j < nameLen; j++) name += String.fromCharCode(buf[off + 46 + j])
    if (!name.endsWith('/')) {
      files[name] = { method, compSize, lho }
    }
    off += 46 + nameLen + extraLen + commentLen
  }
  return files
}

function readZipEntryText(buf, entry) {
  const view = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength)
  const lho = entry.lho
  if (view.getUint32(lho, true) !== 0x04034b50) throw new Error('zip 本地文件头损坏')
  const nameLen = view.getUint16(lho + 26, true)
  const extraLen = view.getUint16(lho + 28, true)
  const start = lho + 30 + nameLen + extraLen
  const data = buf.slice(start, start + entry.compSize)
  let raw
  if (entry.method === 0) raw = data
  else if (entry.method === 8) raw = inflateRaw(data)
  else throw new Error('zip 使用了不支持的压缩方式')
  try {
    return decodeUtf8(raw)
  } catch (_) {
    return latin1Decode(raw)
  }
}

// 加载 zip：返回 { paths, readText }
export function loadZip(buf) {
  const files = parseZipEntries(buf)
  return {
    paths: Object.keys(files),
    readText(path) { return readZipEntryText(buf, files[path]) }
  }
}
