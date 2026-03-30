App({
  onLaunch() {
    // 初始化本地存储结构
    this.initStorage()
  },

  initStorage() {
    // 密码本数据
    if (!wx.getStorageSync('passwords')) {
      wx.setStorageSync('passwords', [])
    }
    // 订阅管理数据
    if (!wx.getStorageSync('subscriptions')) {
      wx.setStorageSync('subscriptions', [])
    }
    // 应用设置
    if (!wx.getStorageSync('settings')) {
      wx.setStorageSync('settings', {
        passwordProtect: false,
        password: '',
        autoLock: true,
        lockTimeout: 5 // 分钟
      })
    }
  },

  globalData: {
    isUnlocked: false, // 密码本解锁状态
    themeColor: '#007AFF',
    version: '1.0.0'
  }
})
