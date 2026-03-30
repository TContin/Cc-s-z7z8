const { getData, showConfirm, showToast, saveData } = require('../../utils/util')
const { uploadToCloud, syncFromCloud, clearCloudData } = require('../../utils/cloud')

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    settings: {},
    stats: {
      passwords: 0,
      subscriptions: 0,
      storageSize: '0 KB'
    },
    version: '1.1.0',
    syncing: false,
    uploading: false
  },

  onShow() {
    this.loadUserInfo()
    this.loadSettings()
    this.loadStats()
  },

  // ========== 用户登录 ==========

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo && userInfo.nickName) {
      this.setData({
        isLoggedIn: true,
        userInfo
      })
      getApp().globalData.userInfo = userInfo
    } else {
      this.setData({ isLoggedIn: false, userInfo: null })
    }
  },

  // 微信登录
  onLogin() {
    wx.navigateTo({ url: '/pages/profile/login/login' })
  },

  saveUserInfo(userInfo) {
    wx.setStorageSync('userInfo', userInfo)
    getApp().globalData.userInfo = userInfo
    this.setData({ isLoggedIn: true, userInfo })
    showToast('登录成功')

    // 如果开启了云同步，自动上传
    const settings = getData('settings', {})
    if (settings.cloudSync) {
      this.doUpload()
    }
  },

  onLogout() {
    showConfirm('退出登录', '退出后头像和昵称将被清除，云同步将关闭。').then(confirm => {
      if (confirm) {
        wx.removeStorageSync('userInfo')
        getApp().globalData.userInfo = null

        // 关闭云同步
        const settings = getData('settings', {})
        settings.cloudSync = false
        saveData('settings', settings)

        this.setData({
          isLoggedIn: false,
          userInfo: null,
          settings
        })
        showToast('已退出')
      }
    })
  },

  // 头像昵称组件回调
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    const userInfo = this.data.userInfo || {}
    userInfo.avatarUrl = avatarUrl
    this.setData({ userInfo })
  },

  onNicknameInput(e) {
    const nickName = e.detail.value
    const userInfo = this.data.userInfo || {}
    userInfo.nickName = nickName
    this.setData({ userInfo })
  },

  // ========== 设置 ==========

  loadSettings() {
    const settings = getData('settings', {
      passwordProtect: false,
      password: '',
      autoLock: true,
      lockTimeout: 5,
      cloudSync: false
    })
    this.setData({ settings })
  },

  loadStats() {
    const passwords = getData('passwords', [])
    const subscriptions = getData('subscriptions', [])
    const info = wx.getStorageInfoSync()
    
    this.setData({
      stats: {
        passwords: passwords.length,
        subscriptions: subscriptions.length,
        storageSize: (info.currentSize || 0) + ' KB'
      }
    })
  },

  onPasswordProtectChange(e) {
    const enabled = e.detail.value
    if (enabled) {
      wx.showModal({
        title: '设置访问密码',
        editable: true,
        placeholderText: '请输入4-16位密码',
        confirmColor: '#007AFF',
        success: (res) => {
          if (res.confirm && res.content) {
            if (res.content.length < 4) {
              showToast('密码至少4位')
              return
            }
            const settings = this.data.settings
            settings.passwordProtect = true
            settings.password = res.content
            wx.setStorageSync('settings', settings)
            this.setData({ settings })
            showToast('密码保护已开启')
          }
        }
      })
    } else {
      const settings = this.data.settings
      settings.passwordProtect = false
      settings.password = ''
      wx.setStorageSync('settings', settings)
      getApp().globalData.isUnlocked = true
      this.setData({ settings })
      showToast('密码保护已关闭')
    }
  },

  // ========== 云同步 ==========

  onCloudSyncChange(e) {
    const enabled = e.detail.value

    if (enabled && !this.data.isLoggedIn) {
      showToast('请先登录')
      return
    }

    const settings = this.data.settings
    settings.cloudSync = enabled
    wx.setStorageSync('settings', settings)
    this.setData({ settings })

    if (enabled) {
      showToast('云同步已开启')
      this.doUpload()
    } else {
      showToast('云同步已关闭')
    }
  },

  // 上传到云端
  async doUpload() {
    if (this.data.uploading) return
    this.setData({ uploading: true })

    wx.showLoading({ title: '正在上传...' })
    const result = await uploadToCloud()
    wx.hideLoading()

    this.setData({ uploading: false })

    if (result.success) {
      showToast('已同步到云端')
    } else {
      showToast(result.error || '上传失败')
    }
  },

  // 从云端同步到本地
  async onSyncFromCloud() {
    if (!this.data.isLoggedIn) {
      showToast('请先登录')
      return
    }

    const confirm = await showConfirm(
      '同步数据',
      '云端数据将覆盖本地数据，确定继续吗？'
    )
    if (!confirm) return

    if (this.data.syncing) return
    this.setData({ syncing: true })

    wx.showLoading({ title: '正在同步...' })
    const result = await syncFromCloud()
    wx.hideLoading()

    this.setData({ syncing: false })

    if (result.success) {
      showToast('同步成功')
      this.loadSettings()
      this.loadStats()
    } else {
      showToast(result.error || '同步失败')
    }
  },

  // ========== 其他 ==========

  onSecurityTap() {
    wx.navigateTo({ url: '/pages/profile/security/security' })
  },

  onAboutTap() {
    wx.navigateTo({ url: '/pages/profile/about/about' })
  },

  async onExportData() {
    const passwords = getData('passwords', [])
    const subscriptions = getData('subscriptions', [])
    
    let text = '=== 私人工具箱数据摘要 ===\n\n'
    text += `统计：${passwords.length} 条密码，${subscriptions.length} 个订阅\n\n`
    
    text += '--- 密码记录 ---\n'
    passwords.forEach(p => {
      text += `• ${p.platform} (${p.account}) [${p.category}]\n`
    })

    text += '\n--- 订阅记录 ---\n'
    subscriptions.forEach(s => {
      text += `• ${s.name} - ${s.expireDate} (${s.cycle}${s.price ? ' ¥' + s.price : ''})\n`
    })

    wx.setClipboardData({
      data: text,
      success() {
        showToast('已复制到剪贴板')
      }
    })
  },

  async onClearData() {
    const items = ['仅清除本地数据', '仅清除云端数据', '清除本地 + 云端数据']
    const that = this

    wx.showActionSheet({
      itemList: items,
      async success(res) {
        const choice = res.tapIndex
        const confirm = await showConfirm('确认清除', items[choice] + '，此操作不可恢复！')
        if (!confirm) return

        wx.showLoading({ title: '清除中...' })

        // 清除本地
        if (choice === 0 || choice === 2) {
          wx.setStorageSync('passwords', [])
          wx.setStorageSync('subscriptions', [])
        }

        // 清除云端
        if (choice === 1 || choice === 2) {
          const result = await clearCloudData()
          if (!result.success) {
            wx.hideLoading()
            showToast(result.error || '云端清除失败')
            return
          }
        }

        wx.hideLoading()
        showToast('已清除')
        that.loadStats()
      }
    })
  }
})
