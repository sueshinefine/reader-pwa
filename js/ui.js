// 通用 UI 工具：加载遮罩、HTML 转义、让出渲染帧

const loadingMask = () => document.getElementById('loading-mask')
const loadingText = () => document.getElementById('loading-text')

export function showLoading(text) {
  const mask = loadingMask()
  const label = loadingText()
  if (label) label.textContent = text || '处理中…'
  if (mask) mask.classList.remove('hidden')
}

export function hideLoading() {
  const mask = loadingMask()
  if (mask) mask.classList.add('hidden')
}

// 转义为 HTML 文本节点，避免正文中的 < > & 破坏结构
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 让浏览器先渲染 loading，再执行耗时同步任务
export function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 60))
}
