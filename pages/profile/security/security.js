const { getData, showToast } = require('../../../utils/util')

Page({
  data: {
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value })
  },

  onSave() {
    const { oldPassword, newPassword, confirmPassword } = this.data
    const settings = getData('settings', {})

    if (!oldPassword) {
      showToast('请输入当前密码')
      return
    }

    if (oldPassword !== settings.password) {
      showToast('当前密码错误')
      return
    }

    if (!newPassword) {
      showToast('请输入新密码')
      return
    }

    if (newPassword.length < 4) {
      showToast('密码至少4位')
      return
    }

    if (newPassword !== confirmPassword) {
      showToast('两次输入不一致')
      return
    }

    settings.password = newPassword
    wx.setStorageSync('settings', settings)
    showToast('密码已修改')
    setTimeout(() => wx.navigateBack(), 500)
  }
})
