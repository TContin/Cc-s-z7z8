const { getData, showConfirm, showToast, copyText, formatDate } = require('../../../utils/util')
const { decrypt } = require('../../../utils/crypto')

Page({
  data: {
    item: null,
    showPassword: false,
    decryptedPassword: ''
  },

  onLoad(options) {
    if (options.id) {
      this.loadItem(options.id)
    }
  },

  loadItem(id) {
    const list = getData('passwords', [])
    const item = list.find(i => i.id === id)
    if (!item) {
      showToast('记录不存在')
      wx.navigateBack()
      return
    }
    
    this.setData({
      item: {
        ...item,
        createdAtDisplay: formatDate(item.createdAt, 'YYYY-MM-DD HH:mm'),
        updatedAtDisplay: formatDate(item.updatedAt, 'YYYY-MM-DD HH:mm')
      },
      decryptedPassword: decrypt(item.encryptedPassword)
    })
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword })
  },

  copyAccount() {
    if (this.data.item) {
      copyText(this.data.item.account)
    }
  },

  copyPassword() {
    copyText(this.data.decryptedPassword)
  },

  copyWebsite() {
    if (this.data.item && this.data.item.website) {
      copyText(this.data.item.website)
    }
  },

  onEdit() {
    wx.navigateTo({
      url: `/pages/password/add/add?id=${this.data.item.id}`
    })
  },

  async onDelete() {
    const confirm = await showConfirm('删除确认', `确定要删除「${this.data.item.platform}」的记录吗？此操作不可恢复。`)
    if (confirm) {
      let list = getData('passwords', [])
      list = list.filter(i => i.id !== this.data.item.id)
      wx.setStorageSync('passwords', list)
      showToast('已删除')
      setTimeout(() => wx.navigateBack(), 500)
    }
  }
})
