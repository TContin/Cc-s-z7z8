const { generateId, showToast, getData, saveData } = require('../../../utils/util')
const { encrypt } = require('../../../utils/crypto')

Page({
  data: {
    isEdit: false,
    id: '',
    platform: '',
    account: '',
    password: '',
    website: '',
    remark: '',
    category: '其他',
    icon: '🔑',
    color: '#E3F0FF',
    categories: ['社交', '购物', '金融', '工作', '游戏', '其他'],
    categoryIndex: 5,
    // 常用APP快捷模板
    templates: [
      { name: '微信', icon: '💬', color: '#E8F5E9', category: '社交' },
      { name: 'QQ', icon: '🐧', color: '#E3F2FD', category: '社交' },
      { name: '微博', icon: '📣', color: '#FFF3E0', category: '社交' },
      { name: '小红书', icon: '📕', color: '#FFEBEE', category: '社交' },
      { name: '抖音', icon: '🎵', color: '#1C1C1E', category: '社交' },
      { name: 'GitHub', icon: '🐱', color: '#F5F5F5', category: '工作' },
      { name: '淘宝', icon: '🛒', color: '#FFF3E0', category: '购物' },
      { name: '京东', icon: '🐶', color: '#FFEBEE', category: '购物' },
      { name: '拼多多', icon: '🔥', color: '#FFEBEE', category: '购物' },
      { name: '支付宝', icon: '💰', color: '#E3F2FD', category: '金融' },
      { name: '网易云音乐', icon: '🎶', color: '#FFEBEE', category: '其他' },
      { name: 'QQ音乐', icon: '🎧', color: '#E8F5E9', category: '其他' },
      { name: 'Spotify', icon: '💚', color: '#E8F5E9', category: '其他' },
      { name: 'Apple', icon: '🍎', color: '#F5F5F5', category: '其他' },
      { name: '腾讯视频', icon: '📺', color: '#E3F2FD', category: '其他' },
      { name: '爱奇艺', icon: '🎬', color: '#E8F5E9', category: '其他' },
      { name: 'B站', icon: '📱', color: '#FCE4EC', category: '其他' },
      { name: 'Netflix', icon: '🎞️', color: '#FFEBEE', category: '其他' },
      { name: 'Steam', icon: '🎮', color: '#E8EAF6', category: '游戏' },
      { name: 'Epic', icon: '🕹️', color: '#F5F5F5', category: '游戏' },
      { name: '美团', icon: '🍽️', color: '#FFF8E1', category: '购物' },
      { name: '饿了么', icon: '🥡', color: '#E3F2FD', category: '购物' },
      { name: '百度', icon: '🔍', color: '#E3F2FD', category: '其他' },
      { name: '钉钉', icon: '📌', color: '#E3F2FD', category: '工作' },
      { name: '飞书', icon: '🕊️', color: '#E3F2FD', category: '工作' },
      { name: 'Gmail', icon: '📧', color: '#FFEBEE', category: '工作' },
      { name: 'Outlook', icon: '📨', color: '#E3F2FD', category: '工作' },
      { name: '知乎', icon: '💡', color: '#E3F2FD', category: '社交' },
      { name: 'Twitter/X', icon: '🐦', color: '#E3F2FD', category: '社交' },
      { name: 'Instagram', icon: '📸', color: '#FCE4EC', category: '社交' },
      { name: 'Telegram', icon: '✈️', color: '#E3F2FD', category: '社交' },
    ],
    showTemplates: false,
    icons: ['🔑', '💬', '🐧', '📕', '🎵', '🐱', '🛒', '🐶', '💰', '🎶', '🎧', '📺', '🎬', '📱', '🎮', '🔍', '📌', '📧', '💡', '📸', '🍎', '🎞️', '🕹️', '🍽️', '📣', '🔥', '💚', '✈️', '🐦', '🕊️', '📨', '🥡', '💳', '🏦', '💼', '☁️', '🖥️', '🔐'],
    showPassword: false,
    showIconPicker: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
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

    const { decrypt: dec } = require('../../../utils/crypto')
    const categoryIndex = this.data.categories.indexOf(item.category)

    this.setData({
      platform: item.platform || '',
      account: item.account || '',
      password: dec(item.encryptedPassword) || '',
      website: item.website || '',
      remark: item.remark || '',
      category: item.category || '其他',
      categoryIndex: categoryIndex >= 0 ? categoryIndex : 5,
      icon: item.icon || '🔑',
      color: item.color || '#EDE9FF'
    })

    wx.setNavigationBarTitle({ title: '编辑密码' })
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value })
  },

  onCategoryChange(e) {
    const index = e.detail.value
    this.setData({
      categoryIndex: index,
      category: this.data.categories[index]
    })
  },

  toggleShowPassword() {
    this.setData({ showPassword: !this.data.showPassword })
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
    const categoryIndex = this.data.categories.indexOf(tpl.category)
    this.setData({
      platform: tpl.name,
      icon: tpl.icon,
      color: tpl.color,
      category: tpl.category,
      categoryIndex: categoryIndex >= 0 ? categoryIndex : 5,
      showTemplates: false
    })
  },

  generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*'
    let pwd = ''
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    this.setData({ password: pwd, showPassword: true })
    showToast('已生成随机密码')
  },

  onSave() {
    const { platform, account, password, website, remark, category, icon, color, isEdit, id } = this.data

    if (!platform.trim()) {
      showToast('请输入平台名称')
      return
    }
    if (!account.trim()) {
      showToast('请输入账号')
      return
    }
    if (!password.trim()) {
      showToast('请输入密码')
      return
    }

    const item = {
      id: isEdit ? id : generateId(),
      platform: platform.trim(),
      account: account.trim(),
      encryptedPassword: encrypt(password),
      website: website.trim(),
      remark: remark.trim(),
      category,
      icon,
      color,
      createdAt: isEdit ? undefined : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    let list = getData('passwords', [])
    if (isEdit) {
      const index = list.findIndex(i => i.id === id)
      if (index >= 0) {
        item.createdAt = list[index].createdAt
        list[index] = item
      }
    } else {
      list.unshift(item)
    }

    if (saveData('passwords', list)) {
      showToast(isEdit ? '已更新' : '已保存')
      setTimeout(() => wx.navigateBack(), 500)
    }
  }
})
