const { getData, saveData, showConfirm, showToast, formatDate } = require('../../utils/util')

Page({
  data: {
    list: [],
    filteredList: [],
    searchKey: '',
    isEmpty: true,
    folders: ['全部'],
    currentFolder: '全部'
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const list = getData('notes', [])
    // 按置顶 + 更新时间排序
    const sorted = list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return new Date(b.updatedAt) - new Date(a.updatedAt)
    })

    // 提取文件夹
    const folderSet = new Set(['全部'])
    sorted.forEach(n => { if (n.folder) folderSet.add(n.folder) })

    const displayList = sorted.map(item => ({
      ...item,
      preview: this.getPreview(item.content),
      timeDisplay: this.getTimeDisplay(item.updatedAt),
      titleDisplay: item.title || '新建备忘录'
    }))

    this.setData({
      list: displayList,
      folders: Array.from(folderSet)
    })
    this.filterList()
  },

  getPreview(content) {
    if (!content) return '无其他文本'
    // 去掉标题行（第一行），取剩余前50字
    const lines = content.split('\n').filter(l => l.trim())
    const body = lines.slice(1).join(' ').trim()
    if (!body) return '无其他文本'
    return body.length > 50 ? body.substring(0, 50) + '...' : body
  },

  getTimeDisplay(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diff = today - target
    const days = diff / (1000 * 60 * 60 * 24)

    if (days === 0) return formatDate(d, 'HH:mm')
    if (days === 1) return '昨天'
    if (days < 7) return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
    return formatDate(d, 'YYYY/MM/DD')
  },

  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value })
    this.filterList()
  },

  onFolderTap(e) {
    this.setData({ currentFolder: e.currentTarget.dataset.name })
    this.filterList()
  },

  filterList() {
    const { list, searchKey, currentFolder } = this.data
    let filtered = list

    if (currentFolder !== '全部') {
      filtered = filtered.filter(i => i.folder === currentFolder)
    }

    if (searchKey.trim()) {
      const key = searchKey.toLowerCase()
      filtered = filtered.filter(i =>
        (i.title && i.title.toLowerCase().includes(key)) ||
        (i.content && i.content.toLowerCase().includes(key))
      )
    }

    this.setData({ filteredList: filtered, isEmpty: filtered.length === 0 })
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/notes/edit/edit' })
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/notes/edit/edit?id=${id}` })
  },

  async onItemLongpress(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(i => i.id === id)
    if (!item) return

    const actions = [item.pinned ? '取消置顶' : '置顶', '删除']
    wx.showActionSheet({
      itemList: actions,
      success: async (res) => {
        if (res.tapIndex === 0) {
          this.togglePin(id)
        } else if (res.tapIndex === 1) {
          const confirm = await showConfirm('删除确认', `确定要删除「${item.titleDisplay}」吗？`)
          if (confirm) {
            let list = getData('notes', [])
            list = list.filter(i => i.id !== id)
            saveData('notes', list)
            showToast('已删除')
            this.loadData()
          }
        }
      }
    })
  },

  togglePin(id) {
    let list = getData('notes', [])
    const item = list.find(i => i.id === id)
    if (item) {
      item.pinned = !item.pinned
      saveData('notes', list)
      showToast(item.pinned ? '已置顶' : '已取消置顶')
      this.loadData()
    }
  }
})
