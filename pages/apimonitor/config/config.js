const { getData, saveData, showToast, showConfirm } = require('../../../utils/util')
const { encrypt, decrypt } = require('../../../utils/crypto')

Page({
  data: {
    userId: '',
    cookie: '',
    name: 'AI Code With',
    isEdit: false,
    syncing: false,
    // 账号密码登录
    email: '',
    password: '',
    hasCredentials: false,
    loginTesting: false,
    loginStatus: '', // '' | 'success' | 'fail'
    loginStatusText: '',
    // 配置模式
    configMode: 'auto' // 'auto' 账号密码模式 | 'manual' 手动Cookie模式
  },

  onLoad() {
    const config = getData('apiConfig', null)
    const credentials = getData('apiCredentials', null)

    if (config) {
      this.setData({
        userId: config.userId || '',
        cookie: config.cookie || '',
        name: config.name || 'AI Code With',
        isEdit: true
      })
    }

    if (credentials && credentials.email) {
      this.setData({
        email: credentials.email,
        password: credentials.password ? '••••••••' : '',
        hasCredentials: true,
        configMode: 'auto'
      })
    } else if (config && config.cookie) {
      this.setData({ configMode: 'manual' })
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ configMode: mode })
  },

  // ========== 账号密码模式：保存凭证 ==========
  async onSaveCredentials() {
    const { email, password, name } = this.data

    if (!email.trim()) {
      showToast('请输入邮箱')
      return
    }
    if (!password.trim() || password === '••••••••') {
      // 如果密码没改（显示为掩码），保留旧密码
      const old = getData('apiCredentials', null)
      if (!old || !old.password) {
        showToast('请输入密码')
        return
      }
    }

    // 加密密码后存储
    const credentials = { email: email.trim() }
    if (password !== '••••••••' && password.trim()) {
      credentials.password = encrypt(password.trim())
    } else {
      const old = getData('apiCredentials', null)
      credentials.password = old ? old.password : ''
    }

    saveData('apiCredentials', credentials)
    this.setData({ hasCredentials: true })

    // 同时更新 name
    const config = getData('apiConfig', {})
    config.name = name.trim() || 'AI Code With'
    saveData('apiConfig', config)

    showToast('凭证已保存')
  },

  // ========== 一键登录测试 ==========
  async onTestLogin() {
    const { email, password } = this.data

    if (!email.trim()) {
      showToast('请输入邮箱')
      return
    }

    // 获取真实密码
    let realPassword = ''
    if (password === '••••••••') {
      const old = getData('apiCredentials', null)
      if (old && old.password) {
        realPassword = decrypt(old.password)
      }
    } else {
      realPassword = password.trim()
    }

    if (!realPassword) {
      showToast('请输入密码')
      return
    }

    console.log('[登录测试] email:', email.trim(), ', 密码长度:', realPassword.length)
    this.setData({ loginTesting: true, loginStatus: '', loginStatusText: '登录中...' })

    try {
      const res = await new Promise((resolve) => {
        wx.cloud.callFunction({
          name: 'apiProxy',
          data: {
            action: 'passwordLogin',
            email: email.trim(),
            password: realPassword,
            cookie: ''
          },
          success: (r) => {
            console.log('[登录测试] 云函数返回:', JSON.stringify(r.result))
            resolve(r.result || {})
          },
          fail: (err) => {
            console.error('[登录测试] 云函数调用失败:', err)
            resolve({ success: false, error: '云函数调用失败: ' + (err.errMsg || JSON.stringify(err)) })
          }
        })
      })

      if (res.success && res.cookie) {
        // 登录成功，保存所有数据
        const credentials = {
          email: email.trim(),
          password: encrypt(realPassword)
        }
        saveData('apiCredentials', credentials)

        const config = {
          userId: res.userId || getData('apiConfig', {}).userId || '',
          cookie: res.cookie,
          name: this.data.name.trim() || 'AI Code With',
          updatedAt: new Date().toISOString()
        }
        saveData('apiConfig', config)

        this.setData({
          loginTesting: false,
          loginStatus: 'success',
          loginStatusText: '登录成功！Cookie 已自动获取',
          hasCredentials: true,
          isEdit: true,
          userId: config.userId,
          cookie: config.cookie
        })

        // 同步到云端
        this.uploadConfigToCloud(config)
      } else {
        this.setData({
          loginTesting: false,
          loginStatus: 'fail',
          loginStatusText: res.error || '登录失败，请检查邮箱和密码'
        })
      }
    } catch (err) {
      this.setData({
        loginTesting: false,
        loginStatus: 'fail',
        loginStatusText: '网络异常：' + (err.message || err.errMsg || '未知错误')
      })
    }
  },

  // ========== 手动Cookie模式：保存 ==========
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

  // ========== 云端同步 ==========
  async uploadConfigToCloud(config) {
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
    } catch (err) {
      console.error('云端同步失败:', err)
    }
  },

  async onUploadConfig() {
    const config = getData('apiConfig', null)
    if (!config || !config.cookie) {
      showToast('请先保存配置')
      return
    }

    this.setData({ syncing: true })
    wx.showLoading({ title: '上传中...' })

    try {
      await this.uploadConfigToCloud(config)
      wx.hideLoading()
      showToast('已上传到云端')
    } catch (err) {
      wx.hideLoading()
      showToast('上传失败')
    }
    this.setData({ syncing: false })
  },

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
    const confirm = await showConfirm('删除配置', '确定要删除 API 配置和登录凭证吗？')
    if (confirm) {
      wx.removeStorageSync('apiConfig')
      wx.removeStorageSync('apiCredentials')
      showToast('已删除')
      setTimeout(() => wx.navigateBack(), 500)
    }
  }
})
