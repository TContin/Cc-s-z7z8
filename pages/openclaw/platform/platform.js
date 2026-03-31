const { getData, formatDate } = require('../../../utils/util')

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 88,
    refreshing: false,
    loading: false,

    gatewayHealthy: false,
    responseMs: '--',
    serverUrl: '',

    agents: [],
    testResults: []
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menuBtn = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : { top: 26, height: 32 }
    const statusBarHeight = sysInfo.statusBarHeight || 20
    const navBarHeight = statusBarHeight + menuBtn.height + (menuBtn.top - statusBarHeight) * 2
    this.setData({ statusBarHeight, navBarHeight })
  },

  onShow() {
    this.loadData()
  },

  goBack() { wx.navigateBack() },

  async loadData() {
    const config = getData('openclawConfig', null)
    if (!config || !config.serverUrl) return
    this.setData({ loading: true, serverUrl: config.serverUrl })

    await Promise.all([
      this.fetchHealth(config),
      this.fetchAgents(config)
    ])

    this.setData({ loading: false, refreshing: false })
  },

  refreshAll() {
    this.setData({ refreshing: true })
    this.loadData()
  },

  onPullRefresh() { this.refreshAll() },

  async fetchHealth(config) {
    try {
      const start = Date.now()
      const res = await this.callCloud('testConnection', config)
      const elapsed = Date.now() - start
      this.setData({
        gatewayHealthy: res.success,
        responseMs: res.success ? elapsed : '--'
      })
    } catch (e) {
      this.setData({ gatewayHealthy: false, responseMs: '--' })
    }
  },

  async fetchAgents(config) {
    try {
      const res = await this.callCloud('getAgents', config)
      if (res.success && res.data) {
        const stateMap = { working: '工作中', online: '在线', idle: '闲置', offline: '离线' }
        const platformIconMap = {
          feishu: '📎', discord: '🎮', telegram: '✈️', whatsapp: '📱', wechat: '💬'
        }

        const agents = (Array.isArray(res.data) ? res.data : []).map(a => {
          const platforms = (a.platforms || []).map(p => ({
            name: p.name || p.type || '--',
            icon: platformIconMap[p.type] || '🔗',
            connected: p.connected !== false
          }))

          return {
            id: a.id || 'main',
            name: a.name || a.id || 'Main Bot',
            emoji: a.emoji || '🤖',
            model: a.model || a.defaultModel || '--',
            state: a.state || 'offline',
            stateText: stateMap[a.state] || '离线',
            sessionCount: a.sessionCount || 0,
            totalTokens: a.totalTokens ? this.formatTokens(a.totalTokens) : '--',
            lastActive: a.lastActive ? this.formatTime(a.lastActive) : '--',
            platforms
          }
        })

        this.setData({ agents })
      }
    } catch (e) {
      console.error('[Platform] fetchAgents:', e)
    }
  },

  async testConnection() {
    wx.showLoading({ title: '测试中...' })
    const config = getData('openclawConfig', null)
    if (!config) { wx.hideLoading(); return }

    const results = []
    const start = Date.now()
    const res = await this.callCloud('testConnection', config)
    results.push({
      name: 'Gateway Health',
      ok: res.success,
      ms: Date.now() - start
    })

    // 也测试模型端点
    const start2 = Date.now()
    const modelsRes = await this.callCloud('getModels', config)
    results.push({
      name: 'Models API',
      ok: modelsRes.success,
      ms: Date.now() - start2
    })

    this.setData({ testResults: results })
    wx.hideLoading()
    wx.showToast({ title: res.success ? '连接正常' : '连接失败', icon: res.success ? 'success' : 'error' })
  },

  testPlatform(e) {
    wx.showToast({ title: '测试发送中...', icon: 'loading' })
    // 实际需要通过 OpenClaw CLI 发送测试消息
    setTimeout(() => {
      wx.showToast({ title: '功能开发中', icon: 'none' })
    }, 1000)
  },

  openWebUI() {
    const config = getData('openclawConfig', null)
    if (config && config.serverUrl) {
      wx.setClipboardData({
        data: config.serverUrl,
        success: () => wx.showToast({ title: 'URL 已复制', icon: 'success' })
      })
    }
  },

  viewSessions(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/openclaw/sessions/sessions?agentId=${id}` })
  },

  callCloud(action, config) {
    return new Promise((resolve) => {
      wx.cloud.callFunction({
        name: 'openClawProxy',
        data: {
          action,
          serverUrl: config.serverUrl,
          apiToken: config.apiToken || ''
        },
        success: (r) => resolve(r.result || {}),
        fail: (err) => resolve({ success: false, error: err.errMsg })
      })
    })
  },

  formatTokens(num) {
    if (!num) return '0'
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
    return num + ''
  },

  formatTime(ts) {
    if (!ts) return '--'
    const d = new Date(typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : ts)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
    return Math.floor(diff / 86400000) + '天前'
  }
})
