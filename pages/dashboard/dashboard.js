const { getData, formatDate } = require('../../utils/util')
const { decrypt } = require('../../utils/crypto')

// 缓存有效期（毫秒）
const CACHE_TTL = 30 * 1000  // 30 秒

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

  // 内存级缓存时间戳
  _apiCacheTime: 0,
  _cloudCacheTime: 0,
  _openclawCacheTime: 0,

  onLoad() {
    this.setToday()
  },

  onShow() {
    // 两个监控并行发起，不再串行等待
    this.loadAll()
  },

  // 并行加载 API 监控 + 云服务监控 + OpenClaw 监控
  loadAll() {
    const p1 = this.checkConfig()
    const p2 = this.checkCloudConfig()
    const p3 = this.checkOpenClawConfig()
    // 不需要 await，三个请求同时飞
    Promise.all([p1, p2, p3]).catch(err => {
      console.error('loadAll 异常:', err)
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

      // 缓存命中：30 秒内不重新请求
      if (this.data.summary && (Date.now() - this._apiCacheTime < CACHE_TTL)) {
        console.log('[API缓存] 命中，跳过请求')
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
        // 有 cookie —— 先检查 token 是否快过期，提前刷新避免 401 重试
        await this.ensureTokenFresh()
        await this.fetchDashboard()
      }
    } else {
      this.setData({ configured: false, loading: false })
    }
  },

  // 预检 token：如果即将过期（< 5 分钟），提前刷新
  async ensureTokenFresh() {
    const apiConfig = this.data.apiConfig
    if (!apiConfig || !apiConfig.cookie) return

    try {
      const checkRes = await new Promise((resolve) => {
        wx.cloud.callFunction({
          name: 'apiProxy',
          data: { action: 'checkToken', cookie: apiConfig.cookie },
          success: (r) => resolve(r.result || {}),
          fail: () => resolve({ success: false })
        })
      })

      // token 还有超过 5 分钟，不需要刷新
      if (checkRes.success && checkRes.remaining > 300) {
        return
      }

      console.log('[Token预检] 即将过期(剩余' + (checkRes.remaining || 0) + 's)，提前刷新')

      // 尝试用 refresh_token 刷新
      const refreshRes = await new Promise((resolve) => {
        wx.cloud.callFunction({
          name: 'apiProxy',
          data: { action: 'refreshToken', cookie: apiConfig.cookie },
          success: (r) => resolve(r.result || {}),
          fail: () => resolve({ success: false })
        })
      })

      if (refreshRes.success && refreshRes.cookie) {
        const config = getData('apiConfig', {})
        config.cookie = refreshRes.cookie
        config.updatedAt = new Date().toISOString()
        wx.setStorageSync('apiConfig', config)
        this.setData({ apiConfig: config })
        console.log('[Token预检] 刷新成功')
      } else if (refreshRes.needReLogin) {
        // refresh_token 也过期了，尝试用密码重新登录
        console.log('[Token预检] refresh_token 失效，尝试密码登录')
        await this.loginWithCredentials()
      }
    } catch (err) {
      console.error('[Token预检] 异常:', err)
      // 预检失败不阻塞，后续请求会走 401 重试兜底
    }
  },

  async fetchDashboard() {
    this.setData({ loading: true })

    try {
      await this.fetchSummary()
      // 请求成功，更新缓存时间戳
      this._apiCacheTime = Date.now()
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

        // 汇总所有天的数据
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

        this.setData({
          summary: {
            savedAmount: '¥' + totalSavings.toFixed(2),
            savedPercent: savePct + '%',
            actualCost: '¥' + totalActual.toFixed(2),
            avgDaily: '¥' + avgDaily.toFixed(2),
            totalTokens: this.formatTokens(totalTokens),
            inputTokens: this.formatTokens(totalInput),
            outputTokens: this.formatTokens(totalOutput),
            totalRequests: totalRequests + '',
            dailyRequests: dailyReq + ''
          },
          models: models.map(m => ({
            name: m.model,
            tokens: this.formatTokens(m.tokens),
            cost: '¥' + Number(m.cost).toFixed(2),
            requests: m.requests,
            color: m.fill || '#007AFF'
          }))
        })
      }
    } catch (err) {
      console.error('概览获取失败:', err)
    }
  },

  // 使用账号密码登录获取 Cookie
  async loginWithCredentials() {
    const credentials = getData('apiCredentials', null)
    if (!credentials || !credentials.email || !credentials.password) {
      return false
    }

    try {
      const plainPassword = decrypt(credentials.password)
      if (!plainPassword) return false

      const res = await new Promise((resolve) => {
        wx.cloud.callFunction({
          name: 'apiProxy',
          data: {
            action: 'passwordLogin',
            email: credentials.email,
            password: plainPassword,
            cookie: this.data.apiConfig ? this.data.apiConfig.cookie : ''
          },
          success: (r) => resolve(r.result || {}),
          fail: (err) => resolve({ success: false, error: err.errMsg })
        })
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
          // 如果返回了新 Cookie，更新本地
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

  formatTokens(num) {
    if (!num) return '0'
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
    return num + ''
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

      // 缓存命中：30 秒内不重新请求
      if (this.data.cloudData.status !== '--' && (Date.now() - this._cloudCacheTime < CACHE_TTL)) {
        console.log('[云监控缓存] 命中，跳过请求')
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

      const res = await new Promise((resolve) => {
        wx.cloud.callFunction({
          name: 'tencentCloud',
          data: {
            action: 'getDashboard',
            secretId: config.secretId,
            secretKey: secretKey,
            region: config.region || 'ap-guangzhou'
          },
          success: (r) => resolve(r.result || {}),
          fail: (err) => resolve({ success: false, error: err.errMsg })
        })
      })

      if (res.success && res.data) {
        const d = res.data
        const inst0 = d.instances && d.instances[0]
        const mon = d.monitor || {}

        // 系统盘
        const diskTotal = inst0 ? inst0.diskSize : 0
        const diskPct = mon.diskUsage ? parseFloat(mon.diskUsage) : 0
        const diskUsedGB = diskTotal > 0 && diskPct > 0 ? (diskTotal * diskPct / 100).toFixed(1) : '--'

        // 流量包
        const trafficPct = inst0 ? parseFloat(inst0.trafficPercent) || 0 : 0
        const trafficUsed = inst0 ? (inst0.trafficUsedMB + ' MB') : '--'
        const trafficTotal = inst0 ? (inst0.trafficTotalGB + 'GB') : '--'

        this.setData({
          cloudData: {
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
          },
          cloudLoading: false,
          cloudLastUpdate: formatDate(new Date(), 'HH:mm')
        })
        // 更新缓存时间戳
        this._cloudCacheTime = Date.now()
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

      // 缓存命中：30 秒内不重新请求
      if (this.data.openclawData.totalSessions !== '--' && (Date.now() - this._openclawCacheTime < CACHE_TTL)) {
        console.log('[OpenClaw缓存] 命中，跳过请求')
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
      const res = await new Promise((resolve) => {
        wx.cloud.callFunction({
          name: 'openClawProxy',
          data: {
            action: 'getDashboard',
            serverUrl: config.serverUrl,
            apiToken: config.apiToken || ''
          },
          success: (r) => resolve(r.result || {}),
          fail: (err) => resolve({ success: false, error: err.errMsg })
        })
      })

      // 打印调试信息
      if (res.debug) {
        console.log('[OpenClaw] 调试信息:', JSON.stringify(res.debug))
      }

      if (res.success && res.data) {
        const d = res.data
        const sessions = d.sessions || {}
        const messages = d.messages || {}
        const models = d.models || []

        // 模型颜色列表
        const colors = ['#007AFF', '#FF9500', '#AF52DE', '#FF3B30', '#34C759', '#5AC8FA', '#FF2D55', '#FFCC00']

        // Gateway 状态映射
        const statusMap = { 'live': '运行中', 'ok': '正常', 'starting': '启动中' }
        const gwStatus = d.gatewayStatus || 'unknown'
        const gwStatusText = statusMap[gwStatus] || gwStatus

        this.setData({
          openclawData: {
            gatewayStatus: d.healthy ? gwStatusText : '离线',
            totalModels: models.length + '',
            totalSessions: sessions.total > 0 ? sessions.total + '' : '--',
            activeSessions: sessions.active > 0 ? sessions.active + '' : '--',
            totalMessages: messages.total > 0 ? messages.total + '' : '--',
            totalTokens: messages.tokens > 0 ? this.formatTokens(messages.tokens) : '--',
            inputTokens: messages.inputTokens > 0 ? this.formatTokens(messages.inputTokens) : '--',
            outputTokens: messages.outputTokens > 0 ? this.formatTokens(messages.outputTokens) : '--',
            totalCost: d.cost && d.cost > 0 ? ('$' + Number(d.cost).toFixed(2)) : '--'
          },
          openclawModels: models.map((m, i) => ({
            name: m.name || '--',
            messages: m.messages || 0,
            tokens: this.formatTokens(m.tokens || 0),
            owned_by: m.owned_by || '',
            color: colors[i % colors.length]
          })),
          openclawLoading: false,
          openclawLastUpdate: formatDate(new Date(), 'HH:mm')
        })
        // 更新缓存时间戳
        this._openclawCacheTime = Date.now()
      } else {
        console.error('[OpenClaw] 数据获取失败:', res.error)
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

  goOpenClawConfig() {
    wx.navigateTo({ url: '/pages/openclaw/config/config' })
  }
})
