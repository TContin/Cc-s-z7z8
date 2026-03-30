const { getData, showConfirm, showToast, getExpireStatus } = require('../../utils/util')

Page({
  data: {
    list: [],
    filteredList: [],
    isEmpty: true,
    currentTab: 'all',
    tabs: [
      { key: 'all', name: '全部' },
      { key: 'active', name: '正常' },
      { key: 'expiring', name: '即将到期' },
      { key: 'expired', name: '已过期' }
    ],
    totalMonthly: '0.00',
    hasPaidSubs: false
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const list = getData('subscriptions', [])
    
    const enrichedList = list.map(item => {
      const status = getExpireStatus(item.expireDate)
      return {
        ...item,
        statusText: status.text,
        statusType: status.type,
        daysLeft: status.days,
        isPaid: item.cycle !== '无付费'
      }
    }).sort((a, b) => a.daysLeft - b.daysLeft)

    // 只统计有付费的订阅月均花费
    let totalMonthly = 0
    let hasPaidSubs = false
    enrichedList.forEach(item => {
      if (item.daysLeft >= 0 && item.price && item.isPaid) {
        hasPaidSubs = true
        const price = parseFloat(item.price) || 0
        switch (item.cycle) {
          case '月付': totalMonthly += price; break
          case '季付': totalMonthly += price / 3; break
          case '半年付': totalMonthly += price / 6; break
          case '年付': totalMonthly += price / 12; break
        }
      }
    })

    this.setData({
      list: enrichedList,
      totalMonthly: totalMonthly.toFixed(2),
      hasPaidSubs
    })
    this.filterList()
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    this.filterList()
  },

  filterList() {
    const { list, currentTab } = this.data
    let filtered = list

    switch (currentTab) {
      case 'active':
        filtered = list.filter(i => i.daysLeft > 7)
        break
      case 'expiring':
        filtered = list.filter(i => i.daysLeft >= 0 && i.daysLeft <= 7)
        break
      case 'expired':
        filtered = list.filter(i => i.daysLeft < 0)
        break
    }

    this.setData({ filteredList: filtered, isEmpty: filtered.length === 0 })
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/subscription/add/add' })
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/subscription/detail/detail?id=${id}` })
  },

  async onItemLongpress(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(i => i.id === id)
    if (!item) return

    const confirm = await showConfirm('删除确认', `确定要删除「${item.name}」吗？`)
    if (confirm) {
      let list = getData('subscriptions', [])
      list = list.filter(i => i.id !== id)
      wx.setStorageSync('subscriptions', list)
      showToast('已删除')
      this.loadData()
    }
  }
})
