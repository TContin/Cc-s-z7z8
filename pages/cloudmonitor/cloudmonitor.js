const { getData, saveData, showToast, formatDate } = require('../../utils/util')
const { decrypt } = require('../../utils/crypto')

Page({
  data: {
    configured: false,
    loading: true,
    refreshing: false,
    lastUpdate: '',
    balance: null,
    instances: [],
    domains: [],
    certificates: [],
    errors: null
  },

  onLoad() {
    this.checkConfig()
  },

  onShow() {
    this.checkConfig()
  },

  checkConfig() {
    const config = getData('cloudConfig', null)
    if (config && config.secretId && config.secretKey) {
      this.setData({ configured: true })
      this.fetchDashboard()
    } else {
      this.setData({ configured: false, loading: false })
    }
  },

  async fetchDashboard() {
    this.setData({ loading: true })
    const config = getData('cloudConfig', null)
    if (!config) return

    try {
      const secretKey = decrypt(config.secretKey)
      if (!secretKey) {
        showToast('密钥解密失败')
        this.setData({ loading: false })
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
        this.setData({
          balance: d.balance,
          instances: d.instances || [],
          domains: this.processDomains(d.domains || []),
          certificates: this.processCerts(d.certificates || []),
          errors: d.errors,
          loading: false,
          refreshing: false,
          lastUpdate: formatDate(new Date(), 'HH:mm')
        })
      } else {
        showToast(res.error || '获取数据失败')
        this.setData({ loading: false, refreshing: false })
      }
    } catch (err) {
      console.error('仪表盘获取失败:', err)
      showToast('加载失败')
      this.setData({ loading: false, refreshing: false })
    }
  },

  processDomains(domains) {
    const now = new Date()
    return domains.map(d => {
      const exp = d.expiredDate ? new Date(d.expiredDate) : null
      const days = exp ? Math.ceil((exp - now) / 86400000) : -1
      let statusType = 'success'
      let statusText = days + '天'
      if (days < 0) { statusType = 'danger'; statusText = '已过期' }
      else if (days <= 30) { statusType = 'danger' }
      else if (days <= 90) { statusType = 'warning' }
      return { ...d, daysLeft: days, statusType, statusText }
    }).sort((a, b) => a.daysLeft - b.daysLeft)
  },

  processCerts(certs) {
    const now = new Date()
    return certs.map(c => {
      const exp = c.endTime ? new Date(c.endTime) : null
      const days = exp ? Math.ceil((exp - now) / 86400000) : -1
      let statusType = 'success'
      let statusText = days + '天'
      if (days < 0) { statusType = 'danger'; statusText = '已过期' }
      else if (days <= 30) { statusType = 'danger' }
      else if (days <= 90) { statusType = 'warning' }
      return { ...c, daysLeft: days, statusType, statusText }
    }).sort((a, b) => a.daysLeft - b.daysLeft)
  },

  getInstanceStatusText(status) {
    const map = {
      'PENDING': '创建中', 'LAUNCH_FAILED': '创建失败',
      'RUNNING': '运行中', 'STOPPED': '已关机',
      'STARTING': '开机中', 'STOPPING': '关机中',
      'REBOOTING': '重启中', 'SHUTDOWN': '待回收',
      'TERMINATING': '销毁中'
    }
    return map[status] || status
  },

  async onRefresh() {
    this.setData({ refreshing: true })
    await this.fetchDashboard()
  },

  onConfigTap() {
    wx.navigateTo({ url: '/pages/cloudmonitor/config/config' })
  },

  onPullDownRefresh() {
    this.fetchDashboard().then(() => wx.stopPullDownRefresh())
  }
})
