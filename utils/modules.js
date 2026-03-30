const modules = [
  {
    id: 'password',
    name: '密码本',
    icon: '🔐',
    desc: '安全管理你的账号密码',
    color: '#007AFF',
    bgColor: '#E3F0FF',
    page: '/pages/password/password'
  },
  {
    id: 'subscription',
    name: '订阅管理',
    icon: '📋',
    desc: '追踪会员到期时间',
    color: '#FF3B30',
    bgColor: '#FFE5E3',
    page: '/pages/subscription/subscription'
  }
  // 后续扩展：在此添加新模块
  // {
  //   id: 'notes',
  //   name: '备忘录',
  //   icon: '📝',
  //   desc: '随时记录灵感想法',
  //   color: '#34C759',
  //   bgColor: '#E5F8EB',
  //   page: '/pages/notes/notes'
  // },
]

module.exports = { modules }
