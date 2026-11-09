// EPUB 正文提取（zip 解压 + OPF 阅读顺序 + 正则版 html 转文本）
import { loadZip } from './zip.js'

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)) } catch (e) { return '' }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(parseInt(d, 10)) } catch (e) { return '' }
    })
    .replace(/&amp;/g, '&')
}

// html → 纯文本（块级元素换行、去脚本样式）
function htmlToText(html) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  return s.replace(/\r\n?/g, '\n')
    .replace(/[ \t\u3000]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

// 处理 ../ 与相对路径
function normalizePath(path) {
  const segs = path.split('/')
  const stack = []
  for (const seg of segs) {
    if (seg === '..') stack.pop()
    else if (seg !== '.' && seg !== '') stack.push(seg)
  }
  return stack.join('/')
}

function resolveZipPath(path, paths) {
  const resolved = normalizePath(path)
  if (paths.indexOf(resolved) !== -1) return resolved
  // 兜底：按文件名模糊匹配
  const base = resolved.split('/').pop()
  return paths.find(p => p.endsWith('/' + base) || p === base) || resolved
}

// 从 OPF 获取 spine 阅读顺序对应的文件路径列表
function getSpineFiles(opfXml, opfDir, paths) {
  // manifest: id -> href
  const manifest = {}
  const itemRe = /<item\b[^>]*>/gi
  let m
  while ((m = itemRe.exec(opfXml))) {
    const tag = m[0]
    const id = (tag.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1]
    const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1]
    if (id && href) {
      try { manifest[id] = decodeURIComponent(href) } catch (_) { manifest[id] = href }
    }
  }
  // spine: 阅读顺序
  const spineMatch = opfXml.match(/<spine\b[\s\S]*?<\/spine>/i) || opfXml.match(/<spine\b[^>]*\/>/i)
  if (!spineMatch) return []
  const order = []
  const refRe = /<itemref\b[^>]*>/gi
  while ((m = refRe.exec(spineMatch[0]))) {
    const idref = (m[0].match(/\bidref\s*=\s*["']([^"']+)["']/i) || [])[1]
    if (idref && manifest[idref]) order.push(resolveZipPath(opfDir + manifest[idref], paths))
  }
  return order
}

// 提取 EPUB 正文，buf 为 ArrayBuffer/Uint8Array
export function extractEpubText(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const zip = loadZip(bytes)
  const paths = zip.paths

  // 1. 通过 OPF 文件获取章节阅读顺序
  let orderFiles = []
  const opfEntry = paths.find(p => p.toLowerCase().endsWith('.opf'))
  if (opfEntry) {
    const opfXml = zip.readText(opfEntry)
    const opfDir = opfEntry.includes('/') ? opfEntry.slice(0, opfEntry.lastIndexOf('/') + 1) : ''
    orderFiles = getSpineFiles(opfXml, opfDir, paths)
  }
  // 2. 找不到 spine 时退回：收集所有 xhtml/html 文件按名称排序
  if (!orderFiles.length) {
    orderFiles = paths.filter(p => /\.(x?html?)$/i.test(p)).sort()
  }
  if (!orderFiles.length) throw new Error('epub 中未找到正文内容')

  // 3. 逐个提取文本
  const parts = []
  for (const path of orderFiles) {
    if (paths.indexOf(path) === -1) continue
    const text = htmlToText(zip.readText(path))
    if (text.trim()) parts.push(text.trim())
  }
  if (!parts.length) throw new Error('epub 中未提取到文本内容')
  return parts.join('\n\n')
}
