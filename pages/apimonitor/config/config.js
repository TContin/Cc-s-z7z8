const { getData, saveData, showToast, showConfirm } = require('../../../utils/util')

Page({
  data: {
    userId: '',
    cookie: '',
    name: 'AI Code With',
    isEdit: false,
    syncing: false
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

  // 上传配置到云端（开发者工具配好后点这个）
  async onUploadConfig() {
    const config = getData('apiConfig', null)
    if (!config || !config.cookie) {
      showToast('请先保存配置')
      return
    }

    this.setData({ syncing: true })
    wx.showLoading({ title: '上传中...' })

    try {
      const db = wx.cloud.database()
      const { result } = await wx.cloud.callFunction({ name: 'getOpenId' })
      const openid = result.openid

      const { data: existing } = await db.collection('user_data')
        .where({ _openid: openid })
        .limit(1)
        .get()

      const updateData = { apiConfig: config }

      if (existing.length > 0) {
        await db.collection('user_data').doc(existing[0]._id).update({ data: updateData })
      } else {
        await db.collection('user_data').add({ data: updateData })
      }

      wx.hideLoading()
      showToast('已上传到云端')
    } catch (err) {
      wx.hideLoading()
      console.error('上传失败:', err)
      showToast('上传失败')
    }
    this.setData({ syncing: false })
  },

  // 从云端拉取配置（手机端点这个）
  async onPullConfig() {
    this.setData({ syncing: true })
    wx.showLoading({ title: '拉取中...' })

    try {
      const db = wx.cloud.database()
      const { result } = await wx.cloud.callFunction({ name: 'getOpenId' })
      const openid = result.openid

      const { data } = await db.collection('user_data')
        .where({ _openid: openid })
        .limit(1)
        .get()

      wx.hideLoading()

      if (data.length > 0 && data[0].apiConfig) {
        const config = data[0].apiConfig
        saveData('apiConfig', config)
        this.setData({
          userId: config.userId || '',
          cookie: config.cookie || '',
          name: config.name || 'AI Code With',
          isEdit: true
        })
        showToast('配置已拉取')
      } else {
        showToast('云端无配置')
      }
    } catch (err) {
      wx.hideLoading()
      console.error('拉取失败:', err)
      showToast('拉取失败')
    }
    this.setData({ syncing: false })
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
