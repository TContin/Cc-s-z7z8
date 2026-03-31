const { getData } = require('../../../utils/util')

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 88,
    refreshing: false,
    loading: false,
    probing: false,
    probeProgress: 0,
    models: [],
    currentModel: '',
    showSwitchModal: false,
    switchTarget: null
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menuBtn = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : { top: 26, height: 32 }
    const statusBarHeight = sysInfo.statusBarHeight || 20
    const navBarHeight = statusBarHeight + menuBtn.height + (menuBtn.top - statusBarHeight) * 2
    this.setData({ statusBarHeight, navBarHeight })

    // 读取本地存储的当前模型
    const saved = getData('openclawCurrentModel', '')
    if (saved) this.setData({ currentModel: saved })
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
        let list = Array.isArray(res.data) ? res.data : (res.data.data || res.data.models || [])

        const models = list.map((m, i) => ({
          id: m.id || m.name || '',
          name: m.name || m.id || '--',
          providerId: m.providerId || m.owned_by || '',
          owned_by: m.owned_by || m.providerId || '',
          contextWindow: m.contextWindow || 0,
          contextWindowText: this.formatNum(m.contextWindow || 0),
          maxTokens: m.maxTokens || 0,
          maxTokensText: this.formatNum(m.maxTokens || 0),
          color: colors[i % colors.length],
          probeStatus: '',
          probeClass: '',
          probeStatusText: '',
          probeMs: 0,
          testing: false
        }))

        this.setData({ models })

        // 如果没有设置当前模型，默认第一个
        if (!this.data.currentModel && models.length > 0) {
          this.setData({ currentModel: models[0].id })
          wx.setStorageSync('openclawCurrentModel', models[0].id)
        }
      }
    } catch (e) {
      console.error('[Models]', e)
    }

    this.setData({ loading: false, refreshing: false })
  },

  formatNum(n) {
    if (!n) return ''
    if (n >= 1000000) return Math.round(n / 1000) + 'K'
    if (n >= 1000) return Math.round(n / 1000) + 'K'
    return n + ''
  },

  // 点击模型 → 弹出切换确认
  onModelTap(e) {
    const idx = e.currentTarget.dataset.index
    const model = this.data.models[idx]
    if (!model || model.id === this.data.currentModel) return

    this.setData({
      showSwitchModal: true,
      switchTarget: model
    })
  },

  closeSwitchModal() {
    this.setData({ showSwitchModal: false, switchTarget: null })
  },

  async confirmSwitch() {
    const target = this.data.switchTarget
    if (!target) return

    this.setData({ showSwitchModal: false })

    const config = getData('openclawConfig', null)
    if (!config) return

    wx.showLoading({ title: '切换中...' })

    try {
      // 调用云函数切换模型
      const res = await this.callCloud('switchModel', config, { modelId: target.id })

      if (res.success) {
        this.setData({ currentModel: target.id })
        wx.setStorageSync('openclawCurrentModel', target.id)
        wx.showToast({ title: '已切换到 ' + target.name, icon: 'success' })
      } else {
        // 即使服务端失败，也先在本地记录（下次会话会使用）
        this.setData({ currentModel: target.id })
        wx.setStorageSync('openclawCurrentModel', target.id)
        wx.showToast({ title: '已设为默认模型', icon: 'success' })
      }
    } catch (err) {
      this.setData({ currentModel: target.id })
      wx.setStorageSync('openclawCurrentModel', target.id)
      wx.showToast({ title: '已设为默认模型', icon: 'success' })
    }

    wx.hideLoading()
    this.setData({ switchTarget: null })
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
