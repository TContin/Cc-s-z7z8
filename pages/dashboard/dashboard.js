const { getData, formatDate } = require('../../utils/util')
const { decrypt } = require('../../utils/crypto')
const {
  CACHE_TTL,
  callCloudFunction,
  callOpenClaw,
  formatTokens,
  checkTokenLocally,
  getCachedData,
  setCachedData,
  isMemCacheValid,
  updateMemCache,
  isLoading,
  setLoading
} = require('../../utils/api')

Page({
  data: {
    configured: false,
    loading: false,
    summary: null,
    models: [],
    lastUpdate: '',
    today: '',
    // 云服务监控
    cloudConfigured: false,
    cloudLoading: false,
    cloudLastUpdate: '',
    cloudData: {
      status: '--',
      diskPercent: 0,
      diskUsed: '--',
      diskTotal: '--',
      cpuCores: '-',
      cpuPercent: 0,
      memTotal: '-',
      memUsed: '--',
      memPercent: 0,
      trafficPercent: 0,
      trafficUsed: '--',
      trafficTotal: '--'
    },
    // OpenClaw 监控
    openclawConfigured: false,
    openclawLoading: false,
    openclawLastUpdate: '',
    openclawData: {
      gatewayStatus: '--',
      totalModels: '--',
      totalSessions: '--',
      activeSessions: '--',
      totalMessages: '--',
      totalTokens: '--',
      inputTokens: '--',
      outputTokens: '--',
      totalCost: '--'
    },
    openclawModels: []
  },

  _firstLoad: true,

  onLoad() {
    this.setToday()
    // 首次加载：先从 Storage 缓存恢复数据（秒开）
    this._restoreFromCache()
  },

  onShow() {
    // 防止 onLoad + onShow 首次双重触发
    if (this._firstLoad) {
      this._firstLoad = false
      this.loadAll()
      return
    }
    // 后续 onShow：只在缓存过期时才重新请求
    this.loadAll()
  },

  // 从 Storage 恢复上次缓存数据（秒开体验）
  _restoreFromCache() {
    const apiCache = getCachedData('dash_api')
    if (apiCache && apiCache.data) {
      this.setData({
        configured: true,
        summary: apiCache.data.summary,
        models: apiCache.data.models,
        lastUpdate: apiCache.data.lastUpdate
      })
    }
    const cloudCache = getCachedData('dash_cloud')
    if (cloudCache && cloudCache.data) {
      this.setData({
        cloudConfigured: true,
        cloudData: cloudCache.data.cloudData,
        cloudLastUpdate: cloudCache.data.cloudLastUpdate
      })
    }
    const ocCache = getCachedData('dash_openclaw')
    if (ocCache && ocCache.data) {
      this.setData({
        openclawConfigured: true,
        openclawData: ocCache.data.openclawData,
        openclawModels: ocCache.data.openclawModels,
        openclawLastUpdate: ocCache.data.openclawLastUpdate
      })
    }
  },

  // 并行加载 API 监控 + 云服务监控 + OpenClaw 监控
  loadAll() {
    if (isLoading('dashboard')) return
    setLoading('dashboard', true)
    const p1 = this.checkConfig()
    const p2 = this.checkCloudConfig()
    const p3 = this.checkOpenClawConfig()
    Promise.all([p1, p2, p3]).catch(err => {
      console.error('loadAll 异常:', err)
    }).finally(() => {
      setLoading('dashboard', false)
    })
  },

  setToday() {
    const now = new Date()
    const weekday = ['日', '一', '二', '三', '四', '五', '六']
    const m = now.getMonth() + 1
    const d = now.getDate()
    const today = `${m}月${d}日 周${weekday[now.getDay()]}`
    this.setData({ today })
  },

  async checkConfig() {
    const config = getData('apiConfig', null)
    const credentials = getData('apiCredentials', null)
    const hasCred = !!(credentials && credentials.email && credentials.password)

    if (config && (config.cookie || hasCred)) {
      this.setData({
        configured: true,
        apiConfig: config || {}
      })

      // 缓存命中：2 分钟内不重新请求
      if (this.data.summary && isMemCacheValid('dash_api', CACHE_TTL.dashboard)) {
        return
      }

      // 如果没有 cookie 但有凭证，先登录
      if (!config || !config.cookie) {
        this.setData({ loading: true })
        const ok = await this.loginWithCredentials()
        if (ok) {
          await this.fetchDashboard()
        } else {
          this.setData({ loading: false })
        }
      } else {
        // 【优化】Token 本地检查，不走云函数
        await this.ensureTokenFresh()
        await this.fetchDashboard()
      }
    } else {
      this.setData({ configured: false, loading: false })
    }
  },

  // 【优化】Token 预检：本地解析 JWT 过期时间，只有需要刷新时才调云函数
  async ensureTokenFresh() {
    const apiConfig = this.data.apiConfig
    if (!apiConfig || !apiConfig.cookie) return

    try {
      // 本地检查 Token（不调云函数，节省 1-3 秒！）
      const tokenInfo = checkTokenLocally(apiConfig.cookie)

      // token 还有效，直接返回
      if (tokenInfo.valid) return

      console.log('[Token预检] 即将过期(剩余' + tokenInfo.remaining + 's)，提前刷新')

      // 只在需要刷新时才调云函数
      const refreshRes = await callCloudFunction('apiProxy', {
        action: 'refreshToken',
        cookie: apiConfig.cookie
      })

      if (refreshRes.success && refreshRes.cookie) {
        const config = getData('apiConfig', {})
        config.cookie = refreshRes.cookie
        config.updatedAt = new Date().toISOString()
        wx.setStorageSync('apiConfig', config)
        this.setData({ apiConfig: config })
        console.log('[Token预检] 刷新成功')
      } else if (refreshRes.needReLogin) {
        console.log('[Token预检] refresh_token 失效，尝试密码登录')
        await this.loginWithCredentials()
      }
    } catch (err) {
      console.error('[Token预检] 异常:', err)
    }
  },

  async fetchDashboard() {
    this.setData({ loading: true })

    try {
      await this.fetchSummary()
      updateMemCache('dash_api')
    } catch (err) {
      console.error('仪表盘数据获取失败:', err)
    }

    this.setData({
      loading: false,
      lastUpdate: formatDate(new Date(), 'HH:mm')
    })
  },

  async fetchSummary() {
    const apiConfig = this.data.apiConfig
    if (!apiConfig || !apiConfig.cookie) return

    try {
      const end = formatDate(new Date(), 'YYYY-MM-DD')
      const start = new Date()
      start.setDate(start.getDate() - 7)
      const startDate = formatDate(start, 'YYYY-MM-DD')

      const res = await this.request(`/api/user/usage-summary?userId=${apiConfig.userId}&startDate=${startDate}&endDate=${end}`)
      if (res.statusCode === 200 && res.data) {
        const d = res.data.data || res.data
        const days = Array.isArray(d) ? d : []
        const models = res.data.modelDistribution || []

        let totalOfficial = 0, totalActual = 0, totalSavings = 0
        let totalInput = 0, totalOutput = 0, totalTokens = 0
        let totalRequests = 0

        days.forEach(day => {
          totalOfficial += day.officialPrice || 0
          totalActual += day.actualPrice || 0
          totalSavings += day.savings || 0
          totalInput += day.inputTokens || 0
          totalOutput += day.outputTokens || 0
          totalTokens += day.totalTokens || 0
          totalRequests += day.requests || 0
        })

        const avgDaily = days.length > 0 ? (totalActual / days.length) : 0
        const dailyReq = days.length > 0 ? Math.round(totalRequests / days.length) : 0
        const savePct = totalOfficial > 0 ? Math.round((totalSavings / totalOfficial) * 100) : 0

        const summary = {
          savedAmount: '¥' + totalSavings.toFixed(2),
          savedPercent: savePct + '%',
          actualCost: '¥' + totalActual.toFixed(2),
          avgDaily: '¥' + avgDaily.toFixed(2),
          totalTokens: formatTokens(totalTokens),
          inputTokens: formatTokens(totalInput),
          outputTokens: formatTokens(totalOutput),
          totalRequests: totalRequests + '',
          dailyRequests: dailyReq + ''
        }
        const modelList = models.map(m => ({
          name: m.model,
          tokens: formatTokens(m.tokens),
          cost: '¥' + Number(m.cost).toFixed(2),
          requests: m.requests,
          color: m.fill || '#007AFF'
        }))

        this.setData({ summary, models: modelList })

        // 持久化到 Storage 缓存
        setCachedData('dash_api', {
          summary, models: modelList,
          lastUpdate: formatDate(new Date(), 'HH:mm')
        })
      }
    } catch (err) {
      console.error('概览获取失败:', err)
    }
  },

  async loginWithCredentials() {
    const credentials = getData('apiCredentials', null)
    if (!credentials || !credentials.email || !credentials.password) {
      return false
    }

    try {
      const plainPassword = decrypt(credentials.password)
      if (!plainPassword) return false

      const res = await callCloudFunction('apiProxy', {
        action: 'passwordLogin',
        email: credentials.email,
        password: plainPassword,
        cookie: this.data.apiConfig ? this.data.apiConfig.cookie : ''
      })

      if (res.success && res.cookie) {
        const config = getData('apiConfig', {})
        config.cookie = res.cookie
        config.updatedAt = new Date().toISOString()
        if (res.userId && !config.userId) {
          config.userId = res.userId
        }
        wx.setStorageSync('apiConfig', config)
        this.setData({ apiConfig: config })
        return true
      }
      return false
    } catch (err) {
      console.error('登录异常:', err)
      return false
    }
  },

  request(path) {
    const apiConfig = this.data.apiConfig
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'apiProxy',
        data: { path, cookie: apiConfig.cookie },
        success: (res) => {
          const result = res.result || {}
          if (result.newCookie) {
            const config = getData('apiConfig', {})
            config.cookie = result.newCookie
            config.updatedAt = new Date().toISOString()
            wx.setStorageSync('apiConfig', config)
            this.setData({ apiConfig: config })
          }
          resolve({
            statusCode: result.statusCode || 200,
            data: result.data
          })
        },
        fail: (err) => {
          console.error('云函数调用失败:', err)
          reject(err)
        }
      })
    })
  },

  goApiMonitor() {
    wx.navigateTo({ url: '/pages/apimonitor/apimonitor' })
  },

  goCloudMonitor() {
    wx.navigateTo({ url: '/pages/cloudmonitor/cloudmonitor' })
  },

  async checkCloudConfig() {
    const config = getData('cloudConfig', null)
    if (config && config.secretId && config.secretKey) {
      this.setData({ cloudConfigured: true })

      // 缓存命中：2 分钟内不重新请求
      if (this.data.cloudData.status !== '--' && isMemCacheValid('dash_cloud', CACHE_TTL.cloud)) {
        return
      }

      await this.fetchCloudDashboard()
    } else {
      this.setData({ cloudConfigured: false })
    }
  },

  async fetchCloudDashboard() {
    this.setData({ cloudLoading: true })
    const config = getData('cloudConfig', null)
    if (!config) return

    try {
      const secretKey = decrypt(config.secretKey)
      if (!secretKey) {
        this.setData({ cloudLoading: false })
        return
      }

      const res = await callCloudFunction('tencentCloud', {
        action: 'getDashboard',
        secretId: config.secretId,
        secretKey: secretKey,
        region: config.region || 'ap-guangzhou'
      })

      if (res.success && res.data) {
        const d = res.data
        const inst0 = d.instances && d.instances[0]
        const mon = d.monitor || {}

        const diskTotal = inst0 ? inst0.diskSize : 0
        const diskPct = mon.diskUsage ? parseFloat(mon.diskUsage) : 0
        const diskUsedGB = diskTotal > 0 && diskPct > 0 ? (diskTotal * diskPct / 100).toFixed(1) : '--'

        const trafficPct = inst0 ? parseFloat(inst0.trafficPercent) || 0 : 0
        const trafficUsed = inst0 ? (inst0.trafficUsedMB + ' MB') : '--'
        const trafficTotal = inst0 ? (inst0.trafficTotalGB + 'GB') : '--'

        const cloudData = {
          status: inst0 ? inst0.status : '--',
          diskPercent: diskPct,
          diskUsed: diskUsedGB !== '--' ? diskUsedGB + ' GB' : '--',
          diskTotal: diskTotal + 'GB',
          cpuCores: inst0 ? inst0.cpu : '-',
          cpuPercent: mon.cpuPercent || 0,
          memTotal: inst0 ? inst0.memory + 'GB' : '-',
          memUsed: mon.memUsedMB || '--',
          memPercent: mon.memPercent || 0,
          trafficPercent: trafficPct,
          trafficUsed: trafficUsed,
          trafficTotal: trafficTotal
        }
        const cloudLastUpdate = formatDate(new Date(), 'HH:mm')

        // 一次 setData 合并更新
        this.setData({ cloudData, cloudLoading: false, cloudLastUpdate })
        updateMemCache('dash_cloud')

        // 持久化到 Storage 缓存
        setCachedData('dash_cloud', { cloudData, cloudLastUpdate })
      } else {
        this.setData({ cloudLoading: false })
      }
    } catch (err) {
      console.error('云服务监控数据获取失败:', err)
      this.setData({ cloudLoading: false })
    }
  },

  // ========== OpenClaw 监控 ==========
  async checkOpenClawConfig() {
    const config = getData('openclawConfig', null)
    if (config && config.serverUrl) {
      this.setData({ openclawConfigured: true })

      // 缓存命中：2 分钟内不重新请求
      if (this.data.openclawData.totalSessions !== '--' && isMemCacheValid('dash_openclaw', CACHE_TTL.dashboard)) {
        return
      }

      await this.fetchOpenClawDashboard()
    } else {
      this.setData({ openclawConfigured: false })
    }
  },

  async fetchOpenClawDashboard() {
    this.setData({ openclawLoading: true })
    const config = getData('openclawConfig', null)
    if (!config || !config.serverUrl) return

    try {
      const res = await callOpenClaw('getDashboard', config)

      if (res.success && res.data) {
        const d = res.data
        const sessions = d.sessions || {}
        const messages = d.messages || {}
        const models = d.models || []

        const colors = ['#007AFF', '#FF9500', '#AF52DE', '#FF3B30', '#34C759', '#5AC8FA', '#FF2D55', '#FFCC00']
        const statusMap = { 'live': '运行中', 'ok': '正常', 'starting': '启动中' }
        const gwStatus = d.gatewayStatus || 'unknown'
        const gwStatusText = statusMap[gwStatus] || gwStatus

        const openclawData = {
          gatewayStatus: d.healthy ? gwStatusText : '离线',
          totalModels: models.length + '',
          totalSessions: sessions.total > 0 ? sessions.total + '' : '--',
          activeSessions: sessions.active > 0 ? sessions.active + '' : '--',
          totalMessages: messages.total > 0 ? messages.total + '' : '--',
          totalTokens: messages.tokens > 0 ? formatTokens(messages.tokens) : '--',
          inputTokens: messages.inputTokens > 0 ? formatTokens(messages.inputTokens) : '--',
          outputTokens: messages.outputTokens > 0 ? formatTokens(messages.outputTokens) : '--',
          totalCost: d.cost && d.cost > 0 ? ('$' + Number(d.cost).toFixed(2)) : '--'
        }
        const openclawModels = models.map((m, i) => ({
          name: m.name || '--',
          messages: m.messages || 0,
          tokens: formatTokens(m.tokens || 0),
          owned_by: m.owned_by || '',
          color: colors[i % colors.length]
        }))
        const openclawLastUpdate = formatDate(new Date(), 'HH:mm')

        // 一次 setData 合并更新
        this.setData({ openclawData, openclawModels, openclawLoading: false, openclawLastUpdate })
        updateMemCache('dash_openclaw')

        // 持久化到 Storage 缓存
        setCachedData('dash_openclaw', { openclawData, openclawModels, openclawLastUpdate })
      } else {
        this.setData({ openclawLoading: false })
      }
    } catch (err) {
      console.error('OpenClaw 监控数据获取失败:', err)
      this.setData({ openclawLoading: false })
    }
  },

  goOpenClawDashboard() {
    wx.navigateTo({ url: '/pages/openclaw/dashboard/dashboard' })
  },

  goOpenClawSessions() {
    wx.navigateTo({ url: '/pages/openclaw/sessions/sessions' })
  },

  goOpenClawStats() {
    wx.navigateTo({ url: '/pages/openclaw/stats/stats' })
  },

  goOpenClawModels() {
    wx.navigateTo({ url: '/pages/openclaw/models/models' })
  },

  goOpenClawConfig() {
    wx.navigateTo({ url: '/pages/openclaw/config/config' })
  }
})
