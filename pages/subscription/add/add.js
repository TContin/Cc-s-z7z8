const { generateId, showToast, getData, saveData, formatDate } = require('../../../utils/util')

Page({
  data: {
    isEdit: false,
    id: '',
    name: '',
    price: '',
    cycle: '月付',
    expireDate: '',
    autoRenew: true,
    remark: '',
    icon: '📋',
    bgColor: '#FFE5E3',
    cycles: ['无付费', '月付', '季付', '半年付', '年付'],
    cycleIndex: 1,
    isPaid: true,
    icons: ['📋', '🎬', '🎵', '📱', '☁️', '🎮', '📧', '🛡️', '📦', '💻', '📡', '🏋️'],
    showIconPicker: false,
    templates: [
      { name: '爱奇艺', icon: '🎬', bgColor: '#E8F5E9' },
      { name: '优酷', icon: '🎬', bgColor: '#FFF3E0' },
      { name: '腾讯视频', icon: '🎬', bgColor: '#E3F2FD' },
      { name: 'B站大会员', icon: '🎬', bgColor: '#FCE4EC' },
      { name: 'Netflix', icon: '🎬', bgColor: '#FFEBEE' },
      { name: 'Apple Music', icon: '🎵', bgColor: '#F3E5F5' },
      { name: 'QQ音乐', icon: '🎵', bgColor: '#E8F5E9' },
      { name: '网易云音乐', icon: '🎵', bgColor: '#FFEBEE' },
      { name: 'Spotify', icon: '🎵', bgColor: '#E8F5E9' },
      { name: 'iCloud', icon: '☁️', bgColor: '#E3F2FD' },
      { name: 'WPS会员', icon: '📦', bgColor: '#FFF3E0' },
      { name: 'GitHub Copilot', icon: '💻', bgColor: '#E8EAF6' },
      { name: 'ChatGPT Plus', icon: '💻', bgColor: '#E0F2F1' },
      { name: 'Adobe', icon: '📦', bgColor: '#FFEBEE' },
      { name: 'Xbox Game Pass', icon: '🎮', bgColor: '#E8F5E9' },
      { name: 'PS Plus', icon: '🎮', bgColor: '#E3F2FD' }
    ],
    showTemplates: false
  },

  onLoad(options) {
    const today = formatDate(new Date(), 'YYYY-MM-DD')
    this.setData({ expireDate: today })

    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      this.loadItem(options.id)
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

    const cycleIndex = this.data.cycles.indexOf(item.cycle)
    const isPaid = item.cycle !== '无付费'

    this.setData({
      name: item.name || '',
      price: item.price || '',
      cycle: item.cycle || '月付',
      cycleIndex: cycleIndex >= 0 ? cycleIndex : 1,
      isPaid,
      expireDate: item.expireDate || '',
      autoRenew: item.autoRenew !== false,
      remark: item.remark || '',
      icon: item.icon || '📋',
      bgColor: item.bgColor || '#FFE5E3'
    })

    wx.setNavigationBarTitle({ title: '编辑订阅' })
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value })
  },

  onCycleChange(e) {
    const index = e.detail.value
    const cycle = this.data.cycles[index]
    const isPaid = cycle !== '无付费'
    this.setData({
      cycleIndex: index,
      cycle,
      isPaid,
      // 选无付费时清空价格和自动续费
      price: isPaid ? this.data.price : '',
      autoRenew: isPaid ? this.data.autoRenew : false
    })
  },

  onDateChange(e) {
    this.setData({ expireDate: e.detail.value })
  },

  onAutoRenewChange(e) {
    this.setData({ autoRenew: e.detail.value })
  },

  toggleIconPicker() {
    this.setData({ showIconPicker: !this.data.showIconPicker })
  },

  onIconSelect(e) {
    const icon = e.currentTarget.dataset.icon
    this.setData({ icon, showIconPicker: false })
  },

  toggleTemplates() {
    this.setData({ showTemplates: !this.data.showTemplates })
  },

  onTemplateTap(e) {
    const tpl = e.currentTarget.dataset.tpl
    this.setData({
      name: tpl.name,
      icon: tpl.icon,
      bgColor: tpl.bgColor,
      showTemplates: false
    })
  },

  onSave() {
    const { name, price, cycle, expireDate, autoRenew, remark, icon, bgColor, isEdit, id, isPaid } = this.data

    if (!name.trim()) {
      showToast('请输入订阅名称')
      return
    }
    if (!expireDate) {
      showToast('请选择到期日期')
      return
    }

    const item = {
      id: isEdit ? id : generateId(),
      name: name.trim(),
      price: isPaid ? price : '',
      cycle,
      expireDate,
      autoRenew: isPaid ? autoRenew : false,
      remark: remark.trim(),
      icon,
      bgColor,
      createdAt: isEdit ? undefined : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    let list = getData('subscriptions', [])
    if (isEdit) {
      const index = list.findIndex(i => i.id === id)
      if (index >= 0) {
        item.createdAt = list[index].createdAt
        list[index] = item
      }
    } else {
      list.unshift(item)
    }

    if (saveData('subscriptions', list)) {
      showToast(isEdit ? '已更新' : '已保存')
      setTimeout(() => wx.navigateBack(), 500)
    }
  }
})
