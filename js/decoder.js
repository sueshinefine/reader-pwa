// 文本编码解码（UTF-8 / GBK / Latin1），浏览器版
// 与小程序 utils/decoder.js 保持一致：先按 UTF-8 严格解码，失败回退 GBK

// 纯 JS UTF-8 严格解码，遇到非法字节序列抛错
function utf8DecodeStrict(bytes) {
  let out = ''
  let i = 0
  const n = bytes.length
  const chunks = []
  while (i < n) {
    const b1 = bytes[i++]
    let cp
    if (b1 < 0x80) {
      cp = b1
    } else if (b1 >= 0xC2 && b1 <= 0xDF) {
      if (i >= n) throw new Error('bad utf-8')
      const b2 = bytes[i++]
      if ((b2 & 0xC0) !== 0x80) throw new Error('bad utf-8')
      cp = ((b1 & 0x1F) << 6) | (b2 & 0x3F)
    } else if (b1 >= 0xE0 && b1 <= 0xEF) {
      if (i + 1 >= n) throw new Error('bad utf-8')
      const b2 = bytes[i++]
      const b3 = bytes[i++]
      if ((b2 & 0xC0) !== 0x80 || (b3 & 0xC0) !== 0x80) throw new Error('bad utf-8')
      cp = ((b1 & 0x0F) << 12) | ((b2 & 0x3F) << 6) | (b3 & 0x3F)
      if (cp < 0x800 || (cp >= 0xD800 && cp <= 0xDFFF)) throw new Error('bad utf-8')
    } else if (b1 >= 0xF0 && b1 <= 0xF4) {
      if (i + 2 >= n) throw new Error('bad utf-8')
      const b2 = bytes[i++]
      const b3 = bytes[i++]
      const b4 = bytes[i++]
      if ((b2 & 0xC0) !== 0x80 || (b3 & 0xC0) !== 0x80 || (b4 & 0xC0) !== 0x80) throw new Error('bad utf-8')
      cp = ((b1 & 0x07) << 18) | ((b2 & 0x3F) << 12) | ((b3 & 0x3F) << 6) | (b4 & 0x3F)
      if (cp < 0x10000 || cp > 0x10FFFF) throw new Error('bad utf-8')
    } else {
      throw new Error('bad utf-8')
    }
    chunks.push(String.fromCodePoint(cp))
    if (chunks.length >= 8192) {
      out += chunks.join('')
      chunks.length = 0
    }
  }
  return out + chunks.join('')
}

// Latin1 兜底解码
export function latin1Decode(bytes) {
  let out = ''
  const chunks = []
  for (let i = 0; i < bytes.length; i++) {
    chunks.push(String.fromCharCode(bytes[i]))
    if (chunks.length >= 8192) {
      out += chunks.join('')
      chunks.length = 0
    }
  }
  return out + chunks.join('')
}

export function stripBom(s) {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s
}

// UTF-8 严格解码，失败抛错
export function decodeUtf8(bytes) {
  return stripBom(utf8DecodeStrict(bytes))
}

let gbkDecoder = null
let gbkUnsupported = false

// GBK 解码，依赖浏览器的 TextDecoder('gbk')（iOS Safari 14+ 支持）
export function decodeGbk(bytes) {
  if (gbkUnsupported) {
    throw new Error('当前浏览器不支持 GBK 解码，请先把文件转为 UTF-8 编码')
  }
  if (!gbkDecoder) {
    try {
      gbkDecoder = new TextDecoder('gbk')
    } catch (_) {
      gbkUnsupported = true
      throw new Error('当前浏览器不支持 GBK 解码，请先把文件转为 UTF-8 编码')
    }
  }
  try {
    return stripBom(gbkDecoder.decode(bytes))
  } catch (err) {
    throw new Error('GBK 解码失败：' + (err.message || err))
  }
}

// 先按 UTF-8 严格解码，失败回退 GBK
export function decodeAuto(bytes) {
  try {
    return decodeUtf8(bytes)
  } catch (_) {
    return decodeGbk(bytes)
  }
}
