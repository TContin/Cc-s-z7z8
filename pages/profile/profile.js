const { getData, showConfirm, showToast } = require('../../utils/util')

Page({
  data: {
    settings: {},
    stats: {
      passwords: 0,
      subscriptions: 0,
      storageSize: '0 KB'
    },
    version: '1.0.0'
  },

  onShow() {
    this.loadSettings()
    this.loadStats()
  },

  loadSettings() {
    const settings = getData('settings', {
      passwordProtect: false,
      password: '',
      autoLock: true,
      lockTimeout: 5
    })
    this.setData({ settings })
  },

  loadStats() {
    const passwords = getData('passwords', [])
    const subscriptions = getData('subscriptions', [])
    
    // 估算存储大小
    const info = wx.getStorageInfoSync()
    
    this.setData({
      stats: {
        passwords: passwords.length,
        subscriptions: subscriptions.length,
        storageSize: (info.currentSize || 0) + ' KB'
      }
    })
  },

  onPasswordProtectChange(e) {
    const enabled = e.detail.value
    if (enabled) {
      // 开启密码保护，需要设置密码
      wx.showModal({
        title: '设置访问密码',
        editable: true,
        placeholderText: '请输入4-16位密码',
        confirmColor: '#007AFF',
        success: (res) => {
          if (res.confirm && res.content) {
            if (res.content.length < 4) {
              showToast('密码至少4位')
              return
            }
            const settings = this.data.settings
            settings.passwordProtect = true
            settings.password = res.content
            wx.setStorageSync('settings', settings)
            this.setData({ settings })
            showToast('密码保护已开启')
          }
        }
      })
    } else {
      const settings = this.data.settings
      settings.passwordProtect = false
      settings.password = ''
      wx.setStorageSync('settings', settings)
      getApp().globalData.isUnlocked = true
      this.setData({ settings })
      showToast('密码保护已关闭')
    }
  },

  onSecurityTap() {
    wx.navigateTo({ url: '/pages/profile/security/security' })
  },

  onAboutTap() {
    wx.navigateTo({ url: '/pages/profile/about/about' })
  },

  async onExportData() {
    const passwords = getData('passwords', [])
    const subscriptions = getData('subscriptions', [])
    
    // 生成摘要文本（不含敏感密码）
    let text = '=== 私人工具箱数据摘要 ===\n\n'
    text += `📊 统计：${passwords.length} 条密码，${subscriptions.length} 个订阅\n\n`
    
    text += '--- 密码记录 ---\n'
    passwords.forEach(p => {
      text += `• ${p.platform} (${p.account}) [${p.category}]\n`
    })

    text += '\n--- 订阅记录 ---\n'
    subscriptions.forEach(s => {
      text += `• ${s.name} - ${s.expireDate} (${s.cycle}${s.price ? ' ¥' + s.price : ''})\n`
    })

    wx.setClipboardData({
      data: text,
      success() {
        showToast('数据摘要已复制到剪贴板')
      }
    })
  },

  async onClearData() {
    const confirm = await showConfirm('清除数据', '确定要清除所有数据吗？此操作不可恢复！')
    if (confirm) {
      const confirm2 = await showConfirm('二次确认', '真的要清除所有密码和订阅数据吗？')
      if (confirm2) {
        wx.setStorageSync('passwords', [])
        wx.setStorageSync('subscriptions', [])
        showToast('数据已清除')
        this.loadStats()
      }
    }
  }
})
