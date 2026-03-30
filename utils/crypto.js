/**
 * 简易加密工具 - 用于本地数据保护
 * 注意：这不是强加密，仅防止直接阅读明文
 * 后续可替换为更安全的加密方案
 */

const KEY = 'PrivateToolbox2026'

function encrypt(text) {
  if (!text) return ''
  let result = ''
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length)
    result += String.fromCharCode(charCode)
  }
  return wx.arrayBufferToBase64(
    new Uint8Array(result.split('').map(c => c.charCodeAt(0))).buffer
  )
}

function decrypt(encoded) {
  if (!encoded) return ''
  try {
    const buffer = wx.base64ToArrayBuffer(encoded)
    const arr = new Uint8Array(buffer)
    let text = ''
    for (let i = 0; i < arr.length; i++) {
      text += String.fromCharCode(arr[i])
    }
    let result = ''
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length)
      result += String.fromCharCode(charCode)
    }
    return result
  } catch (e) {
    return ''
  }
}

module.exports = { encrypt, decrypt }
