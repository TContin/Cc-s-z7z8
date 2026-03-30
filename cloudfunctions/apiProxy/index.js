const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const https = require('https')

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(body) } catch (e) { parsed = body }
        resolve({ statusCode: res.statusCode, data: parsed, headers: res.headers })
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
    if (postData) req.write(postData)
    req.end()
  })
}

// 从 Cookie 中提取 Supabase auth token（base64 编码的 JSON）
function extractAuthFromCookie(cookie) {
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

    const decoded = Buffer.from(tokenStr, 'base64').toString('utf-8')
    return JSON.parse(decoded)
  } catch (e) {
    console.error('解析 auth token 失败:', e.message)
    return null
  }
}

// 检测 access_token (JWT) 是否过期
function isAccessTokenExpired(authData) {
  if (!authData || !authData.expires_at) return true
  const now = Math.floor(Date.now() / 1000)
  return now >= authData.expires_at
}

// 用 refresh_token 刷新 access_token，返回详细结果
async function refreshToken(rt) {
  const postData = JSON.stringify({
    refresh_token: rt,
    gotrue_meta_security: {}
  })

  try {
    const res = await httpsRequest({
      hostname: 'paokvdewkbzjeyawllii.supabase.co',
      path: '/auth/v1/token?grant_type=refresh_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhb2t2ZGV3a2J6amV5YXdsbGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5MDU2NzUsImV4cCI6MjA2NTQ4MTY3NX0.oa5BK39jM6YLMGRccvfSFw1pE01c2q8mZWlwKmiGkEs',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, postData)

    if (res.statusCode === 200 && res.data.access_token) {
      return { success: true, data: res.data }
    }

    // refresh_token 过期或无效，Supabase 返回 400/401
    if (res.statusCode === 400 || res.statusCode === 401) {
      const errMsg = (res.data && res.data.error_description) || (res.data && res.data.msg) || 'refresh_token 已过期'
      return { success: false, expired: true, error: errMsg }
    }

    return { success: false, expired: false, error: `刷新失败(${res.statusCode})` }
  } catch (err) {
    return { success: false, expired: false, error: err.message }
  }
}

// 用新 token 重建 Cookie
function rebuildCookie(oldCookie, newAuthData) {
  const tokenJson = JSON.stringify(newAuthData)
  const tokenBase64 = Buffer.from(tokenJson).toString('base64')

  const chunkSize = 3600
  const chunks = []
  for (let i = 0; i < tokenBase64.length; i += chunkSize) {
    chunks.push(tokenBase64.substring(i, i + chunkSize))
  }

  let newCookie = oldCookie
  newCookie = newCookie.replace(/sb-[^-]+-auth-token\.\d+=[^;]+(;\s*)?/g, '')
  newCookie = newCookie.replace(/;\s*;/g, ';').replace(/;\s*$/, '')

  const tokenName = 'sb-paokvdewkbzjeyawllii-auth-token'
  chunks.forEach((chunk, i) => {
    const prefix = i === 0 ? 'base64-' : ''
    newCookie += `; ${tokenName}.${i}=${prefix}${chunk}`
  })

  return newCookie
}

// 用邮箱密码登录 Supabase，获取全新 session
async function passwordLogin(email, password) {
  const postData = JSON.stringify({
    email,
    password,
    gotrue_meta_security: {}
  })

  try {
    console.log('[passwordLogin] 开始登录, email:', email)
    const res = await httpsRequest({
      hostname: 'paokvdewkbzjeyawllii.supabase.co',
      path: '/auth/v1/token?grant_type=password',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhb2t2ZGV3a2J6amV5YXdsbGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5MDU2NzUsImV4cCI6MjA2NTQ4MTY3NX0.oa5BK39jM6YLMGRccvfSFw1pE01c2q8mZWlwKmiGkEs',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, postData)

    console.log('[passwordLogin] 响应状态码:', res.statusCode)
    console.log('[passwordLogin] 响应内容:', JSON.stringify(res.data).substring(0, 500))

    if (res.statusCode === 200 && res.data.access_token) {
      return { success: true, data: res.data }
    }

    // 构造详细错误信息
    const errParts = []
    if (res.data && res.data.error) errParts.push(res.data.error)
    if (res.data && res.data.error_description) errParts.push(res.data.error_description)
    if (res.data && res.data.msg) errParts.push(res.data.msg)
    if (res.data && res.data.message) errParts.push(res.data.message)
    const errMsg = errParts.length > 0 ? errParts.join(' - ') : '登录失败'

    console.log('[passwordLogin] 登录失败:', errMsg)
    return {
      success: false,
      error: errMsg + ` (HTTP ${res.statusCode})`,
      detail: res.data // 把完整响应返回给前端
    }
  } catch (err) {
    console.error('[passwordLogin] 异常:', err.message)
    return { success: false, error: '网络异常: ' + err.message }
  }
}

// 从全新 session 构建完整 Cookie（不依赖旧 Cookie）
function buildCookieFromSession(authData) {
  const tokenJson = JSON.stringify(authData)
  const tokenBase64 = Buffer.from(tokenJson).toString('base64')

  const chunkSize = 3600
  const chunks = []
  for (let i = 0; i < tokenBase64.length; i += chunkSize) {
    chunks.push(tokenBase64.substring(i, i + chunkSize))
  }

  const tokenName = 'sb-paokvdewkbzjeyawllii-auth-token'
  const parts = chunks.map((chunk, i) => {
    const prefix = i === 0 ? 'base64-' : ''
    return `${tokenName}.${i}=${prefix}${chunk}`
  })

  return parts.join('; ')
}

exports.main = async (event) => {
  const { path, cookie, action, email, password } = event

  // ========== 邮箱密码登录获取全新 Cookie ==========
  if (action === 'passwordLogin') {
    if (!email || !password) {
      return { success: false, error: '请提供邮箱和密码' }
    }

    const result = await passwordLogin(email, password)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    // 用登录返回的 session 构建新 Cookie
    const newCookie = cookie
      ? rebuildCookie(cookie, result.data)
      : buildCookieFromSession(result.data)

    // 提取 userId
    const userId = (result.data.user && result.data.user.id) || ''

    return {
      success: true,
      cookie: newCookie,
      userId: userId,
      expiresAt: result.data.expires_at,
      expiresIn: result.data.expires_in || 3600
    }
  }

  // ========== 主动刷新 Token ==========
  if (action === 'refreshToken') {
    try {
      const authData = extractAuthFromCookie(cookie)
      if (!authData || !authData.refresh_token) {
        return { success: false, error: '无法提取 refresh_token', needReLogin: true }
      }

      const result = await refreshToken(authData.refresh_token)
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          needReLogin: result.expired === true
        }
      }

      const newCookie = rebuildCookie(cookie, result.data)
      return {
        success: true,
        cookie: newCookie,
        expiresAt: result.data.expires_at,
        expiresIn: result.data.expires_in || 3600
      }
    } catch (err) {
      return { success: false, error: err.message, needReLogin: false }
    }
  }

  // ========== 检查 Token 状态（不发请求） ==========
  if (action === 'checkToken') {
    try {
      const authData = extractAuthFromCookie(cookie)
      if (!authData) {
        return { success: false, error: 'Cookie 格式无效', needReLogin: true }
      }
      const now = Math.floor(Date.now() / 1000)
      const expiresAt = authData.expires_at || 0
      const remaining = expiresAt - now
      return {
        success: true,
        expiresAt,
        remaining,
        expired: remaining <= 0,
        hasRefreshToken: !!authData.refresh_token
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // ========== 正常代理请求 ==========
  const url = new URL('https://aicodewith.com' + path)

  try {
    const res = await httpsRequest({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Cookie': cookie,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://aicodewith.com/zh/dashboard/usage-records'
      }
    })

    // 如果返回 401/403，尝试自动刷新
    if (res.statusCode === 401 || res.statusCode === 403) {
      const authData = extractAuthFromCookie(cookie)
      if (authData && authData.refresh_token) {
        const refreshResult = await refreshToken(authData.refresh_token)
        if (refreshResult.success) {
          const newCookie = rebuildCookie(cookie, refreshResult.data)
          // 用新 Cookie 重试
          const retryRes = await httpsRequest({
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
              'Cookie': newCookie,
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://aicodewith.com/zh/dashboard/usage-records'
            }
          })
          return {
            success: true,
            statusCode: retryRes.statusCode,
            data: retryRes.data,
            newCookie: newCookie
          }
        }
        // refresh_token 也失效了
        return {
          success: false,
          statusCode: res.statusCode,
          data: res.data,
          needReLogin: refreshResult.expired === true,
          error: refreshResult.error || 'Token 刷新失败'
        }
      }
      // 没有 refresh_token
      return {
        success: false,
        statusCode: res.statusCode,
        data: res.data,
        needReLogin: true,
        error: 'Cookie 已失效且无法自动刷新'
      }
    }

    return {
      success: true,
      statusCode: res.statusCode,
      data: res.data
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
