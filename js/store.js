// 轻量全局数据：替代小程序 app.globalData，用于大文本跨页面传递

let readerPayload = null

// 存入待阅读内容 { text, fileName }
export function setReaderPayload(payload) {
  readerPayload = payload
}

export function getReaderPayload() {
  return readerPayload
}

// 离开阅读页时释放大文本引用
export function clearReaderPayload() {
  readerPayload = null
}
