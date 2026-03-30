/**
 * 品牌图标配置 - 使用品牌色+首字母/符号代替Emoji
 * iOS Settings 风格：圆角方块 + 白色图标/文字
 */

// 密码本 - 常用平台
const passwordIcons = {
  '微信':     { letter: 'W',  bg: '#07C160' },
  'QQ':       { letter: 'Q',  bg: '#12B7F5' },
  '微博':     { letter: '微', bg: '#E6162D' },
  '小红书':   { letter: '红', bg: '#FE2C55' },
  '抖音':     { letter: 'D',  bg: '#000000' },
  'GitHub':   { letter: 'G',  bg: '#24292F' },
  '淘宝':     { letter: '淘', bg: '#FF5000' },
  '京东':     { letter: 'J',  bg: '#E4002B' },
  '拼多多':   { letter: '拼', bg: '#E02E24' },
  '支付宝':   { letter: 'A',  bg: '#1677FF' },
  '网易云音乐': { letter: '♪', bg: '#C20C0C' },
  'QQ音乐':   { letter: '♫', bg: '#31C27C' },
  'Spotify':  { letter: 'S',  bg: '#1DB954' },
  'Apple':    { letter: '',  bg: '#000000' },
  '腾讯视频': { letter: 'V',  bg: '#FF7701' },
  '爱奇艺':   { letter: 'iQ', bg: '#00BE06' },
  'B站':      { letter: 'B',  bg: '#FB7299' },
  'Netflix':  { letter: 'N',  bg: '#E50914' },
  'Steam':    { letter: 'S',  bg: '#1B2838' },
  'Epic':     { letter: 'E',  bg: '#000000' },
  '美团':     { letter: '美', bg: '#FFD100', textColor: '#000' },
  '饿了么':   { letter: '饿', bg: '#0097FF' },
  '百度':     { letter: 'B',  bg: '#2932E1' },
  '钉钉':     { letter: 'D',  bg: '#3296FA' },
  '飞书':     { letter: 'F',  bg: '#3370FF' },
  'Gmail':    { letter: 'G',  bg: '#EA4335' },
  'Outlook':  { letter: 'O',  bg: '#0078D4' },
  '知乎':     { letter: '知', bg: '#0066FF' },
  'Twitter/X': { letter: '𝕏', bg: '#000000' },
  'Instagram': { letter: 'I', bg: '#E4405F' },
  'Telegram': { letter: 'T',  bg: '#0088CC' },
  'ChatGPT Plus': { letter: 'G', bg: '#10A37F' },
  'GitHub Copilot': { letter: 'C', bg: '#000000' },
  'WPS会员':  { letter: 'W',  bg: '#D4451A' },
  'Adobe':    { letter: 'A',  bg: '#FF0000' },
  'Xbox Game Pass': { letter: 'X', bg: '#107C10' },
  'PS Plus':  { letter: 'P',  bg: '#003087' },
  'iCloud':   { letter: '☁',  bg: '#3693F5' },
}

// 订阅管理 - 常用服务
const subscriptionIcons = passwordIcons

// 分类默认图标
const categoryIcons = {
  '社交': { letter: '💬', bg: '#007AFF' },
  '购物': { letter: '🛍', bg: '#FF9500' },
  '金融': { letter: '¥',  bg: '#34C759' },
  '工作': { letter: '✦',  bg: '#5856D6' },
  '游戏': { letter: '▶',  bg: '#FF2D55' },
  '其他': { letter: '•',  bg: '#8E8E93' },
}

// 通用图标列表（用于自定义选择）
const iconList = [
  { letter: '🔑', bg: '#007AFF', name: '钥匙' },
  { letter: '🔒', bg: '#FF9500', name: '锁' },
  { letter: '☁',  bg: '#3693F5', name: '云' },
  { letter: '♪',  bg: '#C20C0C', name: '音乐' },
  { letter: '▶',  bg: '#FF2D55', name: '播放' },
  { letter: '✦',  bg: '#5856D6', name: '星' },
  { letter: '⚡',  bg: '#FF9500', name: '闪电' },
  { letter: '$',  bg: '#34C759', name: '美元' },
  { letter: '¥',  bg: '#34C759', name: '人民币' },
  { letter: '✉',  bg: '#007AFF', name: '邮件' },
  { letter: '⚙',  bg: '#8E8E93', name: '设置' },
  { letter: '♥',  bg: '#FF2D55', name: '心' },
  { letter: '★',  bg: '#FF9500', name: '收藏' },
  { letter: '◆',  bg: '#000000', name: '菱形' },
  { letter: '●',  bg: '#007AFF', name: '圆点' },
  { letter: '■',  bg: '#5856D6', name: '方块' },
]

/**
 * 根据平台名获取图标配置
 * @param {string} name 平台名称
 * @returns {{ letter: string, bg: string, textColor?: string }}
 */
function getIconByName(name) {
  if (!name) return { letter: '?', bg: '#8E8E93' }
  
  // 精确匹配
  if (passwordIcons[name]) return passwordIcons[name]
  
  // 模糊匹配
  const lowerName = name.toLowerCase()
  for (const [key, icon] of Object.entries(passwordIcons)) {
    if (lowerName.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerName)) {
      return icon
    }
  }
  
  // 默认：取首字母 + 随机品牌色
  const colors = ['#007AFF', '#34C759', '#FF9500', '#FF2D55', '#5856D6', '#00C7BE', '#FF6482']
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return {
    letter: name.charAt(0).toUpperCase(),
    bg: colors[hash % colors.length]
  }
}

module.exports = {
  passwordIcons,
  subscriptionIcons,
  categoryIcons,
  iconList,
  getIconByName
}
