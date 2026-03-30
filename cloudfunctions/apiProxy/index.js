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
    // 匹配 sb-xxx-auth-token.0=base64-xxx 和 sb-xxx-auth-token.1=xxx
    const parts = []
    const regex = /sb-[^-]+-auth-token\.(\d+)=([^;]+)/g
    let match
    while ((match = regex.exec(cookie)) !== null) {
      parts.push({ index: parseInt(match[1]), value: match[2] })
    }
    parts.sort((a, b) => a.index - b.index)

    if (parts.length === 0) return null

    // 拼接所有 part
    let tokenStr = parts.map(p => p.value).join('')
    // 去掉 base64- 前缀
    if (tokenStr.startsWith('base64-')) {
      tokenStr = tokenStr.substring(7)
    }

    // Base64 解码
    const decoded = Buffer.from(tokenStr, 'base64').toString('utf-8')
    return JSON.parse(decoded)
  } catch (e) {
    console.error('解析 auth token 失败:', e.message)
    return null
  }
}

// 用 refresh_token 刷新 access_token
async function refreshToken(refreshToken) {
  const postData = JSON.stringify({
    refresh_token: refreshToken,
    gotrue_meta_security: {}
  })

  const res = await httpsRequest({
    hostname: 'paokvdewkbzjeyawllii.supabase.co',
    path: '/auth/v1/token?grant_type=refresh_token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhb2t2ZGV3a2J6amV5YXdsbGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjcwNjk2NTUsImV4cCI6MjA0MjY0NTY1NX0.kHOBgNQ88bsRkWJJejjMT0SQZkNc-jlFuSfqP6VJkkQ',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, postData)

  if (res.statusCode === 200 && res.data.access_token) {
    return res.data
  }
  return null
}

// 用新 token 重建 Cookie
function rebuildCookie(oldCookie, newAuthData) {
  // 构建新的 auth token base64
  const tokenJson = JSON.stringify(newAuthData)
  const tokenBase64 = Buffer.from(tokenJson).toString('base64')

  // 分片（Cookie 值有长度限制，原始也是分 .0 和 .1 的）
  const chunkSize = 3600
  const chunks = []
  for (let i = 0; i < tokenBase64.length; i += chunkSize) {
    chunks.push(tokenBase64.substring(i, i + chunkSize))
  }

  // 替换 Cookie 中的 auth token 部分
  let newCookie = oldCookie
  // 先删除旧的 auth token
  newCookie = newCookie.replace(/sb-[^-]+-auth-token\.\d+=[^;]+(;\s*)?/g, '')
  // 清理多余分号
  newCookie = newCookie.replace(/;\s*;/g, ';').replace(/;\s*$/, '')

  // 追加新 token
  const tokenName = 'sb-paokvdewkbzjeyawllii-auth-token'
  chunks.forEach((chunk, i) => {
    const prefix = i === 0 ? 'base64-' : ''
    newCookie += `; ${tokenName}.${i}=${prefix}${chunk}`
  })

  return newCookie
}

exports.main = async (event) => {
  const { path, cookie, action } = event

  // 自动刷新 token
  if (action === 'refreshToken') {
    try {
      const authData = extractAuthFromCookie(cookie)
      if (!authData || !authData.refresh_token) {
        return { success: false, error: '无法提取 refresh_token' }
      }

      const newAuth = await refreshToken(authData.refresh_token)
      if (!newAuth) {
        return { success: false, error: '刷新 token 失败，请重新登录网站获取 Cookie' }
      }

      const newCookie = rebuildCookie(cookie, newAuth)
      return { success: true, cookie: newCookie, expiresAt: newAuth.expires_at }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // 正常代理请求
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
        const newAuth = await refreshToken(authData.refresh_token)
        if (newAuth) {
          const newCookie = rebuildCookie(cookie, newAuth)
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
            newCookie: newCookie // 返回新 Cookie 让前端更新存储
          }
        }
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
