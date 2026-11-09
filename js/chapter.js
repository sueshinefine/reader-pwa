// 章节标题识别与统一（与小程序 utils/chapter.js 完全一致）

// 中文数字 → 阿拉伯数字（支持 一 ~ 数千 的常见章节编号）
function cnNumSimple(cn) {
  const d = { '零': 0, '〇': 0, '一': 1, '壹': 1, '二': 2, '两': 2, '贰': 2, '三': 3, '叁': 3, '四': 4, '肆': 4, '五': 5, '伍': 5, '六': 6, '陆': 6, '七': 7, '柒': 7, '八': 8, '捌': 8, '九': 9, '玖': 9 }
  const u = { '十': 10, '拾': 10, '百': 100, '佰': 100, '千': 1000, '仟': 1000 }
  if (/^\d+$/.test(cn)) return String(parseInt(cn, 10))
  let section = 0, number = 0
  for (const ch of cn) {
    if (ch in d) {
      number = d[ch]
    } else if (ch in u) {
      if (number === 0) number = 1 // 「十五」=> 15
      section += number * u[ch]
      number = 0
    }
  }
  const total = section + number
  return total > 0 ? String(total) : cn // 无法解析则保留原样
}

// 非标准章节行检测：形如「第章NO XXX」「第章 XXX」「章 XXX」，缺少章节编号
const NO_NUM_CHAPTER_PATTERNS = [
  /^第\s*[章回节]\s*(?:NO\.?|No\.?|no\.?|№)\s*[：:、，,\s]?\s*(\S.{0,50})?$/, // 第章NO 测试1
  /^第\s*[章回节]\s*[：:、，,]?\s*(\S.{0,50})?$/,                                // 第章 测试1
  /^[章回节]\s*[：:、，,]?\s*(\S.{0,50})?$/                                       // 章 测试1
]

// 对缺少编号的章节行，按出现顺序自动补全章节序号
function repairMissingChapterNumbers(lines) {
  // 统计各模式命中次数，只有单一模式重复出现时才视为章节标记，避免误伤普通正文
  const counts = NO_NUM_CHAPTER_PATTERNS.map(() => 0)
  lines.forEach(line => {
    const t = line.trim()
    NO_NUM_CHAPTER_PATTERNS.forEach((re, i) => { if (re.test(t)) counts[i]++ })
  })
  if (!counts.some(c => c >= 2)) return lines

  // 以文中最近一次出现的标准章节号为基准续排，没有则从 1 开始
  const reStd = /第\s*([0-9零〇一壹二两贰三叁四肆五伍六陆七柒八捌九玖十拾百佰千仟]{1,10})\s*[章回节]/
  const PATTERN_STD = -2 // 标准章节行的模式标记
  let counter = 0, lastPattern = PATTERN_STD
  return lines.map(line => {
    const trimmed = line.trim()
    const std = trimmed.match(reStd)
    if (std) {
      const n = parseInt(cnNumSimple(std[1]), 10)
      if (!isNaN(n)) counter = n
      lastPattern = PATTERN_STD
      return line
    }
    for (let i = 0; i < NO_NUM_CHAPTER_PATTERNS.length; i++) {
      if (counts[i] < 2) continue
      const m = trimmed.match(NO_NUM_CHAPTER_PATTERNS[i])
      if (!m) continue
      if (i !== lastPattern) { // 换非标准模式时重新计数；紧随标准章节则续排
        if (lastPattern !== PATTERN_STD) counter = 0
        lastPattern = i
      }
      counter++
      const title = (m[1] || '').trim()
      return '第' + counter + '章' + (title ? ' ' + title : '')
    }
    return line
  })
}

function cleanTitle(s) {
  return (s || '')
    .replace(/^[ \t\u3000:：、，,\.。\-—_]+/, '')
    .replace(/[ \t\u3000]+$/, '')
    .replace(/\s{2,}/g, ' ')
}

function looksLikeTitle(s) {
  // 排除正文中以数字开头的普通句子（含句末标点则视为正文）
  return !/[。！？；]$/g.test(s.trim()) && s.trim().length <= 50
}

// 「数字+内容」类判定：排除正文中以数字开头的数量、日期、金额等句子
function looksLikeDirectTitle(s) {
  const t = (s || '').trim()
  if (!looksLikeTitle(t)) return false // 含句末标点或过长 => 正文
  const body = t.replace(/^[章回节卷]\s*/, '') // 兼容「1章 标题」写法
  if (body.length < 2) return false // 如「3个」「5元」等过短的行
  // 数字后紧跟计量/时间等单位时视为正文
  if (/^[年月日号时点分秒元块角毛个只支枝条根张页篇位员家人户次趟遍倍折米厘克斤吨升度天周旬届岁级班%％℃]/.test(body)) return false
  // 句中带句末标点，说明是正文句子
  if (/[。！？；]/.test(body)) return false
  return true
}

// 章节标题识别与统一：统一为「第X章 标题」格式
export function convertChapterTitles(text) {
  const lines = repairMissingChapterNumbers(text.replace(/\r\n?/g, '\n').split('\n'))
  const out = []
  let prevBlank = false

  // 「第X章」类：中文/阿拉伯数字，允许空格与「卷/节/回/部分」等变体
  const reChapter = /^[ \t\u3000]*(?:正文[：:]\s*|【[^】]{0,10}】\s*)?第\s*([0-9零〇一壹二两贰三叁四肆五伍六陆七柒八捌九玖十拾百佰千仟]{1,10})\s*[章回节]\s*(.*)$/
  // 「Chapter N」类
  const reChapterEn = /^[ \t\u3000]*(?:正文[：:]\s*)?chapter\s*(\d+)\s*(.*)$/i
  // 「N. 标题」/「N、标题」类（仅当整行较短且像标题）
  const reNumDot = /^[ \t\u3000]*(\d{1,5})\s*[\.、．]\s*(\S.{0,50})$/
  // 「N标题」类（数字后直接跟内容，如「1测试内容」）
  const reNumDirect = /^[ \t\u3000]*(\d{1,4})[ \t\u3000]*([^\s\d].{0,50})$/

  for (const rawLine of lines) {
    const line = rawLine
    let matched = null

    let m = line.match(reChapter)
    if (m) {
      matched = { num: cnNumSimple(m[1].replace(/\s+/g, '')), title: cleanTitle(m[2]) }
    } else if ((m = line.match(reChapterEn))) {
      matched = { num: m[1], title: cleanTitle(m[2]) }
    } else if ((m = line.match(reNumDot)) && looksLikeTitle(m[2])) {
      matched = { num: m[1], title: cleanTitle(m[2]) }
    } else if ((m = line.match(reNumDirect)) && looksLikeDirectTitle(m[2])) {
      matched = { num: m[1], title: cleanTitle(m[2].replace(/^[章回节卷]\s*/, '')) }
    }

    if (matched) {
      // 标题行：统一为「第X章 标题」，独占一行、行首无空格
      if (out.length && !prevBlank) out.push('') // 标题前保证空行
      out.push('第' + matched.num + '章' + (matched.title ? ' ' + matched.title : ''))
      out.push('') // 标题后空一行
      prevBlank = true
    } else {
      const content = line.replace(/[ \t\u3000]+$/g, '')
      if (content === '') {
        if (!prevBlank) out.push('')
        prevBlank = true
      } else {
        out.push(content)
        prevBlank = false
      }
    }
  }
  return out.join('\n').trim() + '\n'
}

export function countConvertedTitles(text) {
  const m = text.match(/^第\d+章/gm)
  return m ? m.length : 0
}

// 阅读用章节解析：按「第X章/回/节/卷」「Chapter N」「N. 标题」标题行切分文本。
// 返回 [{ id, title, paras }]：title 保留原文写法；首个标题前的非空内容归入「前言」；
// 未识别到任何章节时整篇归入「全文」。
export function parseChapters(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')

  const reChapter = /^[ \t\u3000]*(?:正文[：:]\s*|【[^】]{0,10}】\s*)?第\s*([0-9零〇一壹二两贰三叁四肆五伍六陆七柒八捌九玖十拾百佰千仟]{1,10})\s*[章回节卷]\s*(.*)$/
  const reChapterEn = /^[ \t\u3000]*(?:正文[：:]\s*)?chapter\s*(\d+)\s*(.*)$/i
  const reNumDot = /^[ \t\u3000]*(\d{1,5})\s*[\.、．]\s*(\S.{0,50})$/

  const isChapterLine = (t) => {
    if (!t) return false
    if (reChapter.test(t) || reChapterEn.test(t)) return true
    const m = t.match(reNumDot)
    return !!(m && looksLikeTitle(m[2]))
  }

  const raw = []
  let cur = null
  const flush = () => {
    if (!cur) return
    // 去掉章节正文首尾的空行
    let a = 0
    let b = cur.lines.length
    while (a < b && cur.lines[a] === '') a++
    while (b > a && cur.lines[b - 1] === '') b--
    cur.lines = cur.lines.slice(a, b)
    // 丢弃只有空行的「前言」
    if (!(cur.title === '前言' && cur.lines.length === 0)) raw.push(cur)
    cur = null
  }

  lines.forEach((line) => {
    const t = line.trim()
    if (isChapterLine(t)) {
      flush()
      cur = { title: t.replace(/\s{2,}/g, ' '), lines: [] }
    } else {
      if (!cur) cur = { title: '前言', lines: [] }
      cur.lines.push(line.replace(/[ \t\u3000]+$/, ''))
    }
  })
  flush()

  if (!raw.length) {
    raw.push({ title: '全文', lines: lines.map((l) => l.replace(/[ \t\u3000]+$/, '')) })
  } else if (raw.length === 1 && raw[0].title === '前言') {
    // 未识别到任何真实章节，整篇都是这一段内容
    raw[0].title = '全文'
  }

  return raw.map((c, i) => ({
    id: i,
    title: c.title,
    paras: c.lines.map((line, j) => ({ id: j, text: line }))
  }))
}
