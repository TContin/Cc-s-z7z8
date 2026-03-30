Page({
  data: {
    version: '1.0.0',
    features: [
      { icon: '🔐', name: '密码本', desc: '加密存储，分类管理你的账号密码' },
      { icon: '📋', name: '订阅管理', desc: '追踪会员到期时间，预估月花费' },
      { icon: '🔒', name: '安全保护', desc: '支持密码锁定，保护你的隐私' },
      { icon: '🧩', name: '可扩展设计', desc: '模块化架构，后续功能持续添加' }
    ]
  },

  onShareAppMessage() {
    return {
      title: '私人工具箱 - 密码管理、订阅追踪',
      path: '/pages/home/home'
    }
  }
})
