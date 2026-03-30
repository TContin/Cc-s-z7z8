const { generateId, showToast, getData, saveData, formatDate } = require('../../../utils/util')
const { getIconByName, iconList } = require('../../../utils/icons')

Page({
  data: {
    isEdit: false, id: '', name: '', price: '', cycle: '月付',
    expireDate: '', autoRenew: true, remark: '',
    iconLetter: '?', iconBg: '#FF3B30', iconLogo: '',
    cycles: ['无付费', '月付', '季付', '半年付', '年付'],
    cycleIndex: 1, isPaid: true,
    customIcons: [], showIconPicker: false,
    templates: [], showTemplates: false
  },

  onLoad(options) {
    const today = formatDate(new Date(), 'YYYY-MM-DD')
    const names = ['爱奇艺','优酷','腾讯视频','B站大会员','Netflix','Apple Music','QQ音乐','网易云音乐','Spotify','iCloud','WPS会员','GitHub Copilot','ChatGPT Plus','Adobe','Xbox Game Pass','PS Plus']
    const templates = names.map(name => {
      const icon = getIconByName(name)
      return { name, logo: icon.logo, letter: icon.letter, bg: icon.bg }
    })
    this.setData({ expireDate: today, templates, customIcons: iconList })
    if (options.id) { this.setData({ isEdit: true, id: options.id }); this.loadItem(options.id) }
  },

  loadItem(id) {
    const list = getData('subscriptions', [])
    const item = list.find(i => i.id === id)
    if (!item) { showToast('记录不存在'); wx.navigateBack(); return }
    const cycleIndex = this.data.cycles.indexOf(item.cycle)
    const isPaid = item.cycle !== '无付费'
    const icon = item.iconLogo ? { logo: item.iconLogo, letter: item.iconLetter, bg: item.iconBg } : getIconByName(item.name)
    this.setData({
      name: item.name || '', price: item.price || '',
      cycle: item.cycle || '月付', cycleIndex: cycleIndex >= 0 ? cycleIndex : 1, isPaid,
      expireDate: item.expireDate || '', autoRenew: item.autoRenew !== false,
      remark: item.remark || '',
      iconLetter: icon.letter, iconBg: icon.bg, iconLogo: icon.logo || ''
    })
    wx.setNavigationBarTitle({ title: '编辑订阅' })
  },

  onInput(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  onCycleChange(e) {
    const index = e.detail.value; const cycle = this.data.cycles[index]; const isPaid = cycle !== '无付费'
    this.setData({ cycleIndex: index, cycle, isPaid, price: isPaid ? this.data.price : '', autoRenew: isPaid ? this.data.autoRenew : false })
  },
  onDateChange(e) { this.setData({ expireDate: e.detail.value }) },
  onAutoRenewChange(e) { this.setData({ autoRenew: e.detail.value }) },
  toggleIconPicker() { this.setData({ showIconPicker: !this.data.showIconPicker }) },
  onIconSelect(e) {
    const { letter, bg } = e.currentTarget.dataset
    this.setData({ iconLetter: letter, iconBg: bg, iconLogo: '', showIconPicker: false })
  },
  toggleTemplates() { this.setData({ showTemplates: !this.data.showTemplates }) },
  onTemplateTap(e) {
    const tpl = e.currentTarget.dataset.tpl
    this.setData({ name: tpl.name, iconLetter: tpl.letter, iconBg: tpl.bg, iconLogo: tpl.logo || '', showTemplates: false })
  },

  onSave() {
    const { name, price, cycle, expireDate, autoRenew, remark, iconLetter, iconBg, iconLogo, isEdit, id, isPaid } = this.data
    if (!name.trim()) { showToast('请输入订阅名称'); return }
    if (!expireDate) { showToast('请选择到期日期'); return }
    const item = {
      id: isEdit ? id : generateId(), name: name.trim(),
      price: isPaid ? price : '', cycle, expireDate,
      autoRenew: isPaid ? autoRenew : false, remark: remark.trim(),
      iconLetter, iconBg, iconLogo: iconLogo || '',
      createdAt: isEdit ? undefined : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    let list = getData('subscriptions', [])
    if (isEdit) { const idx = list.findIndex(i => i.id === id); if (idx >= 0) { item.createdAt = list[idx].createdAt; list[idx] = item } }
    else { list.unshift(item) }
    if (saveData('subscriptions', list)) { showToast(isEdit ? '已更新' : '已保存'); setTimeout(() => wx.navigateBack(), 500) }
  }
})
