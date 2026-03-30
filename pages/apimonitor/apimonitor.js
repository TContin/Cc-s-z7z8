const { getData, showToast, formatDate } = require('../../utils/util')

Page({
  data: {
    configured: false,
    loading: true,
    refreshing: false,
    apiConfig: null,
    summary: null,
    models: [],
    keys: [],
    records: [],
    lastUpdate: ''
  },

  onLoad() {
    this.checkConfig()
  },

  onShow() {
    this.checkConfig()
  },

  checkConfig() {
    const config = getData('apiConfig', null)
    if (config && config.cookie) {
      this.setData({ configured: true, apiConfig: config })
      this.fetchAll()
    } else {
      this.setData({ configured: false, loading: false })
    }
  },

  async fetchAll() {
    this.setData({ loading: true })
    await Promise.all([
      this.fetchSummary(),
      this.fetchKeys(),
      this.fetchRecords()
    ])
    this.setData({
      loading: false,
      refreshing: false,
      lastUpdate: formatDate(new Date(), 'HH:mm')
    })
  },

  async onRefresh() {
    this.setData({ refreshing: true })
    await this.fetchAll()
  },

  // ========== 用量概览 ==========
  async fetchSummary() {
    const { apiConfig } = this.data
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
        let totalDuration = 0, totalRequests = 0
        let totalCacheRead = 0, totalCacheWrite = 0

        days.forEach(day => {
          totalOfficial += day.officialPrice || 0
          totalActual += day.actualPrice || 0
          totalSavings += day.savings || 0
          totalInput += day.inputTokens || 0
          totalOutput += day.outputTokens || 0
          totalTokens += day.totalTokens || 0
          totalDuration += day.duration || 0
          totalRequests += day.requests || 0
          totalCacheRead += day.cacheReadTokens || 0
          totalCacheWrite += day.cacheWriteTokens || 0
        })

        const cacheRate = totalTokens > 0 ? ((totalCacheRead / totalTokens) * 100).toFixed(1) : '0'
        const avgDaily = days.length > 0 ? (totalActual / days.length) : 0
        const hours = (totalDuration / 3600).toFixed(1)
        const dailyReq = days.length > 0 ? Math.round(totalRequests / days.length) : 0
        const avgTokensPerReq = totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0
        const avgCostPerReq = totalRequests > 0 ? (totalActual / totalRequests) : 0

        const savePct = totalOfficial > 0 ? Math.round((totalSavings / totalOfficial) * 100) : 0

        this.setData({
          summary: {
            savedAmount: '¥' + totalSavings.toFixed(2),
            savedPercent: savePct + '%',
            officialPrice: '¥' + totalOfficial.toFixed(2),
            actualCost: '¥' + totalActual.toFixed(2),
            avgDaily: '¥' + avgDaily.toFixed(2),
            totalTokens: this.formatTokens(totalTokens),
            inputTokens: this.formatTokens(totalInput),
            outputTokens: this.formatTokens(totalOutput),
            cacheRate: cacheRate + '%',
            totalHours: hours,
            totalRequests: totalRequests + '',
            dailyRequests: dailyReq + '',
            avgTokens: this.formatTokens(avgTokensPerReq),
            avgCost: '¥' + avgCostPerReq.toFixed(2),
            avgDuration: totalRequests > 0 ? ((totalDuration / totalRequests) * 1000).toFixed(0) + 'ms' : '--'
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

  // ========== 密钥列表 ==========
  async fetchKeys() {
    const { apiConfig } = this.data
    try {
      const res = await this.request(`/api/user/api-keys?userId=${apiConfig.userId}`)
      if (res.statusCode === 200) {
        const raw = res.data.data || res.data.keys || res.data || []
        const keys = Array.isArray(raw) ? raw : []
        this.setData({
          keys: keys.map(k => ({
            name: k.name || k.keyName || '未命名',
            key: k.sensitiveId || k.maskedKey || k.key || '****',
            status: k.isActive !== false && k.status !== 'disabled' && k.status !== 0 ? '启用中' : '已禁用',
            isActive: k.isActive !== false && k.status !== 'disabled' && k.status !== 0,
            calls: k.usageCount || k.totalCalls || k.calls || 0,
            todayCost: k.todayCost != null ? '¥' + Number(k.todayCost).toFixed(2) : '--',
            weekCost: k.weekCost != null ? '¥' + Number(k.weekCost).toFixed(2) : '--',
            lastUsed: k.lastUsedAt || k.lastUse || '--'
          }))
        })
      }
    } catch (err) {
      console.error('密钥获取失败:', err)
    }
  },

  // ========== 使用记录 ==========
  async fetchRecords() {
    const { apiConfig } = this.data
    try {
      const end = formatDate(new Date(), 'YYYY-MM-DD')
      const start = new Date()
      start.setDate(start.getDate() - 7)
      const startDate = formatDate(start, 'YYYY-MM-DD')

      const res = await this.request(`/api/user/usage-records?page=1&pageSize=30&userId=${apiConfig.userId}&startDate=${startDate}&endDate=${end}`)
      if (res.statusCode === 200) {
        const d = res.data
        const records = d.data || d.records || d.list || []
        if (Array.isArray(records)) {
          this.setData({
            records: records.slice(0, 30).map(r => ({
              time: this.formatTime(r.createdAt || r.time || r.date || ''),
              service: r.service || r.type || '--',
              model: r.model || r.modelName || '--',
              discount: r.discount || '--',
              channel: r.channel || r.channelName || '--',
              inputTokens: r.inputTokens || r.promptTokens || 0,
              outputTokens: r.outputTokens || r.completionTokens || 0,
              firstByte: r.firstByte != null ? Number(r.firstByte).toFixed(1) + 's' : '--',
              duration: r.duration != null ? Number(r.duration).toFixed(1) + 's' : '--',
              keyName: r.keyName || r.apiKeyName || '--',
              cost: r.cost != null ? '-¥' + Math.abs(Number(r.cost)).toFixed(4) :
                    r.amount != null ? '-¥' + Math.abs(Number(r.amount)).toFixed(4) : '--'
            }))
          })
        }
      }
    } catch (err) {
      console.error('记录获取失败:', err)
    }
  },

  // ========== 工具 ==========

  request(path) {
    const { apiConfig } = this.data
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'apiProxy',
        data: { path, cookie: apiConfig.cookie },
        success: (res) => {
          resolve({
            statusCode: res.result.statusCode || 200,
            data: res.result.data
          })
        },
        fail: reject
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

  formatTime(str) {
    if (!str) return '--'
    // 2026-03-30T12:35:11 -> 03/30 12:35
    try {
      const d = new Date(str)
      if (isNaN(d.getTime())) return str
      return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    } catch (e) {
      return str
    }
  },

  onConfigTap() {
    wx.navigateTo({ url: '/pages/apimonitor/config/config' })
  },

  onPullDownRefresh() {
    this.fetchAll().then(() => wx.stopPullDownRefresh())
  }
})
