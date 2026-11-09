// 文本转换页：小说章节标题格式统一（选择 txt / epub / mobi → 预览 → 转换 → 保存）
import { decodeAuto } from './decoder.js'
import { convertChapterTitles, countConvertedTitles } from './chapter.js'
import { extractEpubText } from './epub.js'
import { extractMobiText } from './mobi.js'
import { setReaderPayload } from './store.js'
import { go } from './router.js'
import { showLoading, hideLoading, nextFrame } from './ui.js'

// 预览区最多展示的字符数（超长文本截断展示，转换/保存仍基于预览内容）
const PREVIEW_LIMIT = 100000

const ACCEPT_MAIN = '.txt,.epub,.mobi,text/plain,application/epub+zip'
const ACCEPT_EPUB = '.epub,application/epub+zip'

const state = {
  fileName: '未选择',
  baseName: 'output',
  fullText: '',
  canConvert: false,
  canDownload: false,
  busy: false
}

// load = 常规流程；epub = EPUB 快速转 TXT
let pickMode = 'load'
const el = {}

export function initConverter() {
  el.fileName = document.getElementById('file-name')
  el.fileInput = document.getElementById('file-input')
  el.preview = document.getElementById('preview')
  el.status = document.getElementById('status')
  el.btnChoose = document.getElementById('btn-choose')
  el.btnConvert = document.getElementById('btn-convert')
  el.btnSave = document.getElementById('btn-save')
  el.btnEpub = document.getElementById('btn-epub')
  el.btnReader = document.getElementById('btn-reader')

  el.btnChoose.addEventListener('click', () => pickFile('load'))
  el.btnEpub.addEventListener('click', () => pickFile('epub'))
  el.fileInput.addEventListener('change', onFileChange)
  el.btnConvert.addEventListener('click', onConvert)
  el.btnSave.addEventListener('click', onSave)
  el.btnReader.addEventListener('click', onOpenReader)

  // iOS 键盘弹出后把预览区滚到可视区域
  el.preview.addEventListener('focus', () => {
    setTimeout(() => el.preview.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
  })

  hideStatus()
  updateButtons()
}

/* ---------- 状态提示 ---------- */
function showStatus(msg, type) {
  el.status.textContent = msg
  el.status.className = 'status status-' + (type || 'info')
}

function hideStatus() {
  el.status.className = 'status hidden'
}

function updateButtons() {
  el.btnConvert.classList.toggle('btn-disabled', !state.canConvert)
  el.btnConvert.disabled = !state.canConvert
  el.btnSave.classList.toggle('btn-disabled', !state.canDownload)
  el.btnSave.disabled = !state.canDownload
  el.btnReader.classList.toggle('btn-disabled', !state.canConvert)
  el.btnReader.disabled = !state.canConvert
}

function setFileName(name) {
  state.fileName = name
  el.fileName.textContent = name
}

function errorMessage(err) {
  return (err && (err.message || err.toString())) || '未知错误'
}

/* ---------- 选择文件 ---------- */
function pickFile(mode) {
  pickMode = mode
  el.fileInput.accept = mode === 'epub' ? ACCEPT_EPUB : ACCEPT_MAIN
  el.fileInput.value = ''
  el.fileInput.click()
}

function onFileChange(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  const mode = pickMode
  pickMode = 'load'
  if (mode === 'epub') quickConvertEpub(file)
  else loadFile(file)
}

function extOf(name) {
  const idx = String(name).lastIndexOf('.')
  return idx === -1 ? '' : String(name).slice(idx + 1).toLowerCase()
}

function baseOf(name) {
  return String(name).replace(/\.[^.]+$/, '') || 'output'
}

/* ---------- 常规流程：加载文件 ---------- */
async function loadFile(file) {
  const ext = extOf(file.name)
  state.baseName = baseOf(file.name)
  state.canConvert = false
  state.canDownload = false
  updateButtons()
  hideStatus()
  setFileName(file.name)

  if (['txt', 'epub', 'mobi'].indexOf(ext) === -1) {
    showStatus('不支持的文件类型：.' + ext + '（仅支持 txt / epub / mobi）', 'error')
    return
  }

  showLoading('正在解析文件…')
  await nextFrame()
  try {
    const buf = await file.arrayBuffer()
    let text
    if (ext === 'txt') text = decodeAuto(new Uint8Array(buf))
    else if (ext === 'epub') text = extractEpubText(buf)
    else text = extractMobiText(buf)

    if (!text || !text.trim()) throw new Error('未能从文件中提取到文本内容')

    state.fullText = text
    const truncated = applyPreview(text)
    state.canConvert = true
    updateButtons()

    if (truncated) {
      showStatus('文件加载成功，共 ' + text.length + ' 个字符；文本过长，预览仅展示前 ' + PREVIEW_LIMIT + ' 个字符（转换/保存也只处理该部分内容）。', 'info')
    } else {
      showStatus('文件加载成功，共 ' + text.length + ' 个字符。可先检查预览内容，再点击「转换」。', 'success')
    }
  } catch (err) {
    state.canConvert = false
    updateButtons()
    showStatus('加载失败：' + errorMessage(err), 'error')
  } finally {
    hideLoading()
  }
}

// 设置预览内容（超长截断展示），返回是否被截断
function applyPreview(text) {
  const truncated = text.length > PREVIEW_LIMIT
  el.preview.value = truncated ? text.slice(0, PREVIEW_LIMIT) : text
  return truncated
}

/* ---------- 转换：统一章节标题格式 ---------- */
async function onConvert() {
  if (!state.canConvert || state.busy) return
  const rawText = el.preview.value
  if (!rawText.trim()) {
    showStatus('预览内容为空，无法转换', 'error')
    return
  }

  state.busy = true
  showLoading('转换中…')
  await nextFrame()
  try {
    const converted = convertChapterTitles(rawText)
    const count = countConvertedTitles(converted)
    el.preview.value = converted
    state.canDownload = true
    updateButtons()
    showStatus('转换完成！共识别并统一 ' + count + ' 个章节标题，可继续编辑或点击「保存」。', 'success')
  } catch (err) {
    showStatus('转换失败：' + errorMessage(err), 'error')
  } finally {
    state.busy = false
    hideLoading()
  }
}

/* ---------- 保存（iPhone 上优先走系统分享 → 存储到「文件」） ---------- */
async function onSave() {
  if (!state.canDownload) return
  // 以预览区当前内容为准（用户可能转换后又编辑过），保存前再统一转换一次
  try {
    const content = convertChapterTitles(el.preview.value)
    showStatus('正在生成文件…', 'info')
    const msg = await saveTextFile(content, state.baseName + '_已转换.txt')
    showStatus(msg, 'success')
  } catch (err) {
    showStatus('保存失败：' + errorMessage(err), 'error')
  }
}

// 生成带 BOM 的 UTF-8 txt：能分享则调起系统分享，否则走浏览器下载
async function saveTextFile(content, filename) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' })
  let file = null
  try {
    file = new File([blob], filename, { type: 'text/plain' })
  } catch (_) {
    file = null
  }

  if (file && navigator.canShare) {
    let canShare = false
    try {
      canShare = navigator.canShare({ files: [file] })
    } catch (_) {
      canShare = false
    }
    if (canShare) {
      try {
        await navigator.share({ files: [file], title: filename })
        return '已保存：' + filename + '（在分享菜单中选择「存储到"文件"」即可保存到「文件」App）。'
      } catch (err) {
        if (err && err.name === 'AbortError') return '已取消保存。'
        // 分享失败时继续走下载兜底
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 20000)
  return '已生成 ' + filename + '，如未自动下载，请在浏览器下载列表或「文件」App 中查看。'
}

/* ---------- EPUB → TXT 快速转换（仅提取正文，不做章节格式化） ---------- */
async function quickConvertEpub(file) {
  const ext = extOf(file.name)
  if (ext !== 'epub') {
    showStatus('该功能仅支持 .epub 文件，当前选择的是 .' + ext, 'error')
    return
  }
  const name = baseOf(file.name)
  hideStatus()
  showLoading('正在解析 EPUB…')
  await nextFrame()

  let text
  try {
    const buf = await file.arrayBuffer()
    text = extractEpubText(buf)
    if (!text || !text.trim()) throw new Error('未能从 EPUB 中提取到文本内容')
  } catch (err) {
    hideLoading()
    showStatus('转换失败：' + errorMessage(err), 'error')
    return
  }
  hideLoading()

  // 同步到预览区，方便查看；并允许继续使用「转换」统一章节标题
  state.baseName = name
  state.fullText = text
  setFileName(file.name)
  applyPreview(text)
  state.canConvert = true
  state.canDownload = true
  updateButtons()

  try {
    const msg = await saveTextFile(text, name + '.txt')
    showStatus('转换成功！共 ' + text.length + ' 个字符。' + msg + ' 如需统一章节标题，可继续点击「转换」。', 'success')
  } catch (err) {
    showStatus('EPUB 已解析完成（共 ' + text.length + ' 个字符），但保存失败：' + errorMessage(err) + '，可点击「保存」重试。', 'error')
  }
}

/* ---------- 在线阅读：跳转阅读页（左目录 + 右正文） ---------- */
function onOpenReader() {
  if (!state.canConvert) return
  const text = el.preview.value
  if (!text || !text.trim()) {
    showStatus('预览内容为空，无法在线阅读', 'error')
    return
  }
  // 文本可能很大，通过全局 store 传递，不走 URL
  setReaderPayload({ text, fileName: state.fileName })
  go('reader')
}
