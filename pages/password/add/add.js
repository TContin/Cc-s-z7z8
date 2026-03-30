const { generateId, showToast, getData, saveData } = require('../../../utils/util')
const { encrypt } = require('../../../utils/crypto')
const { getIconByName, iconList } = require('../../../utils/icons')

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
    iconLetter: '?',
    iconBg: '#007AFF',
    iconTextColor: '#fff',
    categories: ['社交', '购物', '金融', '工作', '游戏', '其他'],
    categoryIndex: 5,
    templates: [],
    showTemplates: false,
    customIcons: [],
    showPassword: false,
    showIconPicker: false
  },

  onLoad(options) {
    // 生成模板（带品牌图标）
    const names = ['微信','QQ','微博','小红书','抖音','GitHub','淘宝','京东','拼多多','支付宝','网易云音乐','QQ音乐','Spotify','Apple','腾讯视频','爱奇艺','B站','Netflix','Steam','Epic','美团','饿了么','百度','钉钉','飞书','Gmail','Outlook','知乎','Twitter/X','Instagram','Telegram']
    const catMap = {'微信':'社交','QQ':'社交','微博':'社交','小红书':'社交','抖音':'社交','GitHub':'工作','淘宝':'购物','京东':'购物','拼多多':'购物','支付宝':'金融','网易云音乐':'其他','QQ音乐':'其他','Spotify':'其他','Apple':'其他','腾讯视频':'其他','爱奇艺':'其他','B站':'其他','Netflix':'其他','Steam':'游戏','Epic':'游戏','美团':'购物','饿了么':'购物','百度':'其他','钉钉':'工作','飞书':'工作','Gmail':'工作','Outlook':'工作','知乎':'社交','Twitter/X':'社交','Instagram':'社交','Telegram':'社交'}

    const templates = names.map(name => {
      const icon = getIconByName(name)
      return { name, letter: icon.letter, bg: icon.bg, textColor: icon.textColor || '#fff', category: catMap[name] || '其他' }
    })

    this.setData({ templates, customIcons: iconList })

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
    const icon = item.iconLetter ? { letter: item.iconLetter, bg: item.iconBg } : getIconByName(item.platform)

    this.setData({
      platform: item.platform || '',
      account: item.account || '',
      password: dec(item.encryptedPassword) || '',
      website: item.website || '',
      remark: item.remark || '',
      category: item.category || '其他',
      categoryIndex: categoryIndex >= 0 ? categoryIndex : 5,
      iconLetter: icon.letter,
      iconBg: icon.bg,
      iconTextColor: icon.textColor || '#fff'
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
    const { letter, bg } = e.currentTarget.dataset
    this.setData({ iconLetter: letter, iconBg: bg, iconTextColor: '#fff', showIconPicker: false })
  },

  toggleTemplates() {
    this.setData({ showTemplates: !this.data.showTemplates })
  },

  onTemplateTap(e) {
    const tpl = e.currentTarget.dataset.tpl
    const categoryIndex = this.data.categories.indexOf(tpl.category)
    this.setData({
      platform: tpl.name,
      iconLetter: tpl.letter,
      iconBg: tpl.bg,
      iconTextColor: tpl.textColor || '#fff',
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
    const { platform, account, password, website, remark, category, iconLetter, iconBg, iconTextColor, isEdit, id } = this.data

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
      iconLetter,
      iconBg,
      iconTextColor: iconTextColor || '#fff',
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
