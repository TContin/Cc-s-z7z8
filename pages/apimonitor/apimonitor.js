const { getData, showToast, formatDate } = require('../../utils/util')

Page({
  data: {
    configured: false,
    loading: true,
    refreshing: false,
    apiConfig: null,
    // 概览数据
    balance: '--',
    usedAmount: '--',
    totalAmount: '--',
    requestCount: '--',
    tokenUsage: '--',
    // 密钥列表
    keys: [],
    // 使用记录
    records: [],
    hasMore: false,
    page: 1,
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
    if (config && config.apiKey) {
      this.setData({ configured: true, apiConfig: config })
      this.fetchAll()
    } else {
      this.setData({ configured: false, loading: false })
    }
  },

  // ========== 数据请求 ==========

  async fetchAll() {
    this.setData({ loading: true })
    await Promise.all([
      this.fetchBalance(),
      this.fetchKeys(),
      this.fetchUsage()
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

  // 查询余额/订阅信息
  async fetchBalance() {
    const { apiConfig } = this.data
    try {
      // 尝试多种常见的余额查询端点
      const endpoints = [
        '/dashboard/billing/credit_grants',
        '/dashboard/billing/subscription',
        '/v1/dashboard/billing/credit_grants',
        '/v1/dashboard/billing/subscription'
      ]

      for (const endpoint of endpoints) {
        try {
          const res = await this.request(endpoint)
          if (res.statusCode === 200 && res.data) {
            const d = res.data
            this.setData({
              balance: d.total_available != null ? '¥' + Number(d.total_available).toFixed(2) : 
                       d.hard_limit_usd != null ? '$' + Number(d.hard_limit_usd).toFixed(2) :
                       d.balance != null ? '¥' + Number(d.balance).toFixed(2) : '--',
              totalAmount: d.total_granted != null ? '¥' + Number(d.total_granted).toFixed(2) :
                          d.total != null ? '¥' + Number(d.total).toFixed(2) : '--',
              usedAmount: d.total_used != null ? '¥' + Number(d.total_used).toFixed(2) :
                         d.used != null ? '¥' + Number(d.used).toFixed(2) : '--'
            })
            return
          }
        } catch (e) {
          continue
        }
      }

      // 如果标准端点都不行，尝试 /user/balance 等
      try {
        const res = await this.request('/user/balance')
        if (res.statusCode === 200 && res.data) {
          const d = res.data.data || res.data
          this.setData({
            balance: d.balance != null ? '¥' + Number(d.balance).toFixed(2) : '--',
            totalAmount: d.total != null ? '¥' + Number(d.total).toFixed(2) : '--',
            usedAmount: d.used != null ? '¥' + Number(d.used).toFixed(2) : '--'
          })
        }
      } catch (e) {}
    } catch (err) {
      console.error('余额查询失败:', err)
    }
  },

  // 查询密钥列表
  async fetchKeys() {
    try {
      const endpoints = ['/dashboard/api-keys', '/v1/api-keys', '/keys']
      for (const endpoint of endpoints) {
        try {
          const res = await this.request(endpoint)
          if (res.statusCode === 200 && res.data) {
            const keys = res.data.data || res.data.keys || res.data || []
            if (Array.isArray(keys)) {
              this.setData({
                keys: keys.map(k => ({
                  name: k.name || k.key_name || '未命名',
                  key: k.sensitive_id || k.key || k.api_key || '****',
                  status: k.is_active !== false && k.status !== 'disabled' ? '启用中' : '已禁用',
                  isActive: k.is_active !== false && k.status !== 'disabled',
                  calls: k.usage_count || k.calls || k.total_calls || 0,
                  todayCost: k.today_cost != null ? '¥' + Number(k.today_cost).toFixed(2) : '--',
                  weekCost: k.week_cost != null ? '¥' + Number(k.week_cost).toFixed(2) : '--',
                  lastUsed: k.last_used_at || k.last_use || '--'
                })),
                requestCount: keys.reduce((sum, k) => sum + (k.usage_count || k.calls || 0), 0) + ''
              })
              return
            }
          }
        } catch (e) {
          continue
        }
      }
    } catch (err) {
      console.error('密钥查询失败:', err)
    }
  },

  // 查询使用记录
  async fetchUsage() {
    try {
      const endpoints = [
        '/dashboard/usage',
        '/v1/dashboard/billing/usage',
        '/usage',
        '/v1/usage'
      ]

      // 最近7天
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 7)
      const startDate = formatDate(start, 'YYYY-MM-DD')
      const endDate = formatDate(end, 'YYYY-MM-DD')

      for (const endpoint of endpoints) {
        try {
          const url = `${endpoint}?start_date=${startDate}&end_date=${endDate}`
          const res = await this.request(url)
          if (res.statusCode === 200 && res.data) {
            const d = res.data
            // 处理 token 用量
            if (d.total_tokens != null) {
              this.setData({ tokenUsage: this.formatTokens(d.total_tokens) })
            } else if (d.data && Array.isArray(d.data)) {
              const totalTokens = d.data.reduce((sum, item) => sum + (item.tokens || item.total_tokens || 0), 0)
              this.setData({ tokenUsage: this.formatTokens(totalTokens) })
            }

            // 处理使用记录列表
            const records = d.records || d.data || d.daily_costs || []
            if (Array.isArray(records)) {
              this.setData({
                records: records.slice(0, 20).map(r => ({
                  time: r.created_at || r.time || r.date || '--',
                  model: r.model || r.model_name || '--',
                  tokens: r.tokens || r.total_tokens || ((r.prompt_tokens || 0) + (r.completion_tokens || 0)) || 0,
                  cost: r.cost != null ? '¥' + Number(r.cost).toFixed(4) : 
                        r.amount != null ? '¥' + Number(r.amount).toFixed(4) : '--',
                  service: r.service || r.type || '--'
                }))
              })
            }
            return
          }
        } catch (e) {
          continue
        }
      }
    } catch (err) {
      console.error('使用记录查询失败:', err)
    }
  },

  // ========== 工具方法 ==========

  request(path) {
    const { apiConfig } = this.data
    const baseUrl = (apiConfig.baseUrl || 'https://api.aicodewith.com').replace(/\/$/, '')
    const url = baseUrl + path

    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${apiConfig.apiKey}`,
          'Content-Type': 'application/json'
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

  // ========== 导航 ==========

  onConfigTap() {
    wx.navigateTo({ url: '/pages/apimonitor/config/config' })
  },

  onPullDownRefresh() {
    this.fetchAll().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
