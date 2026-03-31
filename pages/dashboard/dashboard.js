const { getData, formatDate } = require('../../utils/util')
const { decrypt } = require('../../utils/crypto')

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
    }
  },

  onLoad() {
    this.setToday()
  },

  onShow() {
    this.checkConfig()
    this.checkCloudConfig()
  },

  setToday() {
    const now = new Date()
    const weekday = ['日', '一', '二', '三', '四', '五', '六']
    const m = now.getMonth() + 1
    const d = now.getDate()
    const today = `${m}月${d}日 周${weekday[now.getDay()]}`
    this.setData({ today })
  },

  checkConfig() {
    const config = getData('apiConfig', null)
    const credentials = getData('apiCredentials', null)
    const hasCred = !!(credentials && credentials.email && credentials.password)

    if (config && (config.cookie || hasCred)) {
      this.setData({
        configured: true,
        apiConfig: config || {}
      })
      // 如果没有 cookie 但有凭证，先登录
      if (!config || !config.cookie) {
        this.setData({ loading: true })
        this.loginWithCredentials().then((ok) => {
          if (ok) {
            this.fetchDashboard()
          } else {
            this.setData({ loading: false })
          }
        })
      } else {
        this.fetchDashboard()
      }
    } else {
      this.setData({ configured: false, loading: false })
    }
  },

  async fetchDashboard() {
    this.setData({ loading: true })

    try {
      // 只获取概览数据（包含模型分布）
      await this.fetchSummary()
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

  checkCloudConfig() {
    const config = getData('cloudConfig', null)
    if (config && config.secretId && config.secretKey) {
      this.setData({ cloudConfigured: true })
      this.fetchCloudDashboard()
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
      } else {
        this.setData({ cloudLoading: false })
      }
    } catch (err) {
      console.error('云服务监控数据获取失败:', err)
      this.setData({ cloudLoading: false })
    }
  }
})
