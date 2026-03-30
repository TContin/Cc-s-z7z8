App({
  onLaunch() {
    this.initStorage()
    this.initCloud()
  },

  // 初始化云开发
  initCloud() {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-9gxt8t0lb8565367',
        traceUser: true
      })
    }
  },

  initStorage() {
    if (!wx.getStorageSync('passwords')) {
      wx.setStorageSync('passwords', [])
    }
    if (!wx.getStorageSync('subscriptions')) {
      wx.setStorageSync('subscriptions', [])
    }
    if (!wx.getStorageSync('settings')) {
      wx.setStorageSync('settings', {
        passwordProtect: false,
        password: '',
        autoLock: true,
        lockTimeout: 5,
        cloudSync: false
      })
    }
    if (!wx.getStorageSync('userInfo')) {
      wx.setStorageSync('userInfo', null)
    }
  },

  globalData: {
    isUnlocked: false,
    themeColor: '#007AFF',
    version: '1.1.0',
    userInfo: null
  }
})
