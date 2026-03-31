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

  // 【优化】改为异步初始化 Storage，避免阻塞启动
  initStorage() {
    const defaults = {
      passwords: [],
      subscriptions: [],
      notes: [],
      settings: {
        passwordProtect: false,
        password: '',
        autoLock: true,
        lockTimeout: 5,
        cloudSync: false
      },
      userInfo: null
    }

    const keys = Object.keys(defaults)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      try {
        const val = wx.getStorageSync(key)
        if (!val) {
          // 使用异步 setStorage 避免阻塞主线程
          wx.setStorage({ key, data: defaults[key] })
        }
      } catch (e) {
        wx.setStorage({ key, data: defaults[key] })
      }
    }
  },

  globalData: {
    isUnlocked: false,
    themeColor: '#007AFF',
    version: '1.1.0',
    userInfo: null
  }
})
