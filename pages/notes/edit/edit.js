const { generateId, showToast, getData, saveData, showConfirm, formatDate } = require('../../../utils/util')

Page({
  data: {
    isEdit: false,
    id: '',
    title: '',
    content: '',
    folder: '',
    pinned: false,
    createdAt: '',
    updatedAt: '',
    wordCount: 0,
    showToolbar: true,
    folders: [],
    showFolderPicker: false,
    timeDisplay: ''
  },

  onLoad(options) {
    // 收集已有文件夹
    const notes = getData('notes', [])
    const folderSet = new Set()
    notes.forEach(n => { if (n.folder) folderSet.add(n.folder) })
    this.setData({ folders: Array.from(folderSet) })

    if (options.id) {
      this.setData({ isEdit: true, id: options.id })
      this.loadItem(options.id)
    } else {
      wx.setNavigationBarTitle({ title: '新建备忘录' })
      // 自动聚焦标题
    }
  },

  loadItem(id) {
    const list = getData('notes', [])
    const item = list.find(i => i.id === id)
    if (!item) {
      showToast('备忘录不存在')
      wx.navigateBack()
      return
    }

    this.setData({
      title: item.title || '',
      content: item.content || '',
      folder: item.folder || '',
      pinned: item.pinned || false,
      createdAt: item.createdAt || '',
      updatedAt: item.updatedAt || '',
      wordCount: (item.content || '').length,
      timeDisplay: item.updatedAt ? formatDate(new Date(item.updatedAt), 'YYYY年MM月DD日 HH:mm') : ''
    })

    wx.setNavigationBarTitle({ title: item.title || '备忘录' })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  onContentInput(e) {
    const content = e.detail.value
    this.setData({
      content,
      wordCount: content.length
    })
  },

  // 自动保存（失焦或返回时）
  onUnload() {
    this.autoSave()
  },

  onHide() {
    this.autoSave()
  },

  autoSave() {
    const { title, content, folder, pinned, isEdit, id } = this.data

    // 标题和内容都为空，不保存
    if (!title.trim() && !content.trim()) {
      // 如果是编辑模式且内容被清空了，删除
      if (isEdit) {
        let list = getData('notes', [])
        list = list.filter(i => i.id !== id)
        saveData('notes', list)
      }
      return
    }

    // 如果标题为空，取内容第一行作为标题
    const finalTitle = title.trim() || content.split('\n')[0].substring(0, 30).trim() || '新建备忘录'

    const item = {
      id: isEdit ? id : generateId(),
      title: finalTitle,
      content: content,
      folder: folder.trim(),
      pinned,
      createdAt: isEdit ? this.data.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    let list = getData('notes', [])
    if (isEdit) {
      const index = list.findIndex(i => i.id === id)
      if (index >= 0) {
        item.createdAt = list[index].createdAt
        list[index] = item
      } else {
        list.unshift(item)
      }
    } else {
      list.unshift(item)
      // 标记为编辑模式，避免重复创建
      this.data.isEdit = true
      this.data.id = item.id
    }

    saveData('notes', list)
  },

  // 工具栏操作
  onInsertChecklist() {
    const { content } = this.data
    const insert = content ? '\n☐ ' : '☐ '
    this.setData({ content: content + insert })
  },

  onTogglePin() {
    this.setData({ pinned: !this.data.pinned })
    showToast(this.data.pinned ? '已置顶' : '已取消置顶')
  },

  toggleFolderPicker() {
    this.setData({ showFolderPicker: !this.data.showFolderPicker })
  },

  onFolderSelect(e) {
    const folder = e.currentTarget.dataset.name
    this.setData({ folder, showFolderPicker: false })
  },

  onFolderInput(e) {
    this.setData({ folder: e.detail.value })
  },

  async onDelete() {
    const confirm = await showConfirm('删除备忘录', '确定要删除这条备忘录吗？')
    if (confirm) {
      if (this.data.isEdit) {
        let list = getData('notes', [])
        list = list.filter(i => i.id !== this.data.id)
        saveData('notes', list)
      }
      // 阻止 onUnload 再次保存
      this.data.title = ''
      this.data.content = ''
      this.data.isEdit = false
      showToast('已删除')
      setTimeout(() => wx.navigateBack(), 300)
    }
  },

  onShareTap() {
    const { title, content } = this.data
    const text = (title ? title + '\n\n' : '') + content
    wx.setClipboardData({
      data: text,
      success: () => showToast('已复制到剪贴板')
    })
  }
})
