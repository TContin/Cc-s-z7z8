const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const http = require('http')
const https = require('https')

function httpRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const isHttps = url.protocol === 'https:'
    const lib = isHttps ? https : http

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MiniProgram-OpenClaw-Monitor/1.0',
        ...(options.headers || {})
      },
      timeout: 15000
    }

    const req = lib.request(reqOptions, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(body) } catch (e) { parsed = body }
        resolve({ statusCode: res.statusCode, data: parsed })
      })
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
    req.end()
  })
}

exports.main = async (event) => {
  const { action, serverUrl, apiToken } = event

  if (!serverUrl) {
    return { success: false, error: '未配置 OpenClaw 服务器地址' }
  }

  // 去掉末尾斜杠
  const baseUrl = serverUrl.replace(/\/+$/, '')

  const headers = {}
  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`
  }

  try {
    // ========== 获取仪表盘概览（会话 + 消息量 + 模型分布） ==========
    if (action === 'getDashboard') {
      // 并行请求多个 API
      const [sessionsRes, usageRes, costsRes] = await Promise.all([
        httpRequest(`${baseUrl}/api/sessions`, { headers }).catch(e => ({ statusCode: 0, data: null, error: e.message })),
        httpRequest(`${baseUrl}/api/usage`, { headers }).catch(e => ({ statusCode: 0, data: null, error: e.message })),
        httpRequest(`${baseUrl}/api/costs`, { headers }).catch(e => ({ statusCode: 0, data: null, error: e.message }))
      ])

      // 解析会话数据
      let totalSessions = 0
      let activeSessions = 0
      let recentSessions = []
      if (sessionsRes.statusCode === 200 && sessionsRes.data) {
        const sessions = Array.isArray(sessionsRes.data) ? sessionsRes.data : (sessionsRes.data.sessions || sessionsRes.data.data || [])
        totalSessions = sessions.length
        activeSessions = sessions.filter(s => s.active || s.status === 'active').length
        // 取最近 5 个会话
        recentSessions = sessions.slice(0, 5).map(s => ({
          id: s.id || s.session_id,
          name: s.name || s.title || ('会话 ' + (s.id || '').substring(0, 6)),
          model: s.model || s.modelId || '--',
          messages: s.messages || s.message_count || s.messageCount || 0,
          updatedAt: s.updated_at || s.updatedAt || s.lastActivity || ''
        }))
      }

      // 解析用量数据
      let totalMessages = 0
      let totalTokens = 0
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let modelDistribution = []
      if (usageRes.statusCode === 200 && usageRes.data) {
        const usage = usageRes.data
        totalMessages = usage.totalMessages || usage.total_messages || usage.messageCount || 0
        totalTokens = usage.totalTokens || usage.total_tokens || 0
        totalInputTokens = usage.inputTokens || usage.input_tokens || usage.promptTokens || 0
        totalOutputTokens = usage.outputTokens || usage.output_tokens || usage.completionTokens || 0

        // 模型分布
        const models = usage.modelDistribution || usage.model_distribution || usage.models || usage.byModel || []
        if (Array.isArray(models)) {
          modelDistribution = models.map(m => ({
            name: m.model || m.modelId || m.name || '--',
            messages: m.messages || m.message_count || m.count || 0,
            tokens: m.tokens || m.total_tokens || 0,
            cost: m.cost || m.totalCost || 0
          }))
        } else if (typeof models === 'object') {
          // 如果是 { "claude-3": { messages: 10, tokens: 5000 }, ... } 格式
          modelDistribution = Object.entries(models).map(([name, data]) => ({
            name,
            messages: typeof data === 'object' ? (data.messages || data.count || 0) : data,
            tokens: typeof data === 'object' ? (data.tokens || 0) : 0,
            cost: typeof data === 'object' ? (data.cost || 0) : 0
          }))
        }
      }

      // 解析费用数据
      let totalCost = 0
      if (costsRes.statusCode === 200 && costsRes.data) {
        const costs = costsRes.data
        totalCost = costs.totalCost || costs.total_cost || costs.total || 0
      }

      return {
        success: true,
        data: {
          sessions: {
            total: totalSessions,
            active: activeSessions,
            recent: recentSessions
          },
          messages: {
            total: totalMessages,
            tokens: totalTokens,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens
          },
          models: modelDistribution,
          cost: totalCost
        }
      }
    }

    // ========== 获取系统状态 ==========
    if (action === 'getSystem') {
      const res = await httpRequest(`${baseUrl}/api/system`, { headers })
      if (res.statusCode === 200) {
        return { success: true, data: res.data }
      }
      return { success: false, error: `系统状态获取失败 (HTTP ${res.statusCode})` }
    }

    // ========== 通用代理（直接转发路径） ==========
    if (action === 'proxy' && event.path) {
      const res = await httpRequest(`${baseUrl}${event.path}`, { headers })
      return { success: true, statusCode: res.statusCode, data: res.data }
    }

    return { success: false, error: '未知 action: ' + action }
  } catch (err) {
    return { success: false, error: err.message || '请求异常' }
  }
}
