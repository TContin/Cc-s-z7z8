const { getData } = require('../../../utils/util')

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 88,
    refreshing: false,
    loading: false,
    currentFilter: 'all',
    agentId: '',

    sessions: [],
    filteredSessions: [],
    totalSessions: 0,
    totalTokens: '--',
    activeSessions: 0,

    // 模型选择弹窗
    showModelPicker: false,
    modelList: [],
    switchSessionKey: '',
    switchSessionIndex: -1,
    switchCurrentModel: ''
  },

  onLoad(options) {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menuBtn = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : { top: 26, height: 32 }
    const statusBarHeight = sysInfo.statusBarHeight || 20
    const navBarHeight = statusBarHeight + menuBtn.height + (menuBtn.top - statusBarHeight) * 2
    this.setData({ statusBarHeight, navBarHeight, agentId: options.agentId || '' })
  },

  onShow() { this.loadData() },
  goBack() { wx.navigateBack() },
  refreshAll() { this.setData({ refreshing: true }); this.loadData() },
  onPullRefresh() { this.refreshAll() },

  async loadData() {
    const config = getData('openclawConfig', null)
    if (!config || !config.serverUrl) return
    this.setData({ loading: true })

    // 并行加载会话和模型列表
    await Promise.all([
      this.fetchSessions(config),
      this.fetchModels(config)
    ])

    this.setData({ loading: false, refreshing: false })
  },

  async fetchSessions(config) {
    try {
      const res = await this.callCloud('getSessions', config, { agentId: this.data.agentId })
      if (res.success && res.data) {
        const raw = Array.isArray(res.data) ? res.data : (res.data.sessions || [])
        const sessions = raw.map(s => this.parseSession(s))

        let totalTk = 0
        let active = 0
        const now = Date.now()
        sessions.forEach(s => {
          totalTk += s.totalTokensRaw || 0
          if (s.updatedAtRaw && (now - s.updatedAtRaw) < 600000) active++
        })

        this.setData({
          sessions,
          totalSessions: sessions.length,
          totalTokens: this.formatTokens(totalTk),
          activeSessions: active
        })
        this.applyFilter()
      }
    } catch (e) {
      console.error('[Sessions]', e)
    }
  },

  async fetchModels(config) {
    try {
      const res = await this.callCloud('getModels', config)
      if (res.success && res.data) {
        const colors = ['#007AFF', '#FF9500', '#AF52DE', '#FF3B30', '#34C759', '#5AC8FA', '#FF2D55', '#FFCC00']
        let list = Array.isArray(res.data) ? res.data : (res.data.data || res.data.models || [])
        this.setData({
          modelList: list.map((m, i) => ({
            id: m.id || m.name || '',
            name: m.name || m.id || '--',
            providerId: m.providerId || m.owned_by || '',
            color: colors[i % colors.length]
          }))
        })
      }
    } catch (e) {
      console.error('[Sessions] fetchModels:', e)
    }
  },

  parseSession(s) {
    const key = s.key || s.sessionId || '--'
    const type = this.detectType(key, s.type)

    let updatedAtRaw = 0
    if (s.updatedAt) {
      updatedAtRaw = typeof s.updatedAt === 'number'
        ? (s.updatedAt < 1e12 ? s.updatedAt * 1000 : s.updatedAt)
        : new Date(s.updatedAt).getTime()
    }

    return {
      key,
      displayKey: this.shortKey(key),
      type: type.type,
      typeClass: type.cls,
      typeIcon: type.icon,
      typeLabel: type.label,
      target: s.target || '',
      totalTokensRaw: s.totalTokens || 0,
      totalTokensText: this.formatTokens(s.totalTokens || 0),
      contextTokensText: this.formatTokens(s.contextTokens || 0),
      systemSent: s.systemSent !== false,
      currentModel: s.currentModel || '',
      updatedAtRaw,
      updatedAtText: this.formatTime(updatedAtRaw)
    }
  },

  detectType(key, explicitType) {
    if (explicitType) {
      const map = {
        'feishu-dm': { type: 'dm', cls: 'dm', icon: '📎', label: '飞书私聊' },
        'feishu-group': { type: 'group', cls: 'group', icon: '📎', label: '飞书群聊' },
        'discord-dm': { type: 'dm', cls: 'dm', icon: '🎮', label: 'Discord 私聊' },
        'discord-channel': { type: 'group', cls: 'group', icon: '🎮', label: 'Discord 频道' },
        'telegram-dm': { type: 'dm', cls: 'dm', icon: '✈️', label: 'TG 私聊' },
        'telegram-group': { type: 'group', cls: 'group', icon: '✈️', label: 'TG 群聊' },
        'whatsapp-dm': { type: 'dm', cls: 'dm', icon: '📱', label: 'WhatsApp 私聊' },
        'whatsapp-group': { type: 'group', cls: 'group', icon: '📱', label: 'WhatsApp 群聊' },
        'wechat-dm': { type: 'dm', cls: 'dm', icon: '💬', label: '微信私聊' },
        'wechat-group': { type: 'group', cls: 'group', icon: '💬', label: '微信群聊' },
        'cron': { type: 'cron', cls: 'cron', icon: '⏰', label: '定时任务' },
        'main': { type: 'main', cls: 'main', icon: '🦞', label: '主会话' }
      }
      if (map[explicitType]) return map[explicitType]
    }

    const k = key.toLowerCase()
    if (k.includes(':main') || k === 'main') return { type: 'main', cls: 'main', icon: '🦞', label: '主会话' }
    if (k.startsWith('telegram:direct') || k.startsWith('telegram:slash')) return { type: 'dm', cls: 'dm', icon: '✈️', label: 'TG 私聊' }
    if (k.startsWith('telegram:group')) return { type: 'group', cls: 'group', icon: '✈️', label: 'TG 群聊' }
    if (k.includes('feishu') && k.includes('direct')) return { type: 'dm', cls: 'dm', icon: '📎', label: '飞书私聊' }
    if (k.includes('feishu') && k.includes('group')) return { type: 'group', cls: 'group', icon: '📎', label: '飞书群聊' }
    if (k.includes('discord') && k.includes('direct')) return { type: 'dm', cls: 'dm', icon: '🎮', label: 'Discord 私聊' }
    if (k.includes('discord')) return { type: 'group', cls: 'group', icon: '🎮', label: 'Discord 频道' }
    if (k.includes('wechat') || k.includes('weixin') || k.includes('openclaw-weixin')) {
      if (k.includes('group')) return { type: 'group', cls: 'group', icon: '💬', label: '微信群聊' }
      return { type: 'dm', cls: 'dm', icon: '💬', label: '微信私聊' }
    }
    if (k.includes('telegram')) return { type: 'dm', cls: 'dm', icon: '✈️', label: 'TG 私聊' }
    if (k.includes('telegram')) return { type: 'dm', cls: 'dm', icon: '✈️', label: 'TG 私聊' }
    if (k.includes('cron')) return { type: 'cron', cls: 'cron', icon: '⏰', label: '定时任务' }
    return { type: 'other', cls: 'other', icon: '💬', label: '其他' }
  },

  shortKey(key) {
    if (key.length <= 30) return key
    const parts = key.split(':')
    if (parts.length >= 3) return parts[0] + ':' + parts[1] + ':...' + parts[parts.length - 1].slice(-8)
    return key.slice(0, 15) + '...' + key.slice(-10)
  },

  setFilter(e) {
    this.setData({ currentFilter: e.currentTarget.dataset.type })
    this.applyFilter()
  },

  applyFilter() {
    const { sessions, currentFilter } = this.data
    if (currentFilter === 'all') {
      this.setData({ filteredSessions: sessions })
    } else {
      this.setData({ filteredSessions: sessions.filter(s => s.type === currentFilter) })
    }
  },

  // ========== 切换模型 ==========
  switchSessionModel(e) {
    const key = e.currentTarget.dataset.key
    const idx = e.currentTarget.dataset.index
    const session = this.data.filteredSessions[idx]

    if (this.data.modelList.length === 0) {
      wx.showToast({ title: '模型列表加载中', icon: 'none' })
      return
    }

    this.setData({
      showModelPicker: true,
      switchSessionKey: this.shortKey(key),
      switchSessionIndex: idx,
      switchCurrentModel: session ? session.currentModel : '',
      _switchRealKey: key
    })
  },

  closeModelPicker() {
    this.setData({ showModelPicker: false })
  },

  async selectModel(e) {
    const modelId = e.currentTarget.dataset.id
    const modelName = e.currentTarget.dataset.name
    const sessionKey = this.data._switchRealKey

    this.setData({ showModelPicker: false })
    wx.showLoading({ title: '切换中...' })

    const config = getData('openclawConfig', null)
    if (!config) { wx.hideLoading(); return }

    try {
      const res = await this.callCloud('switchSessionModel', config, {
        sessionKey,
        modelId,
        agentId: this.data.agentId || 'main'
      })

      // 更新本地显示
      const idx = this.data.filteredSessions.findIndex(s => s.key === sessionKey)
      if (idx >= 0) {
        this.setData({ [`filteredSessions[${idx}].currentModel`]: modelName })
      }
      const sIdx = this.data.sessions.findIndex(s => s.key === sessionKey)
      if (sIdx >= 0) {
        this.setData({ [`sessions[${sIdx}].currentModel`]: modelName })
      }

      wx.showToast({ title: '已切换到 ' + modelName, icon: 'success' })
    } catch (err) {
      wx.showToast({ title: '切换失败', icon: 'error' })
    }

    wx.hideLoading()
  },

  // ========== 删除会话 ==========
  deleteSession(e) {
    const key = e.currentTarget.dataset.key
    const idx = e.currentTarget.dataset.index

    wx.showModal({
      title: '删除会话',
      content: '确定删除此会话？此操作不可撤销。',
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '删除中...' })
        const config = getData('openclawConfig', null)
        if (!config) { wx.hideLoading(); return }

        try {
          await this.callCloud('deleteSession', config, {
            sessionKey: key,
            agentId: this.data.agentId || 'main'
          })

          // 从列表中移除
          const sessions = this.data.sessions.filter(s => s.key !== key)
          this.setData({ sessions, totalSessions: sessions.length })
          this.applyFilter()

          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'error' })
        }

        wx.hideLoading()
      }
    })
  },

  callCloud(action, config, extra) {
    return new Promise((resolve) => {
      wx.cloud.callFunction({
        name: 'openClawProxy',
        data: { action, serverUrl: config.serverUrl, apiToken: config.apiToken || '', ...(extra || {}) },
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
    const diff = Date.now() - ts
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return Math.floor(diff / 60000) + '分前'
    if (diff < 86400000) return Math.floor(diff / 3600000) + '时前'
    return Math.floor(diff / 86400000) + '天前'
  }
})
