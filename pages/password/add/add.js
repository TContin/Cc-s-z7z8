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
    color: '#EDE9FF',
    categories: ['社交', '购物', '金融', '工作', '游戏', '其他'],
    categoryIndex: 5,
    icons: ['🔑', '💳', '🏦', '🛒', '💬', '🎮', '💼', '📧', '🎵', '📱', '🖥️', '☁️'],
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
