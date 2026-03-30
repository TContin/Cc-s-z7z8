/**
 * 品牌图标配置 - 使用网络Logo图片 + 品牌色兜底
 */

// Logo 图片 URL 映射
const logoUrls = {
  '微信':     'https://img.icons8.com/color/96/wechat.png',
  'QQ':       'https://img.icons8.com/color/96/qq.png',
  '微博':     'https://img.icons8.com/color/96/weibo.png',
  '小红书':   'https://img.icons8.com/color/96/xiaohongshu.png',
  '抖音':     'https://img.icons8.com/color/96/tiktok.png',
  'GitHub':   'https://img.icons8.com/ios-glyphs/96/github.png',
  '淘宝':     'https://img.icons8.com/color/96/taobao.png',
  '京东':     'https://img.icons8.com/color/96/jd-com.png',
  '拼多多':   'https://img.icons8.com/color/96/pinduoduo.png',
  '支付宝':   'https://img.icons8.com/color/96/alipay.png',
  '网易云音乐': 'https://img.icons8.com/color/96/netease-cloud-music.png',
  'QQ音乐':   'https://img.icons8.com/color/96/qq-music.png',
  'Spotify':  'https://img.icons8.com/color/96/spotify.png',
  'Apple':    'https://img.icons8.com/ios-filled/96/mac-os.png',
  '腾讯视频': 'https://img.icons8.com/color/96/tencent-video.png',
  '爱奇艺':   'https://img.icons8.com/color/96/iqiyi.png',
  'B站':      'https://img.icons8.com/color/96/bilibili.png',
  'Netflix':  'https://img.icons8.com/color/96/netflix.png',
  'Steam':    'https://img.icons8.com/color/96/steam.png',
  'Epic':     'https://img.icons8.com/color/96/epic-games.png',
  '美团':     'https://img.icons8.com/color/96/meituan.png',
  '饿了么':   'https://img.icons8.com/color/96/ele-me.png',
  '百度':     'https://img.icons8.com/color/96/baidu.png',
  '钉钉':     'https://img.icons8.com/color/96/dingtalk.png',
  '飞书':     'https://img.icons8.com/color/96/lark.png',
  'Gmail':    'https://img.icons8.com/color/96/gmail-new.png',
  'Outlook':  'https://img.icons8.com/color/96/microsoft-outlook-2019--v2.png',
  '知乎':     'https://img.icons8.com/color/96/zhihu.png',
  'Twitter/X': 'https://img.icons8.com/ios-filled/96/twitterx--v1.png',
  'Instagram': 'https://img.icons8.com/color/96/instagram-new--v1.png',
  'Telegram': 'https://img.icons8.com/color/96/telegram-app--v1.png',
  'ChatGPT Plus': 'https://img.icons8.com/color/96/chatgpt.png',
  'GitHub Copilot': 'https://img.icons8.com/ios-glyphs/96/github.png',
  'WPS会员':  'https://img.icons8.com/color/96/wps-office.png',
  'Adobe':    'https://img.icons8.com/color/96/adobe.png',
  'Xbox Game Pass': 'https://img.icons8.com/color/96/xbox.png',
  'PS Plus':  'https://img.icons8.com/color/96/play-station.png',
  'iCloud':   'https://img.icons8.com/color/96/icloud.png',
  'Apple Music': 'https://img.icons8.com/color/96/apple-music.png',
  'B站大会员': 'https://img.icons8.com/color/96/bilibili.png',
  '优酷':     'https://img.icons8.com/color/96/youku.png',
}

// 品牌色兜底（Logo加载失败时显示）
const brandColors = {
  '微信': '#07C160', 'QQ': '#12B7F5', '微博': '#E6162D', '小红书': '#FE2C55',
  '抖音': '#000000', 'GitHub': '#24292F', '淘宝': '#FF5000', '京东': '#E4002B',
  '拼多多': '#E02E24', '支付宝': '#1677FF', '网易云音乐': '#C20C0C', 'QQ音乐': '#31C27C',
  'Spotify': '#1DB954', 'Apple': '#000000', '腾讯视频': '#FF7701', '爱奇艺': '#00BE06',
  'B站': '#FB7299', 'Netflix': '#E50914', 'Steam': '#1B2838', 'Epic': '#000000',
  '美团': '#FFD100', '饿了么': '#0097FF', '百度': '#2932E1', '钉钉': '#3296FA',
  '飞书': '#3370FF', 'Gmail': '#EA4335', 'Outlook': '#0078D4', '知乎': '#0066FF',
  'Twitter/X': '#000000', 'Instagram': '#E4405F', 'Telegram': '#0088CC',
  'ChatGPT Plus': '#10A37F', 'GitHub Copilot': '#000000', 'WPS会员': '#D4451A',
  'Adobe': '#FF0000', 'Xbox Game Pass': '#107C10', 'PS Plus': '#003087', 'iCloud': '#3693F5',
  'Apple Music': '#FC3C44', 'B站大会员': '#FB7299', '优酷': '#1EBEA5',
}

// 首字母兜底
const brandLetters = {
  '微信': 'W', 'QQ': 'Q', '微博': '微', '小红书': '红', '抖音': 'D',
  'GitHub': 'G', '淘宝': '淘', '京东': 'J', '拼多多': '拼', '支付宝': 'A',
  '网易云音乐': '♪', 'QQ音乐': '♫', 'Spotify': 'S', 'Apple': 'A',
  '腾讯视频': 'V', '爱奇艺': 'iQ', 'B站': 'B', 'Netflix': 'N',
  'Steam': 'S', 'Epic': 'E', '美团': '美', '饿了么': '饿', '百度': 'B',
  '钉钉': 'D', '飞书': 'F', 'Gmail': 'G', 'Outlook': 'O', '知乎': '知',
  'Twitter/X': '𝕏', 'Instagram': 'I', 'Telegram': 'T',
  'ChatGPT Plus': 'G', 'GitHub Copilot': 'C', 'WPS会员': 'W',
  'Adobe': 'A', 'Xbox Game Pass': 'X', 'PS Plus': 'P', 'iCloud': '☁',
  'Apple Music': '♪', 'B站大会员': 'B', '优酷': '优',
}

// 通用图标列表（自定义选择用）
const iconList = [
  { letter: '🔑', bg: '#007AFF', name: '钥匙' },
  { letter: '🔒', bg: '#FF9500', name: '锁' },
  { letter: '☁', bg: '#3693F5', name: '云' },
  { letter: '♪', bg: '#C20C0C', name: '音乐' },
  { letter: '▶', bg: '#FF2D55', name: '播放' },
  { letter: '✦', bg: '#5856D6', name: '星' },
  { letter: '⚡', bg: '#FF9500', name: '闪电' },
  { letter: '$', bg: '#34C759', name: '美元' },
  { letter: '¥', bg: '#34C759', name: '人民币' },
  { letter: '✉', bg: '#007AFF', name: '邮件' },
  { letter: '⚙', bg: '#8E8E93', name: '设置' },
  { letter: '♥', bg: '#FF2D55', name: '心' },
  { letter: '★', bg: '#FF9500', name: '收藏' },
  { letter: '●', bg: '#007AFF', name: '圆点' },
]

/**
 * 根据平台名获取图标信息
 */
function getIconByName(name) {
  if (!name) return { logo: '', letter: '?', bg: '#8E8E93' }

  // 精确匹配
  if (logoUrls[name]) {
    return { logo: logoUrls[name], letter: brandLetters[name] || name[0], bg: brandColors[name] || '#8E8E93' }
  }

  // 模糊匹配
  const lower = name.toLowerCase()
  for (const [key, url] of Object.entries(logoUrls)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return { logo: url, letter: brandLetters[key] || key[0], bg: brandColors[key] || '#8E8E93' }
    }
  }

  // 默认：首字母 + 随机色
  const colors = ['#007AFF', '#34C759', '#FF9500', '#FF2D55', '#5856D6', '#00C7BE']
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return { logo: '', letter: name[0].toUpperCase(), bg: colors[hash % colors.length] }
}

module.exports = { logoUrls, brandColors, brandLetters, iconList, getIconByName }
