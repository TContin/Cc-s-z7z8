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
    const apiBase = `${baseUrl}/api/v1`

    // ========== 获取仪表盘概览（会话 + 消息量 + 模型分布） ==========
    if (action === 'getDashboard') {
      // 并行请求: 会话列表 + 系统状态 + 健康检查
      const [convsRes, statusRes, healthRes] = await Promise.all([
        httpRequest(`${apiBase}/conversations`, { headers }).catch(e => ({ statusCode: 0, data: null, error: e.message })),
        httpRequest(`${apiBase}/status`, { headers }).catch(e => ({ statusCode: 0, data: null, error: e.message })),
        httpRequest(`${apiBase}/health`, { headers }).catch(e => ({ statusCode: 0, data: null, error: e.message }))
      ])

      // ---- 解析会话数据 ----
      let totalSessions = 0
      let activeSessions = 0
      let totalMessages = 0
      let totalTokens = 0
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let totalCost = 0
      const modelMap = {} // { modelName: { messages, tokens } }

      if (convsRes.statusCode === 200 && convsRes.data) {
        const convs = Array.isArray(convsRes.data) ? convsRes.data
          : (convsRes.data.conversations || convsRes.data.data || [])
        totalSessions = convs.length

        for (const c of convs) {
          // 活跃会话
          if (c.active || c.status === 'active') activeSessions++

          // 消息计数
          const msgCount = c.messages || c.message_count || c.messageCount || c.turns || 0
          totalMessages += msgCount

          // Token 统计
          const inTk = c.inputTokens || c.input_tokens || c.promptTokens || c.prompt_tokens || 0
          const outTk = c.outputTokens || c.output_tokens || c.completionTokens || c.completion_tokens || 0
          const tk = c.totalTokens || c.total_tokens || c.tokens || (inTk + outTk)
          totalInputTokens += inTk
          totalOutputTokens += outTk
          totalTokens += tk

          // 费用
          const cost = c.cost || c.totalCost || c.total_cost || 0
          totalCost += cost

          // 模型分布统计
          const model = c.model || c.modelId || c.model_id || 'unknown'
          if (!modelMap[model]) modelMap[model] = { messages: 0, tokens: 0 }
          modelMap[model].messages += msgCount
          modelMap[model].tokens += tk
        }
      }

      // ---- 从 /status 补充系统级统计（如有） ----
      if (statusRes.statusCode === 200 && statusRes.data) {
        const st = statusRes.data
        // 某些版本的 status 会包含汇总数据，优先使用
        if (st.totalMessages && st.totalMessages > totalMessages) totalMessages = st.totalMessages
        if (st.totalTokens && st.totalTokens > totalTokens) totalTokens = st.totalTokens
        if (st.totalSessions && st.totalSessions > totalSessions) totalSessions = st.totalSessions
        if (st.activeSessions && st.activeSessions > activeSessions) activeSessions = st.activeSessions
        if (st.totalCost && st.totalCost > totalCost) totalCost = st.totalCost

        // 如果 status 带了模型分布
        const stModels = st.models || st.modelDistribution || st.model_distribution || null
        if (stModels && typeof stModels === 'object' && !Array.isArray(stModels)) {
          Object.entries(stModels).forEach(([name, data]) => {
            if (!modelMap[name]) modelMap[name] = { messages: 0, tokens: 0 }
            if (typeof data === 'object') {
              modelMap[name].messages = Math.max(modelMap[name].messages, data.messages || data.count || 0)
              modelMap[name].tokens = Math.max(modelMap[name].tokens, data.tokens || 0)
            }
          })
        }
      }

      // 转换 modelMap 为数组并排序
      const modelDistribution = Object.entries(modelMap)
        .filter(([name]) => name !== 'unknown')
        .map(([name, data]) => ({ name, messages: data.messages, tokens: data.tokens }))
        .sort((a, b) => b.messages - a.messages)

      return {
        success: true,
        data: {
          sessions: { total: totalSessions, active: activeSessions },
          messages: {
            total: totalMessages,
            tokens: totalTokens,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens
          },
          models: modelDistribution,
          cost: totalCost,
          healthy: healthRes.statusCode === 200
        }
      }
    }

    // ========== 测试连接 ==========
    if (action === 'testConnection') {
      const res = await httpRequest(`${apiBase}/health`, { headers })
      return {
        success: res.statusCode === 200,
        statusCode: res.statusCode,
        data: res.data
      }
    }

    // ========== 获取系统状态 ==========
    if (action === 'getStatus') {
      const res = await httpRequest(`${apiBase}/status`, { headers })
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
