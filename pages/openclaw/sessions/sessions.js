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
    activeSessions: 0
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

    this.setData({ loading: false, refreshing: false })
  },

  parseSession(s) {
    const key = s.key || s.sessionId || '--'
    const type = this.detectType(key, s.type)

    // 时间处理
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
        'telegram-dm': { type: 'dm', cls: 'dm', icon: '✈️', label: 'Telegram 私聊' },
        'telegram-group': { type: 'group', cls: 'group', icon: '✈️', label: 'Telegram 群聊' },
        'whatsapp-dm': { type: 'dm', cls: 'dm', icon: '📱', label: 'WhatsApp 私聊' },
        'whatsapp-group': { type: 'group', cls: 'group', icon: '📱', label: 'WhatsApp 群聊' },
        'cron': { type: 'cron', cls: 'cron', icon: '⏰', label: '定时任务' },
        'main': { type: 'main', cls: 'main', icon: '🦞', label: '主会话' }
      }
      if (map[explicitType]) return map[explicitType]
    }

    const k = key.toLowerCase()
    if (k.includes(':main')) return { type: 'main', cls: 'main', icon: '🦞', label: '主会话' }
    if (k.includes('feishu') && k.includes('direct')) return { type: 'dm', cls: 'dm', icon: '📎', label: '飞书私聊' }
    if (k.includes('feishu') && k.includes('group')) return { type: 'group', cls: 'group', icon: '📎', label: '飞书群聊' }
    if (k.includes('discord') && k.includes('direct')) return { type: 'dm', cls: 'dm', icon: '🎮', label: 'Discord 私聊' }
    if (k.includes('discord')) return { type: 'group', cls: 'group', icon: '🎮', label: 'Discord 频道' }
    if (k.includes('telegram') && k.includes('group')) return { type: 'group', cls: 'group', icon: '✈️', label: 'TG 群聊' }
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
