/**
 * 通用工具函数
 */

// 生成唯一ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

// 格式化日期
function formatDate(date, format = 'YYYY-MM-DD') {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
}

// 计算剩余天数
function daysRemaining(dateStr) {
  if (!dateStr) return -1
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  const diff = target.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// 获取到期状态文本和类型
function getExpireStatus(dateStr) {
  const days = daysRemaining(dateStr)
  if (days < 0) return { text: '已过期', type: 'danger', days }
  if (days === 0) return { text: '今天到期', type: 'danger', days }
  if (days <= 7) return { text: `${days}天后到期`, type: 'warning', days }
  if (days <= 30) return { text: `${days}天后到期`, type: 'warning', days }
  return { text: `${days}天后到期`, type: 'success', days }
}

// 显示Toast
function showToast(title, icon = 'none') {
  wx.showToast({ title, icon, duration: 1500 })
}

// 显示确认弹窗
function showConfirm(title, content) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmColor: '#007AFF',
      success(res) {
        resolve(res.confirm)
      }
    })
  })
}

// 复制到剪贴板
function copyText(text) {
  wx.setClipboardData({
    data: text,
    success() {
      showToast('已复制')
    }
  })
}

// 数据持久化
function saveData(key, data) {
  try {
    wx.setStorageSync(key, data)
    return true
  } catch (e) {
    showToast('保存失败')
    return false
  }
}

function getData(key, defaultVal = []) {
  try {
    return wx.getStorageSync(key) || defaultVal
  } catch (e) {
    return defaultVal
  }
}

module.exports = {
  generateId,
  formatDate,
  daysRemaining,
  getExpireStatus,
  showToast,
  showConfirm,
  copyText,
  saveData,
  getData
}
