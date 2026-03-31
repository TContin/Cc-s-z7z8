const { getData, formatDate } = require('../../../utils/util')
const { CACHE_TTL, callOpenClaw, formatTokens, isMemCacheValid, updateMemCache, clearMemCache, isLoading, setLoading } = require('../../../utils/api')

const OC_CACHE_KEY = 'oc_dashboard'

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 88,
    refreshing: false,
    loading: false,
    lastUpdate: '',

    // Gateway 状态
    gatewayHealthy: false,
    gatewayStatus: '--',
    totalModels: 0,
    responseMs: '--',

    // 汇总
    totalSessions: 0,
    totalAgents: 0,

    // Bot/Agent 列表
    agents: [],

    // 模型列表
    models: [],

    // 统计概览
    stats: {
      totalTokens: '--',
      totalMessages: '--',
      totalSessions: '--',
      avgResponseMs: '--'
    }
  },

  _cacheTime: 0,
  _loaded: false,

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menuBtn = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : { top: 26, height: 32 }
    const statusBarHeight = sysInfo.statusBarHeight || 20
    const navBarHeight = statusBarHeight + menuBtn.height + (menuBtn.top - statusBarHeight) * 2

    this.setData({ statusBarHeight, navBarHeight })
    this._loaded = false
  },

  onShow() {
    if (!this._loaded) {
      this._loaded = true
      this.loadAll()
      return
    }
    // 缓存未过期则跳过
    if (isMemCacheValid(OC_CACHE_KEY, CACHE_TTL.dashboard)) return
    this.loadAll()
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/dashboard/dashboard' }) })
  },

  async loadAll() {
    const config = getData('openclawConfig', null)
    if (!config || !config.serverUrl) return

    // 防重入
    if (isLoading(OC_CACHE_KEY)) return
    setLoading(OC_CACHE_KEY, true)

    this.setData({ loading: true })

    try {
      await Promise.all([
        this.fetchGatewayHealth(config),
        this.fetchModels(config),
        this.fetchAgents(config),
        this.fetchStats(config)
      ])
    } catch (err) {
      console.error('[OC Dashboard] loadAll 异常:', err)
    }

    this.setData({
      loading: false,
      refreshing: false,
      lastUpdate: formatDate(new Date(), 'HH:mm')
    })
    updateMemCache(OC_CACHE_KEY)
    setLoading(OC_CACHE_KEY, false)
  },

  refreshAll() {
    clearMemCache(OC_CACHE_KEY)
    this.setData({ refreshing: true })
    this.loadAll()
  },

  onPullRefresh() {
    this.refreshAll()
  },

  // ========== Gateway 健康检测 ==========
  async fetchGatewayHealth(config) {
    try {
      const startTime = Date.now()
      const res = await callOpenClaw('testConnection', config)
      const elapsed = Date.now() - startTime

      if (res.success) {
        const statusMap = { 'live': '运行中', 'ok': '正常' }
        const status = (res.data && res.data.status) || 'live'
        this.setData({
          gatewayHealthy: true,
          gatewayStatus: statusMap[status] || status,
          responseMs: elapsed
        })
      } else {
        this.setData({ gatewayHealthy: false, gatewayStatus: '离线', responseMs: '--' })
      }
    } catch (err) {
      this.setData({ gatewayHealthy: false, gatewayStatus: '离线', responseMs: '--' })
    }
  },

  // ========== 模型列表 ==========
  async fetchModels(config) {
    try {
      const res = await callOpenClaw('getModels', config)
      console.log('[OC Models] 返回结果:', JSON.stringify(res).substring(0, 500))

      if (res.success && res.data) {
        const colors = ['#007AFF', '#FF9500', '#AF52DE', '#FF3B30', '#34C759', '#5AC8FA', '#FF2D55', '#FFCC00']
        let modelsList = []

        if (Array.isArray(res.data)) {
          modelsList = res.data
        } else if (res.data.data && Array.isArray(res.data.data)) {
          modelsList = res.data.data
        } else if (res.data.models && Array.isArray(res.data.models)) {
          modelsList = res.data.models
        }

        const models = modelsList.map((m, i) => ({
          id: m.id || m.name || '',
          name: m.id || m.name || '--',
          owned_by: m.owned_by || '',
          created: m.created || 0,
          color: colors[i % colors.length],
          probeStatus: '',
          probeStatusText: '未测试'
        }))

        this.setData({ models, totalModels: models.length })
      }
    } catch (err) {
      console.error('[OC] fetchModels:', err)
    }
  },

  // ========== Agent 列表 ==========
  async fetchAgents(config) {
    try {
      const res = await callOpenClaw('getAgents', config)
      if (res.success && res.data) {
        const agents = (Array.isArray(res.data) ? res.data : []).map(a => ({
          id: a.id || a.agentId || 'main',
          name: a.name || a.id || 'Main Bot',
          emoji: a.emoji || '🤖',
          model: a.model || a.defaultModel || '--',
          state: a.state || 'offline',
          sessionCount: a.sessionCount || 0,
          platforms: a.platforms || []
        }))

        let totalSessions = 0
        agents.forEach(a => { totalSessions += a.sessionCount })

        this.setData({ agents, totalAgents: agents.length, totalSessions })
      }
    } catch (err) {
      console.error('[OC] fetchAgents:', err)
    }
  },

  // ========== 统计概览 ==========
  async fetchStats(config) {
    try {
      const res = await callOpenClaw('getStats', config)
      if (res.success && res.data) {
        const d = res.data
        this.setData({
          stats: {
            totalTokens: formatTokens(d.totalTokens || 0),
            totalMessages: (d.totalMessages || 0) + '',
            totalSessions: (d.totalSessions || 0) + '',
            avgResponseMs: d.avgResponseMs ? (d.avgResponseMs + 'ms') : '--'
          }
        })
      }
    } catch (err) {
      console.error('[OC] fetchStats:', err)
    }
  },

  // ========== 页面导航 ==========
  goModels() {
    wx.navigateTo({ url: '/pages/openclaw/models/models' })
  },

  goSessions() {
    wx.navigateTo({ url: '/pages/openclaw/sessions/sessions' })
  },

  goPlatform() {
    wx.navigateTo({ url: '/pages/openclaw/platform/platform' })
  },

  goConfig() {
    wx.navigateTo({ url: '/pages/openclaw/config/config' })
  },

  goAgentDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/openclaw/sessions/sessions?agentId=${id}` })
  }
})
