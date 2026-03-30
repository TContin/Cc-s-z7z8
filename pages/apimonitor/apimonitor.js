const { getData, saveData, showToast, formatDate } = require('../../utils/util')

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
    // 先检查 Token 是否即将过期，提前刷新
    await this.checkAndRefreshToken()
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

  // ========== Token 过期检测 & 提前刷新 ==========
  async checkAndRefreshToken() {
    const { apiConfig } = this.data
    if (!apiConfig || !apiConfig.cookie) return

    try {
      // 从 Cookie 中解析 access_token 的过期时间
      const expiresAt = this.getTokenExpiresAt(apiConfig.cookie)
      if (!expiresAt) return

      const now = Math.floor(Date.now() / 1000)
      const remaining = expiresAt - now

      // 还剩 5 分钟以内，提前刷新
      if (remaining < 300) {
        console.log(`Token 即将过期（剩余 ${remaining}s），主动刷新...`)
        const res = await this.callRefreshToken(apiConfig.cookie)
        if (res && res.cookie) {
          await this.updateCookieEverywhere(res.cookie)
          console.log('Token 提前刷新成功')
        } else {
          console.warn('Token 提前刷新失败，继续使用旧 Token')
        }
      }
    } catch (err) {
      console.error('Token 过期检测失败:', err)
    }
  },

  // 从 Cookie 中解析 Supabase auth token 的 expires_at
  getTokenExpiresAt(cookie) {
    try {
      const parts = []
      const regex = /sb-[^-]+-auth-token\.(\d+)=([^;]+)/g
      let match
      while ((match = regex.exec(cookie)) !== null) {
        parts.push({ index: parseInt(match[1]), value: match[2] })
      }
      parts.sort((a, b) => a.index - b.index)
      if (parts.length === 0) return null

      let tokenStr = parts.map(p => p.value).join('')
      if (tokenStr.startsWith('base64-')) {
        tokenStr = tokenStr.substring(7)
      }

      // Base64 解码 — 小程序环境用 base64ToArrayBuffer
      const buffer = wx.base64ToArrayBuffer(tokenStr)
      const arr = new Uint8Array(buffer)
      let decoded = ''
      for (let i = 0; i < arr.length; i++) {
        decoded += String.fromCharCode(arr[i])
      }
      const authData = JSON.parse(decoded)
      return authData.expires_at || null
    } catch (e) {
      return null
    }
  },

  // 调用云函数主动刷新 Token
  callRefreshToken(cookie) {
    return new Promise((resolve) => {
      wx.cloud.callFunction({
        name: 'apiProxy',
        data: { action: 'refreshToken', cookie },
        success: (res) => {
          if (res.result && res.result.success) {
            resolve(res.result)
          } else {
            resolve(null)
          }
        },
        fail: () => resolve(null)
      })
    })
  },

  // 更新 Cookie 到本地 + 页面数据 + 云端
  async updateCookieEverywhere(newCookie) {
    const config = getData('apiConfig', {})
    config.cookie = newCookie
    config.updatedAt = new Date().toISOString()
    saveData('apiConfig', config)
    this.setData({ apiConfig: config })

    // 同步到云端，让其他设备也能用新 Token
    this.syncConfigToCloud(config)
  },

  // 将配置同步到云端
  syncConfigToCloud(config) {
    wx.cloud.callFunction({
      name: 'getOpenId',
      success: (idRes) => {
        const openid = idRes.result && idRes.result.openid
        if (!openid) return

        const db = wx.cloud.database()
        db.collection('user_data')
          .where({ _openid: openid })
          .limit(1)
          .get()
          .then(({ data: existing }) => {
            const updateData = { apiConfig: config }
            if (existing.length > 0) {
              db.collection('user_data').doc(existing[0]._id).update({ data: updateData })
            } else {
              db.collection('user_data').add({ data: updateData })
            }
            console.log('Token 已同步到云端')
          })
          .catch(err => console.error('云端同步失败:', err))
      }
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
        const records = d.records || d.data || d.list || []
        if (Array.isArray(records)) {
          this.setData({
            records: records.slice(0, 30).map(r => ({
              time: this.formatTime(r.timestamp || r.createdAt || ''),
              service: r.service || '--',
              model: r.modelName || r.model || '--',
              discount: r.channelDiscount ? (Number(r.channelDiscount) * 10).toFixed(0) + '折' : '--',
              channel: r.channelName || '--',
              inputTokens: r.inputTokens || 0,
              outputTokens: r.outputTokens || 0,
              firstByte: r.firstByteLatencyMs != null ? (r.firstByteLatencyMs / 1000).toFixed(1) + 's' : '--',
              duration: r.totalDurationMs != null ? (r.totalDurationMs / 1000).toFixed(1) + 's' : '--',
              keyName: r.apiKeyName || '--',
              cost: r.totalCostCNY != null ? '-¥' + Number(r.totalCostCNY).toFixed(4) :
                    r.totalCost != null ? '-$' + Number(r.totalCost).toFixed(4) : '--'
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
          // 如果云函数返回了新 Cookie（token 被自动刷新了），更新本地 + 云端
          if (res.result && res.result.newCookie) {
            this.updateCookieEverywhere(res.result.newCookie)
            console.log('Token 已自动刷新并同步云端')
          }
          resolve({
            statusCode: (res.result && res.result.statusCode) || 200,
            data: res.result && res.result.data
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
