const { getData, showConfirm, showToast, formatDate, getExpireStatus, daysRemaining } = require('../../../utils/util')

Page({
  data: {
    item: null
  },

  onLoad(options) {
    if (options.id) {
      this.loadItem(options.id)
    }
  },

  onShow() {
    if (this.data.item) {
      this.loadItem(this.data.item.id)
    }
  },

  loadItem(id) {
    const list = getData('subscriptions', [])
    const item = list.find(i => i.id === id)
    if (!item) {
      showToast('记录不存在')
      wx.navigateBack()
      return
    }

    const status = getExpireStatus(item.expireDate)
    const days = daysRemaining(item.expireDate)
    const isPaid = item.cycle !== '无付费'
    const icon = item.iconLetter ? { letter: item.iconLetter, bg: item.iconBg, textColor: item.iconTextColor } : getIconByName(item.name)

    this.setData({
      item: {
        ...item,
        statusText: status.text,
        statusType: status.type,
        daysLeft: days,
        isPaid,
        brandLetter: icon.letter,
        brandBg: icon.bg,
        brandTextColor: icon.textColor || '#fff',
        createdAtDisplay: formatDate(item.createdAt, 'YYYY-MM-DD'),
        updatedAtDisplay: formatDate(item.updatedAt, 'YYYY-MM-DD'),
        monthlyPrice: (isPaid && item.price) ? this.calcMonthly(parseFloat(item.price), item.cycle) : ''
      }
    })
  },

  calcMonthly(price, cycle) {
    switch (cycle) {
      case '月付': return price.toFixed(2)
      case '季付': return (price / 3).toFixed(2)
      case '半年付': return (price / 6).toFixed(2)
      case '年付': return (price / 12).toFixed(2)
      default: return price.toFixed(2)
    }
  },

  onEdit() {
    wx.navigateTo({
      url: `/pages/subscription/add/add?id=${this.data.item.id}`
    })
  },

  onRenew() {
    const { item } = this.data
    const current = new Date(item.expireDate)
    const today = new Date()
    const base = current > today ? current : today

    if (item.isPaid) {
      switch (item.cycle) {
        case '月付': base.setMonth(base.getMonth() + 1); break
        case '季付': base.setMonth(base.getMonth() + 3); break
        case '半年付': base.setMonth(base.getMonth() + 6); break
        case '年付': base.setFullYear(base.getFullYear() + 1); break
        default: base.setMonth(base.getMonth() + 1); break
      }
    } else {
      // 无付费默认续期1个月
      base.setMonth(base.getMonth() + 1)
    }

    const newDate = formatDate(base, 'YYYY-MM-DD')
    let list = getData('subscriptions', [])
    const index = list.findIndex(i => i.id === item.id)
    if (index >= 0) {
      list[index].expireDate = newDate
      list[index].updatedAt = new Date().toISOString()
      wx.setStorageSync('subscriptions', list)
      showToast('已续期')
      this.loadItem(item.id)
    }
  },

  async onDelete() {
    const confirm = await showConfirm('删除确认', `确定要删除「${this.data.item.name}」吗？`)
    if (confirm) {
      let list = getData('subscriptions', [])
      list = list.filter(i => i.id !== this.data.item.id)
      wx.setStorageSync('subscriptions', list)
      showToast('已删除')
      setTimeout(() => wx.navigateBack(), 500)
    }
  }
})
