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
  },
  {
    id: 'apimonitor',
    name: 'API 监控',
    icon: '📡',
    desc: '实时查看 API 余额和用量',
    color: '#FF9500',
    bgColor: '#FFF3E0',
    page: '/pages/apimonitor/apimonitor'
  },
  {
    id: 'notes',
    name: '备忘录',
    icon: '📝',
    desc: '随时记录灵感和想法',
    color: '#FF9500',
    bgColor: '#FFF8E1',
    page: '/pages/notes/notes'
  },
  {
    id: 'cloudmonitor',
    name: '云服务监控',
    icon: '☁️',
    desc: '腾讯云服务器·域名·证书·余额',
    color: '#5856D6',
    bgColor: '#EFEDFF',
    page: '/pages/cloudmonitor/cloudmonitor'
  }
  // 后续扩展：在此添加新模块
]

module.exports = { modules }
