const { showToast } = require('../../../utils/util')

Page({
  data: {
    avatarUrl: '',
    nickName: ''
  },

  // 微信头像选择器回调 - 返回的就是微信头像
  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },

  // 微信昵称组件回调
  onNicknameChange(e) {
    this.setData({ nickName: e.detail.value })
  },

  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value })
  },

  onConfirm() {
    const { avatarUrl, nickName } = this.data

    if (!avatarUrl) {
      showToast('请点击上方选择微信头像')
      return
    }
    if (!nickName.trim()) {
      showToast('请点击昵称框获取微信昵称')
      return
    }

    const userInfo = {
      avatarUrl,
      nickName: nickName.trim()
    }

    // 保存用户信息
    wx.setStorageSync('userInfo', userInfo)
    getApp().globalData.userInfo = userInfo
    showToast('登录成功')
    setTimeout(() => wx.navigateBack(), 500)
  }
})
