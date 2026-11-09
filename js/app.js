// 应用入口：初始化各页面、路由与 Service Worker
import { initRouter } from './router.js'
import { initConverter } from './converter.js'
import { initReader, enterReader, leaveReader } from './reader.js'

initConverter()
initReader()

initRouter({
  enter(name) {
    if (name === 'reader') enterReader()
  },
  leave(name) {
    if (name === 'reader') leaveReader()
  }
})

// 注册 Service Worker，支持离线使用（需 https 或 localhost）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // 非安全上下文（如通过局域网 http 访问）时注册失败，不影响正常使用
    })
  })
}
