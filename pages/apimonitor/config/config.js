const { getData, saveData, showToast, showConfirm } = require('../../../utils/util')

Page({
  data: {
    userId: '',
    cookie: '',
    name: 'AI Code With',
    isEdit: false
  },

  onLoad() {
    const config = getData('apiConfig', null)
    if (config) {
      this.setData({
        userId: config.userId || '',
        cookie: config.cookie || '',
        name: config.name || 'AI Code With',
        isEdit: true
      })
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value })
  },

  onSave() {
    const { userId, cookie, name } = this.data

    if (!userId.trim()) {
      showToast('请输入 UserId')
      return
    }
    if (!cookie.trim()) {
      showToast('请输入 Cookie')
      return
    }

    const config = {
      userId: userId.trim(),
      cookie: cookie.trim(),
      name: name.trim() || 'AI Code With',
      updatedAt: new Date().toISOString()
    }

    saveData('apiConfig', config)
    showToast('已保存')
    setTimeout(() => wx.navigateBack(), 500)
  },

  async onDelete() {
    const confirm = await showConfirm('删除配置', '确定要删除 API 配置吗？')
    if (confirm) {
      wx.removeStorageSync('apiConfig')
      showToast('已删除')
      setTimeout(() => wx.navigateBack(), 500)
    }
  }
})
