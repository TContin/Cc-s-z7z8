const { getData } = require('../../../utils/util')

const MAX_BAR_HEIGHT = 180 // rpx

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 88,
    tab: 'daily',
    summary: { totalTokens: '--', totalMessages: '--', totalSessions: '--' },
    chartData: [],
    rawData: { daily: [], weekly: [], monthly: [] }
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menuBtn = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : { top: 26, height: 32 }
    const statusBarHeight = sysInfo.statusBarHeight || 20
    const navBarHeight = statusBarHeight + menuBtn.height + (menuBtn.top - statusBarHeight) * 2
    this.setData({ statusBarHeight, navBarHeight })
  },

  onShow() { this.loadData() },
  goBack() { wx.navigateBack() },

  async loadData() {
    const config = getData('openclawConfig', null)
    if (!config || !config.serverUrl) return

    wx.showLoading({ title: '加载中...' })

    try {
      const res = await this.callCloud('getStatsDetail', config)

      if (res.success && res.data) {
        const d = res.data
        // 汇总
        this.setData({
          summary: {
            totalTokens: this.formatTokens(d.totalTokens || 0),
            totalMessages: (d.totalMessages || 0) + '',
            totalSessions: (d.totalSessions || 0) + ''
          },
          rawData: {
            daily: d.daily || [],
            weekly: d.weekly || [],
            monthly: d.monthly || []
          }
        })
        this.renderChart()
      } else {
        // fallback: 使用基础 stats
        const statsRes = await this.callCloud('getStats', config)
        if (statsRes.success && statsRes.data) {
          this.setData({
            summary: {
              totalTokens: this.formatTokens(statsRes.data.totalTokens || 0),
              totalMessages: (statsRes.data.totalMessages || 0) + '',
              totalSessions: (statsRes.data.totalSessions || 0) + ''
            }
          })
        }
      }
    } catch (e) {
      console.error('[Stats]', e)
    }

    wx.hideLoading()
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
    this.renderChart()
  },

  renderChart() {
    const data = this.data.rawData[this.data.tab] || []
    if (data.length === 0) {
      this.setData({ chartData: [] })
      return
    }

    // 找最大值用于归一化
    let maxToken = 0, maxMsg = 0
    data.forEach(d => {
      const total = (d.inputTokens || 0) + (d.outputTokens || 0) + (d.totalTokens || 0)
      if (total > maxToken) maxToken = total
      if ((d.messageCount || 0) > maxMsg) maxMsg = d.messageCount
    })

    // 只取最近 14 条
    const sliced = data.slice(-14)

    const chartData = sliced.map(d => {
      const input = d.inputTokens || 0
      const output = d.outputTokens || 0
      const total = d.totalTokens || (input + output)
      const msg = d.messageCount || 0

      return {
        date: d.date || '--',
        shortDate: this.shortDate(d.date),
        messageCount: msg,
        totalTokens: total,
        totalTokensText: this.formatTokens(total),
        inputHeight: maxToken > 0 ? Math.max(4, Math.round(input / maxToken * MAX_BAR_HEIGHT)) : 0,
        outputHeight: maxToken > 0 ? Math.max(4, Math.round(output / maxToken * MAX_BAR_HEIGHT)) : 0,
        msgHeight: maxMsg > 0 ? Math.max(4, Math.round(msg / maxMsg * MAX_BAR_HEIGHT)) : 0
      }
    })

    this.setData({ chartData })
  },

  shortDate(dateStr) {
    if (!dateStr) return '--'
    // "2026-03-31" → "3/31", "2026-W14" → "W14", "2026-03" → "3月"
    if (dateStr.includes('W')) return dateStr.split('-')[1]
    const parts = dateStr.split('-')
    if (parts.length === 3) return parseInt(parts[1]) + '/' + parseInt(parts[2])
    if (parts.length === 2) return parseInt(parts[1]) + '月'
    return dateStr
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
  }
})
