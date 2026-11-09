// 极简 hash 路由：#/ 首页、#/converter 文本转换、#/reader 在线阅读

const SCREENS = {
  home: 'screen-home',
  converter: 'screen-converter',
  reader: 'screen-reader'
}

const TITLES = {
  home: '工具箱',
  converter: '文本转换',
  reader: '在线阅读'
}

let current = null
let handlers = {}

function routeFromHash() {
  const name = (location.hash || '').replace(/^#\/?/, '').trim()
  return SCREENS[name] ? name : 'home'
}

function hashOf(name) {
  return name === 'home' ? '#/' : '#/' + name
}

function apply(name) {
  if (name === current) return
  const prev = current
  if (prev && handlers.leave) handlers.leave(prev)
  current = name
  Object.keys(SCREENS).forEach((key) => {
    const el = document.getElementById(SCREENS[key])
    if (el) el.classList.toggle('active', key === name)
  })
  document.title = TITLES[name]
  // 注意：不要用 dataset.route，否则 closest('[data-route]') 会命中文档根节点
  document.documentElement.dataset.screen = name
  if (handlers.enter) handlers.enter(name)
}

// 进入指定页面（写入浏览器历史）
export function go(name) {
  if (!SCREENS[name]) return
  if (name === current && location.hash === hashOf(name)) return
  const depth = (history.state && history.state.depth) || 0
  history.pushState({ depth: depth + 1 }, '', hashOf(name))
  apply(name)
}

// 返回上一页；没有站内历史时回退到 fallback
export function back(fallback = 'home') {
  const depth = (history.state && history.state.depth) || 0
  if (depth > 0) history.back()
  else go(fallback)
}

export function currentRoute() {
  return current
}

// 初始化路由；handlers = { enter(name), leave(name) }
export function initRouter(navHandlers = {}) {
  handlers = navHandlers || {}

  // 统一处理 data-nav / data-back 按钮
  document.addEventListener('click', (e) => {
    const navEl = e.target.closest('[data-nav]')
    if (navEl) {
      go(navEl.dataset.nav)
      return
    }
    const backEl = e.target.closest('[data-back]')
    if (backEl) {
      back(backEl.dataset.back || 'home')
    }
  })

  history.replaceState({ depth: 0 }, '', location.hash ? location.hash : hashOf(routeFromHash()))
  apply(routeFromHash())

  window.addEventListener('popstate', () => {
    apply(routeFromHash())
  })
}
