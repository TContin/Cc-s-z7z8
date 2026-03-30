const { modules } = require('../../utils/modules')
const { getData, getExpireStatus } = require('../../utils/util')

Page({
  data: {
    modules: [],
    stats: {},
    greeting: '',
    today: ''
  },

  onLoad() {
    this.setGreeting()
  },

  onShow() {
    this.loadModules()
    this.loadStats()
  },

  setGreeting() {
    const now = new Date()
    const hour = now.getHours()
    let greeting = ''
    if (hour < 6) greeting = '夜深了'
    else if (hour < 9) greeting = '早上好'
    else if (hour < 12) greeting = '上午好'
    else if (hour < 14) greeting = '中午好'
    else if (hour < 18) greeting = '下午好'
    else if (hour < 22) greeting = '晚上好'
    else greeting = '夜深了'

    const weekday = ['日', '一', '二', '三', '四', '五', '六']
    const m = now.getMonth() + 1
    const d = now.getDate()
    const today = `${m}月${d}日 周${weekday[now.getDay()]}`

    this.setData({ greeting, today })
  },

  loadModules() {
    this.setData({ modules })
  },

  loadStats() {
    const passwords = getData('passwords', [])
    const subscriptions = getData('subscriptions', [])
    
    let expiringSoon = 0
    let expired = 0
    subscriptions.forEach(sub => {
      const status = getExpireStatus(sub.expireDate)
      if (status.days < 0) expired++
      else if (status.days <= 7) expiringSoon++
    })

    this.setData({
      stats: {
        passwordCount: passwords.length,
        subscriptionCount: subscriptions.length,
        expiringSoon,
        expired
      }
    })
  },

  onModuleTap(e) {
    const { page } = e.currentTarget.dataset
    wx.navigateTo({ url: page })
  }
})
