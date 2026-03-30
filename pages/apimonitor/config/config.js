const { getData, saveData, showToast, showConfirm } = require('../../../utils/util')

Page({
  data: {
    baseUrl: 'https://api.aicodewith.com',
    apiKey: '',
    name: 'AI Code With',
    isEdit: false,
    presets: [
      { name: 'AI Code With', url: 'https://api.aicodewith.com' },
      { name: 'AI Code With (国内)', url: 'https://api.with7.cn' },
      { name: 'OpenAI', url: 'https://api.openai.com' },
      { name: '自定义', url: '' }
    ]
  },

  onLoad() {
    const config = getData('apiConfig', null)
    if (config) {
      this.setData({
        baseUrl: config.baseUrl || 'https://api.aicodewith.com',
        apiKey: config.apiKey || '',
        name: config.name || 'AI Code With',
        isEdit: true
      })
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value })
  },

  onPresetTap(e) {
    const preset = e.currentTarget.dataset.preset
    this.setData({
      name: preset.name,
      baseUrl: preset.url
    })
  },

  async onSave() {
    const { baseUrl, apiKey, name } = this.data

    if (!apiKey.trim()) {
      showToast('请输入 API Key')
      return
    }

    const config = {
      baseUrl: baseUrl.trim().replace(/\/$/, '') || 'https://api.aicodewith.com',
      apiKey: apiKey.trim(),
      name: name.trim() || 'API',
      updatedAt: new Date().toISOString()
    }

    // 测试连通性
    wx.showLoading({ title: '测试连接...' })
    try {
      const testResult = await new Promise((resolve, reject) => {
        wx.request({
          url: config.baseUrl + '/v1/models',
          method: 'GET',
          header: { 'Authorization': `Bearer ${config.apiKey}` },
          success: resolve,
          fail: reject,
          timeout: 8000
        })
      })

      wx.hideLoading()

      if (testResult.statusCode === 401) {
        showToast('API Key 无效')
        return
      }

      // 即使其他错误也保存（可能该端点不支持但余额查询支持）
    } catch (e) {
      wx.hideLoading()
      // 网络错误也允许保存
    }

    saveData('apiConfig', config)
    showToast('已保存')
    setTimeout(() => wx.navigateBack(), 500)
  },

  async onDelete() {
    const confirm = await showConfirm('删除配置', '确定要删除 API 配置吗？')
    if (confirm) {
      wx.removeStorageSync('apiConfig')
      showToast('已删除')
      setTimeout(() => wx.navigateBack(), 500)
    }
  }
})
