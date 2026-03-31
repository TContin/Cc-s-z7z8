const { getData, saveData, showToast } = require('../../../utils/util')

Page({
  data: {
    serverUrl: '',
    apiToken: '',
    configured: false,
    testing: false
  },

  onLoad() {
    const config = getData('openclawConfig', null)
    if (config) {
      this.setData({
        serverUrl: config.serverUrl || '',
        apiToken: config.apiToken || '',
        configured: !!(config.serverUrl)
      })
    }
  },

  onServerUrlInput(e) {
    this.setData({ serverUrl: e.detail.value.trim() })
  },

  onApiTokenInput(e) {
    this.setData({ apiToken: e.detail.value.trim() })
  },

  async testConnection() {
    const { serverUrl, apiToken } = this.data
    if (!serverUrl) {
      showToast('请输入服务器地址')
      return
    }

    this.setData({ testing: true })

    try {
      const res = await new Promise((resolve) => {
        wx.cloud.callFunction({
          name: 'openClawProxy',
          data: {
            action: 'testConnection',
            serverUrl: serverUrl,
            apiToken: apiToken
          },
          success: (r) => resolve(r.result || {}),
          fail: (err) => resolve({ success: false, error: err.errMsg })
        })
      })

      if (res.success) {
        showToast('连接成功 ✅')
      } else {
        wx.showModal({
          title: '连接失败',
          content: res.error || '无法连接到 OpenClaw 服务器，请检查地址和网络',
          showCancel: false,
          confirmColor: '#007AFF'
        })
      }
    } catch (err) {
      wx.showModal({
        title: '连接异常',
        content: err.message || '请检查网络',
        showCancel: false,
        confirmColor: '#007AFF'
      })
    }

    this.setData({ testing: false })
  },

  saveConfig() {
    const { serverUrl, apiToken } = this.data
    if (!serverUrl) {
      showToast('请输入服务器地址')
      return
    }

    // 确保 URL 格式正确
    let url = serverUrl
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url
    }

    const config = {
      serverUrl: url,
      apiToken: apiToken,
      updatedAt: new Date().toISOString()
    }

    saveData('openclawConfig', config)
    showToast('保存成功')
    this.setData({ configured: true })

    setTimeout(() => {
      wx.navigateBack()
    }, 800)
  },

  clearConfig() {
    wx.showModal({
      title: '确认清除',
      content: '清除后仪表盘将不再显示 OpenClaw 监控数据',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('openclawConfig')
          this.setData({
            serverUrl: '',
            apiToken: '',
            configured: false
          })
          showToast('已清除')
        }
      }
    })
  }
})
