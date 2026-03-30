const { getData, showToast, formatDate } = require('../../utils/util')

Page({
  data: {
    configured: false,
    loading: true,
    refreshing: false,
    apiConfig: null,
    // 概览
    summary: null,
    // 密钥列表
    keys: [],
    // 使用记录
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

  // 用量概览
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
        this.setData({
          summary: {
            savedAmount: d.savedAmount != null ? '¥' + Number(d.savedAmount).toFixed(2) : '--',
            savedPercent: d.savedPercent || d.savePercent || '--',
            officialPrice: d.officialPrice != null ? '¥' + Number(d.officialPrice).toFixed(2) : '--',
            actualCost: d.actualCost != null ? '¥' + Number(d.actualCost).toFixed(2) : '--',
            avgDaily: d.avgDaily != null ? '¥' + Number(d.avgDaily).toFixed(2) : '--',
            totalTokens: d.totalTokens != null ? this.formatTokens(d.totalTokens) : (d.tokenUsage ? this.formatTokens(d.tokenUsage) : '--'),
            inputTokens: d.inputTokens != null ? this.formatTokens(d.inputTokens) : '--',
            outputTokens: d.outputTokens != null ? this.formatTokens(d.outputTokens) : '--',
            cacheRate: d.cacheHitRate || d.cacheRate || '--',
            totalHours: d.totalHours != null ? Number(d.totalHours).toFixed(1) : (d.totalDuration ? (d.totalDuration / 3600).toFixed(1) : '--'),
            totalRequests: d.totalRequests || d.requestCount || '--',
            dailyRequests: d.dailyRequests || d.avgDailyRequests || '--',
            avgTokens: d.avgTokens != null ? this.formatTokens(d.avgTokens) : '--',
            avgCost: d.avgCost != null ? '¥' + Number(d.avgCost).toFixed(2) : '--',
            avgDuration: d.avgDuration || '--'
          }
        })
      }
    } catch (err) {
      console.error('概览获取失败:', err)
    }
  },

  // 密钥列表
  async fetchKeys() {
    const { apiConfig } = this.data
    try {
      const res = await this.request(`/api/user/api-keys?userId=${apiConfig.userId}`)
      if (res.statusCode === 200) {
        const keys = res.data.data || res.data.keys || res.data || []
        if (Array.isArray(keys)) {
          this.setData({
            keys: keys.map(k => ({
              name: k.name || k.keyName || '未命名',
              key: k.sensitiveId || k.key || k.maskedKey || '****',
              status: k.isActive !== false && k.status !== 'disabled' && k.status !== 0 ? '启用中' : '已禁用',
              isActive: k.isActive !== false && k.status !== 'disabled' && k.status !== 0,
              calls: k.usageCount || k.totalCalls || k.calls || 0,
              todayCost: k.todayCost != null ? '¥' + Number(k.todayCost).toFixed(2) : '--',
              weekCost: k.weekCost != null ? '¥' + Number(k.weekCost).toFixed(2) : '--',
              lastUsed: k.lastUsedAt || k.lastUse || '--'
            }))
          })
        }
      }
    } catch (err) {
      console.error('密钥获取失败:', err)
    }
  },

  // 使用记录
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
              time: r.createdAt || r.time || r.date || '--',
              service: r.service || r.type || '--',
              model: r.model || r.modelName || '--',
              discount: r.discount || '--',
              channel: r.channel || r.channelName || '--',
              inputTokens: r.inputTokens || r.promptTokens || 0,
              outputTokens: r.outputTokens || r.completionTokens || 0,
              firstByte: r.firstByte || r.ttfb || '--',
              duration: r.duration || r.elapsed || '--',
              keyName: r.keyName || r.apiKeyName || '--',
              cost: r.cost != null ? '¥' + Math.abs(Number(r.cost)).toFixed(4) :
                    r.amount != null ? '¥' + Math.abs(Number(r.amount)).toFixed(4) : '--'
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
    const url = 'https://aicodewith.com' + path

    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method: 'GET',
        header: {
          'Cookie': apiConfig.cookie,
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Referer': 'https://aicodewith.com/zh/dashboard/usage-records'
        },
        success: resolve,
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

  onConfigTap() {
    wx.navigateTo({ url: '/pages/apimonitor/config/config' })
  },

  onPullDownRefresh() {
    this.fetchAll().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
