// 在线阅读页：左侧章节目录（可展开/收起），右侧正文（点击目录定位、滚动高亮）
import { parseChapters } from './chapter.js'
import { getReaderPayload, clearReaderPayload } from './store.js'
import { escapeHtml } from './ui.js'

// 滚动时判定「当前章节」的顶部阈值（px）
const ACTIVE_TOP_THRESHOLD = 80
const MOBILE_QUERY = '(max-width: 767px)'

const el = {}
let chapters = []
let chapterEls = []
let tocEls = []
let tops = []           // 各章顶部相对滚动内容顶部的偏移
let activeIndex = -1
let lockUntil = 0       // 程序化滚动期间暂停滚动高亮
let scrollTimer = null
let measureTimers = []
let mql = null

export function initReader() {
  el.body = document.getElementById('reader-body')
  el.tocScroll = document.getElementById('toc-scroll')
  el.tocTitle = document.getElementById('toc-title')
  el.content = document.getElementById('content-scroll')
  el.contentBody = document.getElementById('content-body')
  el.empty = document.getElementById('reader-empty')
  el.btnToc = document.getElementById('btn-toc')
  el.btnToggle = document.getElementById('btn-sidebar-toggle')
  el.backdrop = document.getElementById('sidebar-backdrop')

  el.content.addEventListener('scroll', onScroll, { passive: true })
  el.tocScroll.addEventListener('click', onTocClick)
  el.btnToc.addEventListener('click', onToggleToc)
  el.btnToggle.addEventListener('click', onToggleToc)
  el.backdrop.addEventListener('click', closeDrawer)

  mql = window.matchMedia(MOBILE_QUERY)
  const onViewportChange = () => {
    closeDrawer()
    el.body.classList.remove('toc-collapsed')
    setTimeout(measure, 200)
  }
  if (mql.addEventListener) mql.addEventListener('change', onViewportChange)
  else if (mql.addListener) mql.addListener(onViewportChange)
  window.addEventListener('orientationchange', () => setTimeout(measure, 300))
}

/* ---------- 进入 / 离开阅读页 ---------- */
export function enterReader() {
  const payload = getReaderPayload()
  const text = payload && payload.text ? payload.text : ''
  if (!text.trim()) {
    showEmpty()
    return
  }

  el.empty.classList.add('hidden')
  el.body.classList.remove('hidden')
  el.body.classList.remove('toc-open')
  el.body.classList.remove('toc-collapsed')

  chapters = parseChapters(text)
  render()
  el.content.scrollTop = 0
  el.tocScroll.scrollTop = 0
  activeIndex = -1
  setActive(0, false)

  measure()
  measureTimers.push(setTimeout(measure, 300))
  measureTimers.push(setTimeout(measure, 900))
}

export function leaveReader() {
  measureTimers.forEach((t) => clearTimeout(t))
  measureTimers = []
  if (scrollTimer) {
    clearTimeout(scrollTimer)
    scrollTimer = null
  }
  lockUntil = 0
  activeIndex = -1
  chapters = []
  chapterEls = []
  tocEls = []
  tops = []
  closeDrawer()
  el.body.classList.remove('toc-collapsed', 'hidden')
  el.contentBody.innerHTML = ''
  el.tocScroll.innerHTML = ''
  el.tocTitle.textContent = '📖 目录'
  el.content.scrollTop = 0
  el.empty.classList.add('hidden')
  // 释放大文本引用
  clearReaderPayload()
}

function showEmpty() {
  chapters = []
  chapterEls = []
  tocEls = []
  tops = []
  activeIndex = -1
  el.contentBody.innerHTML = ''
  el.tocScroll.innerHTML = ''
  el.body.classList.add('hidden')
  el.empty.classList.remove('hidden')
}

/* ---------- 渲染目录与正文 ---------- */
function render() {
  const tocParts = []
  const contentParts = []

  chapters.forEach((chapter, i) => {
    tocParts.push('<button type="button" class="toc-item" data-index="' + i + '">' + escapeHtml(chapter.title) + '</button>')

    let paras = ''
    for (const para of chapter.paras) {
      paras += para.text
        ? '<p class="para">' + escapeHtml(para.text) + '</p>'
        : '<p class="para para-blank"></p>'
    }
    contentParts.push(
      '<section class="chapter-block" id="chapter-' + i + '">' +
        '<h2 class="chapter-title">' + escapeHtml(chapter.title) + '</h2>' +
        paras +
      '</section>'
    )
  })

  el.tocScroll.innerHTML = tocParts.join('')
  el.contentBody.innerHTML = contentParts.join('')
  el.tocTitle.textContent = '📖 目录 · ' + chapters.length + ' 章'

  tocEls = Array.prototype.slice.call(el.tocScroll.children)
  chapterEls = Array.prototype.slice.call(el.contentBody.children)
  tops = []
}

/* ---------- 章节位置测量与滚动同步 ---------- */
function measure() {
  if (!chapterEls.length) {
    tops = []
    return
  }
  tops = chapterEls.map((item) => item.offsetTop)
}

function onScroll() {
  if (scrollTimer) return
  scrollTimer = setTimeout(() => {
    scrollTimer = null
    syncActive()
  }, 120)
}

function syncActive() {
  if (Date.now() < lockUntil) return
  if (tops.length !== chapters.length) measure()
  if (!tops.length) return
  const scrollTop = el.content.scrollTop
  let idx = 0
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= scrollTop + ACTIVE_TOP_THRESHOLD) idx = i
    else break
  }
  setActive(idx)
}

function setActive(index, scrollToc = true) {
  if (index === activeIndex) return
  activeIndex = index
  tocEls.forEach((item, i) => item.classList.toggle('toc-active', i === index))
  if (scrollToc) syncTocScroll(index)
}

// 让目录里的当前章节保持可见
function syncTocScroll(index) {
  const item = tocEls[index]
  if (!item) return
  const top = item.offsetTop
  const bottom = top + item.offsetHeight
  const viewTop = el.tocScroll.scrollTop
  const viewBottom = viewTop + el.tocScroll.clientHeight
  if (top < viewTop) el.tocScroll.scrollTop = top
  else if (bottom > viewBottom) el.tocScroll.scrollTop = bottom - el.tocScroll.clientHeight
}

/* ---------- 目录交互 ---------- */
function onTocClick(e) {
  const item = e.target.closest('.toc-item')
  if (!item) return
  jumpTo(Number(item.dataset.index))
  if (isMobile()) closeDrawer()
}

function jumpTo(index) {
  const block = chapterEls[index]
  if (!block) return
  setActive(index)
  lockUntil = Date.now() + 900
  block.scrollIntoView({ behavior: 'smooth', block: 'start' })
  setTimeout(() => {
    if (Date.now() >= lockUntil) syncActive()
  }, 950)
}

function isMobile() {
  return mql ? mql.matches : window.innerWidth < 768
}

function onToggleToc() {
  if (isMobile()) {
    el.body.classList.toggle('toc-open')
  } else {
    el.body.classList.toggle('toc-collapsed')
    setTimeout(measure, 150)
  }
}

function closeDrawer() {
  el.body.classList.remove('toc-open')
}
