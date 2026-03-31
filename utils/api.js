/**
 * 公共 API 工具模块
 * 统一封装云函数调用、Token 管理、缓存策略等
 */

// ========== 缓存配置 ==========
const CACHE_TTL = {
  dashboard: 120 * 1000,    // Dashboard 概览：2 分钟
  monitor: 60 * 1000,       // 监控数据：1 分钟
  models: 300 * 1000,       // 模型列表：5 分钟
  sessions: 30 * 1000,      // 会话列表：30 秒
  stats: 120 * 1000,        // 统计数据：2 分钟
  cloud: 120 * 1000         // 云服务监控：2 分钟
}

// 内存缓存存储
const _memCache = {}

/**
 * 通用云函数调用封装（消除重复代码）
 * @param {string} name - 云函数名
 * @param {object} data - 传入数据
 * @returns {Promise<object>}
 */
function callCloudFunction(name, data) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name,
      data,
      success: (r) => resolve(r.result || {}),
      fail: (err) => resolve({ success: false, error: err.errMsg || '云函数调用失败' })
    })
  })
}

/**
 * OpenClaw 云函数调用封装
 * @param {string} action - 动作名
 * @param {object} config - 包含 serverUrl, apiToken
 * @param {object} extra - 额外参数
 * @returns {Promise<object>}
 */
function callOpenClaw(action, config, extra) {
  return callCloudFunction('openClawProxy', {
    action,
    serverUrl: config.serverUrl,
    apiToken: config.apiToken || '',
    ...(extra || {})
  })
}

/**
 * API Proxy 云函数调用封装
 * @param {string} path - API 路径
 * @param {string} cookie - 认证 cookie
 * @returns {Promise<object>}
 */
function callApiProxy(path, cookie) {
  return callCloudFunction('apiProxy', { path, cookie })
}

/**
 * 格式化 Token 数量（统一复用）
 */
function formatTokens(num) {
  if (!num) return '0'
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
  return num + ''
}

// ========== Token 本地检查（不走云函数！） ==========

/**
 * 从 Cookie 中解析 Supabase auth token 的过期时间
 * 完全在本地执行，不需要调用云函数
 * @param {string} cookie
 * @returns {number|null} expires_at (unix timestamp)
 */
function getTokenExpiresAt(cookie) {
  try {
    const parts = []
    const regex = /sb-[^-]+-auth-token\.(\d+)=([^;]+)/g
    let match
    while ((match = regex.exec(cookie)) !== null) {
      parts.push({ index: parseInt(match[1]), value: match[2] })
    }
    parts.sort((a, b) => a.index - b.index)
    if (parts.length === 0) return null

    let tokenStr = parts.map(p => p.value).join('')
    if (tokenStr.startsWith('base64-')) {
      tokenStr = tokenStr.substring(7)
    }

    const buffer = wx.base64ToArrayBuffer(tokenStr)
    const arr = new Uint8Array(buffer)
    let decoded = ''
    for (let i = 0; i < arr.length; i++) {
      decoded += String.fromCharCode(arr[i])
    }
    const authData = JSON.parse(decoded)
    return authData.expires_at || null
  } catch (e) {
    return null
  }
}

/**
 * 本地检查 Token 是否有效（不调云函数）
 * @param {string} cookie
 * @returns {{ valid: boolean, remaining: number, expired: boolean }}
 */
function checkTokenLocally(cookie) {
  if (!cookie) return { valid: false, remaining: 0, expired: true }

  const expiresAt = getTokenExpiresAt(cookie)
  if (!expiresAt) return { valid: false, remaining: 0, expired: true }

  const now = Math.floor(Date.now() / 1000)
  const remaining = expiresAt - now

  return {
    valid: remaining > 300,  // 大于 5 分钟认为有效
    remaining,
    expired: remaining <= 0,
    nearExpiry: remaining > 0 && remaining <= 300
  }
}

// ========== Storage 持久缓存 ==========

/**
 * 带 Storage 持久缓存的数据获取
 * 策略：先返回 Storage 缓存数据（立即显示），再异步刷新
 * @param {string} key - 缓存 key
 * @returns {object|null}
 */
function getCachedData(key) {
  try {
    const cached = wx.getStorageSync('_cache_' + key)
    if (cached && cached.data && cached.timestamp) {
      return cached
    }
  } catch (e) {}
  return null
}

/**
 * 保存数据到 Storage 缓存
 * @param {string} key
 * @param {*} data
 */
function setCachedData(key, data) {
  try {
    wx.setStorageSync('_cache_' + key, {
      data,
      timestamp: Date.now()
    })
  } catch (e) {
    console.error('[Cache] 保存失败:', e)
  }
}

/**
 * 检查内存缓存是否命中
 * @param {string} key
 * @param {number} ttl - 毫秒
 * @returns {boolean}
 */
function isMemCacheValid(key, ttl) {
  const ts = _memCache[key]
  if (!ts) return false
  return (Date.now() - ts) < ttl
}

/**
 * 更新内存缓存时间戳
 * @param {string} key
 */
function updateMemCache(key) {
  _memCache[key] = Date.now()
}

/**
 * 清除指定内存缓存
 * @param {string} key
 */
function clearMemCache(key) {
  _memCache[key] = 0
}

// ========== getOpenId 全局缓存 ==========
let _openIdCache = null
let _openIdPromise = null

/**
 * 获取 OpenId（全局缓存，只调一次云函数）
 * @returns {Promise<string>}
 */
function getOpenId() {
  if (_openIdCache) return Promise.resolve(_openIdCache)
  if (_openIdPromise) return _openIdPromise

  _openIdPromise = callCloudFunction('getOpenId', {}).then(result => {
    _openIdCache = result.openid || ''
    _openIdPromise = null
    return _openIdCache
  }).catch(() => {
    _openIdPromise = null
    return ''
  })

  return _openIdPromise
}

// ========== 防重入锁 ==========
const _loadingLocks = {}

/**
 * 防止 onShow 重复触发请求
 * @param {string} key - 锁 key
 * @returns {boolean} true=已锁定（应跳过），false=未锁定（可继续）
 */
function isLoading(key) {
  return !!_loadingLocks[key]
}

function setLoading(key, val) {
  _loadingLocks[key] = val
}

module.exports = {
  CACHE_TTL,
  callCloudFunction,
  callOpenClaw,
  callApiProxy,
  formatTokens,
  getTokenExpiresAt,
  checkTokenLocally,
  getCachedData,
  setCachedData,
  isMemCacheValid,
  updateMemCache,
  clearMemCache,
  getOpenId,
  isLoading,
  setLoading
}
