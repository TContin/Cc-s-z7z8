const { getData, showConfirm, showToast } = require('../../utils/util')
const { decrypt } = require('../../utils/crypto')

Page({
  data: {
    list: [],
    filteredList: [],
    searchKey: '',
    categories: ['全部', '社交', '购物', '金融', '工作', '游戏', '其他'],
    currentCategory: '全部',
    isEmpty: true,
    isLocked: true
  },

  onShow() {
    this.checkLock()
  },

  checkLock() {
    const settings = getData('settings', {})
    const app = getApp()
    if (settings.passwordProtect && !app.globalData.isUnlocked) {
      this.setData({ isLocked: true })
      this.showPasswordDialog()
    } else {
      this.setData({ isLocked: false })
      this.loadData()
    }
  },

  showPasswordDialog() {
    wx.showModal({
      title: '安全验证',
      editable: true,
      placeholderText: '请输入访问密码',
      confirmColor: '#007AFF',
      success: (res) => {
        if (res.confirm) {
          const settings = getData('settings', {})
          if (res.content === settings.password) {
            getApp().globalData.isUnlocked = true
            this.setData({ isLocked: false })
            this.loadData()
          } else {
            showToast('密码错误')
            setTimeout(() => this.showPasswordDialog(), 500)
          }
        } else {
          wx.navigateBack()
        }
      }
    })
  },

  loadData() {
    const list = getData('passwords', [])
    // 解密显示名称（密码字段保持加密）
    const displayList = list.map(item => ({
      ...item,
      displayName: item.platform || '未命名',
      displayAccount: item.account || ''
    }))
    
    this.setData({
      list: displayList,
      filteredList: displayList,
      isEmpty: displayList.length === 0
    })
    this.filterList()
  },

  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value })
    this.filterList()
  },

  onCategoryTap(e) {
    const category = e.currentTarget.dataset.name
    this.setData({ currentCategory: category })
    this.filterList()
  },

  filterList() {
    const { list, searchKey, currentCategory } = this.data
    let filtered = list

    if (currentCategory !== '全部') {
      filtered = filtered.filter(item => item.category === currentCategory)
    }

    if (searchKey.trim()) {
      const key = searchKey.toLowerCase()
      filtered = filtered.filter(item =>
        (item.platform && item.platform.toLowerCase().includes(key)) ||
        (item.account && item.account.toLowerCase().includes(key)) ||
        (item.remark && item.remark.toLowerCase().includes(key))
      )
    }

    this.setData({ filteredList: filtered, isEmpty: filtered.length === 0 })
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/password/add/add' })
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/password/detail/detail?id=${id}` })
  },

  async onItemLongpress(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(i => i.id === id)
    if (!item) return

    const confirm = await showConfirm('删除确认', `确定要删除「${item.platform}」的记录吗？`)
    if (confirm) {
      let list = getData('passwords', [])
      list = list.filter(i => i.id !== id)
      wx.setStorageSync('passwords', list)
      showToast('已删除')
      this.loadData()
    }
  }
})
