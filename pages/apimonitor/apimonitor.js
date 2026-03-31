const { getData, saveData, showToast, formatDate } = require('../../utils/util')
const { decrypt } = require('../../utils/crypto')
const { checkTokenLocally, callCloudFunction, formatTokens: fmtTokens } = require('../../utils/api')

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
    lastUpdate: '',
    // Token 状态相关
    tokenStatus: '', // 'valid' | 'expiring' | 'expired' | 'error'
    tokenStatusText: '',
    needReLogin: false,
    refreshFailCount: 0,
    hasCredentials: false
  },

  _loaded: false,

  onLoad() {
    this._loaded = false
    this.checkConfig()
  },

  onShow() {
    // 防止 onLoad + onShow 首次双重触发
    if (!this._loaded) {
      this._loaded = true
      return
    }
    this.checkConfig()
  },

  checkConfig() {
    const config = getData('apiConfig', null)
    const credentials = getData('apiCredentials', null)
    const hasCred = !!(credentials && credentials.email && credentials.password)

    if (config && (config.cookie || hasCred)) {
      this.setData({
        configured: true,
        apiConfig: config || {},
        needReLogin: false,
        hasCredentials: hasCred
      })
      // 如果没有 cookie 但有凭证，先登录获取 cookie
      if (!config || !config.cookie) {
        this.setData({ loading: true })
        this.loginWithCredentials().then((ok) => {
          if (ok) {
            this.fetchAll()
          } else {
            this.setData({ loading: false })
          }
        })
      } else {
        this.fetchAll()
      }
    } else {
      this.setData({ configured: false, loading: false, hasCredentials: false })
    }
  },

  async fetchAll() {
    this.setData({ loading: true })
    // 先检查 Token 是否即将过期，提前刷新
    const tokenOk = await this.checkAndRefreshToken()
    if (!tokenOk && this.data.needReLogin) {
      // Token 彻底无效，不再发无效请求
      this.setData({ loading: false, refreshing: false })
      return
    }
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
    const { apiConfig, refreshFailCount } = this.data
    if (!apiConfig || !apiConfig.cookie) return false

    // 如果连续刷新失败超过 2 次，尝试密码登录
    if (refreshFailCount >= 2) {
      console.log('刷新失败次数过多，尝试密码登录...')
      const loginOk = await this.loginWithCredentials()
      if (loginOk) return true

      this.setData({
        tokenStatus: 'error',
        tokenStatusText: 'Cookie 已彻底失效',
        needReLogin: true
      })
      return false
    }

    try {
      const expiresAt = this.getTokenExpiresAt(apiConfig.cookie)
      if (!expiresAt) {
        this.setData({ tokenStatus: 'error', tokenStatusText: 'Cookie 格式异常' })
        return true
      }

      const now = Math.floor(Date.now() / 1000)
      const remaining = expiresAt - now

      if (remaining > 300) {
        const mins = Math.floor(remaining / 60)
        this.setData({
          tokenStatus: 'valid',
          tokenStatusText: `有效（${mins}分钟）`,
          refreshFailCount: 0
        })
        return true
      }

      // Token 即将过期或已过期，尝试刷新
      this.setData({
        tokenStatus: remaining > 0 ? 'expiring' : 'expired',
        tokenStatusText: remaining > 0 ? '即将过期，刷新中...' : '已过期，刷新中...'
      })

      console.log(`Token ${remaining > 0 ? '即将过期' : '已过期'}（剩余 ${remaining}s），主动刷新...`)
      const res = await this.callRefreshToken(apiConfig.cookie)

      if (res && res.success && res.cookie) {
        await this.updateCookieEverywhere(res.cookie)
        const newExpMin = res.expiresIn ? Math.floor(res.expiresIn / 60) : 60
        this.setData({
          tokenStatus: 'valid',
          tokenStatusText: `已刷新（${newExpMin}分钟）`,
          needReLogin: false,
          refreshFailCount: 0
        })
        console.log('Token 提前刷新成功')
        return true
      }

      // refresh_token 刷新失败，尝试密码登录
      console.warn('refresh_token 刷新失败，尝试密码登录...')
      const loginOk = await this.loginWithCredentials()
      if (loginOk) return true

      // 密码登录也失败
      const newFailCount = refreshFailCount + 1
      const isReLoginNeeded = (res && res.needReLogin) || newFailCount >= 2
      const errMsg = (res && res.error) || '刷新失败'

      this.setData({
        tokenStatus: 'error',
        tokenStatusText: this.data.hasCredentials ? errMsg : '需要配置登录凭证',
        needReLogin: isReLoginNeeded,
        refreshFailCount: newFailCount
      })

      if (isReLoginNeeded && !this.data.hasCredentials) {
        wx.showModal({
          title: 'Cookie 已失效',
          content: '建议在设置中保存 aicodewith.com 的邮箱和密码，即可永久自动刷新，无需手动更新 Cookie。',
          confirmText: '去设置',
          cancelText: '稍后',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.navigateTo({ url: '/pages/apimonitor/config/config' })
            }
          }
        })
        return false
      }

      return !isReLoginNeeded
    } catch (err) {
      console.error('Token 过期检测失败:', err)
      this.setData({ tokenStatus: 'error', tokenStatusText: '检测异常' })
      return true
    }
  },

  // ========== 使用账号密码重新登录获取全新 Cookie ==========
  async loginWithCredentials() {
    const credentials = getData('apiCredentials', null)
    if (!credentials || !credentials.email || !credentials.password) {
      console.log('未保存登录凭证，跳过密码登录')
      return false
    }

    this.setData({
      tokenStatus: 'expiring',
      tokenStatusText: '正在使用账号密码重新登录...'
    })

    try {
      // 解密密码
      const plainPassword = decrypt(credentials.password)
      if (!plainPassword) {
        console.error('密码解密失败')
        return false
      }

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
        // 更新 config
        const config = getData('apiConfig', {})
        config.cookie = res.cookie
        config.updatedAt = new Date().toISOString()
        // 如果登录返回了 userId 且之前没配置，自动填入
        if (res.userId && !config.userId) {
          config.userId = res.userId
        }
        saveData('apiConfig', config)
        this.setData({ apiConfig: config })

        // 同步到云端
        this.syncConfigToCloud(config)

        const newExpMin = res.expiresIn ? Math.floor(res.expiresIn / 60) : 60
        this.setData({
          tokenStatus: 'valid',
          tokenStatusText: `已重新登录（${newExpMin}分钟）`,
          needReLogin: false,
          refreshFailCount: 0
        })
        console.log('密码登录成功，Cookie 已自动更新')
        showToast('已自动重新登录')
        return true
      }

      console.error('密码登录失败:', res.error)
      return false
    } catch (err) {
      console.error('密码登录异常:', err)
      return false
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
          if (res.result) {
            resolve(res.result)
          } else {
            resolve({ success: false, error: '云函数返回空' })
          }
        },
        fail: (err) => resolve({ success: false, error: err.errMsg || '云函数调用失败' })
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

    this.syncConfigToCloud(config)
  },

  // 将配置同步到云端（使用全局缓存的 openId）
  async syncConfigToCloud(config) {
    try {
      const { getOpenId } = require('../../utils/api')
      const openid = await getOpenId()
      if (!openid) return

      const db = wx.cloud.database()
      const { data: existing } = await db.collection('user_data')
        .where({ _openid: openid })
        .limit(1)
        .get()

      const updateData = { apiConfig: config }
      if (existing.length > 0) {
        db.collection('user_data').doc(existing[0]._id).update({ data: updateData })
      } else {
        db.collection('user_data').add({ data: updateData })
      }
      console.log('Token 已同步到云端')
    } catch (err) {
      console.error('云端同步失败:', err)
    }
  },

  async onRefresh() {
    // 手动刷新时重置失败计数，允许重新尝试
    this.setData({ refreshing: true, refreshFailCount: 0, needReLogin: false })
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
        success: async (res) => {
          const result = res.result || {}

          // 如果云函数返回了新 Cookie（token 被自动刷新了），更新本地 + 云端
          if (result.newCookie) {
            this.updateCookieEverywhere(result.newCookie)
            this.setData({
              tokenStatus: 'valid',
              tokenStatusText: '已自动刷新',
              needReLogin: false,
              refreshFailCount: 0
            })
            console.log('Token 已自动刷新并同步云端')
          }

          // 如果云函数标记需要重新登录，先尝试密码登录
          if (result.needReLogin) {
            const loginOk = await this.loginWithCredentials()
            if (loginOk) {
              // 用新 cookie 重试这个请求
              try {
                const retryResult = await this.request(path)
                resolve(retryResult)
                return
              } catch (e) {
                // 重试也失败了，返回原始结果
              }
            }
            this.setData({
              tokenStatus: 'error',
              tokenStatusText: result.error || 'Cookie 已失效',
              needReLogin: true
            })
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
