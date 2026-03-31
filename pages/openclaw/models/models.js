const { getData } = require('../../../utils/util')

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 88,
    refreshing: false,
    loading: false,
    probing: false,
    probeProgress: 0,
    models: []
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menuBtn = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : { top: 26, height: 32 }
    const statusBarHeight = sysInfo.statusBarHeight || 20
    const navBarHeight = statusBarHeight + menuBtn.height + (menuBtn.top - statusBarHeight) * 2
    this.setData({ statusBarHeight, navBarHeight })
  },

  onShow() { this.loadModels() },
  goBack() { wx.navigateBack() },
  refreshAll() { this.setData({ refreshing: true }); this.loadModels() },
  onPullRefresh() { this.refreshAll() },

  async loadModels() {
    const config = getData('openclawConfig', null)
    if (!config || !config.serverUrl) return
    this.setData({ loading: true })

    try {
      const res = await this.callCloud('getModels', config)
      if (res.success && res.data) {
        const colors = ['#007AFF', '#FF9500', '#AF52DE', '#FF3B30', '#34C759', '#5AC8FA', '#FF2D55', '#FFCC00']
        let list = []
        if (Array.isArray(res.data)) list = res.data
        else if (res.data.data && Array.isArray(res.data.data)) list = res.data.data
        else if (res.data.models && Array.isArray(res.data.models)) list = res.data.models

        const models = list.map((m, i) => ({
          id: m.id || m.name || '',
          name: m.id || m.name || '--',
          owned_by: m.owned_by || '',
          color: colors[i % colors.length],
          probeStatus: '',
          probeClass: '',
          probeStatusText: '',
          probeMs: 0,
          testing: false
        }))

        this.setData({ models })
      }
    } catch (e) {
      console.error('[Models]', e)
    }

    this.setData({ loading: false, refreshing: false })
  },

  // 测试单个模型
  async probeModel(e) {
    const idx = e.currentTarget.dataset.index
    const model = this.data.models[idx]
    if (!model || model.testing) return

    const config = getData('openclawConfig', null)
    if (!config) return

    this.setData({ [`models[${idx}].testing`]: true })

    try {
      const start = Date.now()
      const res = await this.callCloud('probeModel', config, { modelId: model.id })
      const elapsed = Date.now() - start

      let probeStatus = 'error'
      let probeClass = 'error'
      let probeStatusText = '失败'

      if (res.success) {
        probeStatus = 'ok'
        probeClass = 'ok'
        probeStatusText = '可用'
      } else if (res.error && res.error.includes('401')) {
        probeStatus = 'auth'
        probeClass = 'auth'
        probeStatusText = '认证失败'
      } else if (res.error && res.error.includes('超时')) {
        probeStatus = 'timeout'
        probeClass = 'timeout'
        probeStatusText = '超时'
      }

      this.setData({
        [`models[${idx}].probeStatus`]: probeStatus,
        [`models[${idx}].probeClass`]: probeClass,
        [`models[${idx}].probeStatusText`]: probeStatusText,
        [`models[${idx}].probeMs`]: elapsed,
        [`models[${idx}].testing`]: false
      })
    } catch (err) {
      this.setData({
        [`models[${idx}].probeStatus`]: 'error',
        [`models[${idx}].probeClass`]: 'error',
        [`models[${idx}].probeStatusText`]: '异常',
        [`models[${idx}].testing`]: false
      })
    }
  },

  // 全部测试
  async probeAll() {
    if (this.data.probing) return
    this.setData({ probing: true, probeProgress: 0 })

    for (let i = 0; i < this.data.models.length; i++) {
      this.setData({ probeProgress: i + 1 })
      await this.probeModelByIndex(i)
    }

    this.setData({ probing: false })
    wx.showToast({ title: '测试完成', icon: 'success' })
  },

  async probeModelByIndex(idx) {
    const model = this.data.models[idx]
    if (!model) return

    const config = getData('openclawConfig', null)
    if (!config) return

    this.setData({ [`models[${idx}].testing`]: true })

    try {
      const start = Date.now()
      const res = await this.callCloud('probeModel', config, { modelId: model.id })
      const elapsed = Date.now() - start

      const ok = res.success
      this.setData({
        [`models[${idx}].probeStatus`]: ok ? 'ok' : 'error',
        [`models[${idx}].probeClass`]: ok ? 'ok' : 'error',
        [`models[${idx}].probeStatusText`]: ok ? '可用' : '失败',
        [`models[${idx}].probeMs`]: elapsed,
        [`models[${idx}].testing`]: false
      })
    } catch (err) {
      this.setData({
        [`models[${idx}].probeStatus`]: 'error',
        [`models[${idx}].probeClass`]: 'error',
        [`models[${idx}].probeStatusText`]: '异常',
        [`models[${idx}].testing`]: false
      })
    }
  },

  callCloud(action, config, extra) {
    return new Promise((resolve) => {
      wx.cloud.callFunction({
        name: 'openClawProxy',
        data: { action, serverUrl: config.serverUrl, apiToken: config.apiToken || '', ...(extra || {}) },
        success: (r) => resolve(r.result || {}),
        fail: (err) => resolve({ success: false, error: err.errMsg })
      })
    })
  }
})
