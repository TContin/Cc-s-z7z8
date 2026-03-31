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
        'Content-Type': 'application/json',
        'User-Agent': 'MiniProgram-OpenClaw-Monitor/1.0',
        ...(options.headers || {})
      },
      timeout: 15000
    }

    const req = lib.request(reqOptions, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        // 检查 content-type 是否为 JSON
        const ct = res.headers['content-type'] || ''
        const isJson = ct.includes('application/json') || ct.includes('text/json')
        let parsed
        try { parsed = JSON.parse(body) } catch (e) {
          // 如果不是 JSON，返回前 200 字符帮助调试
          parsed = { _raw: body.substring(0, 200), _isHtml: body.trim().startsWith('<') }
        }
        resolve({
          statusCode: res.statusCode,
          contentType: ct,
          data: parsed
        })
      })
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
    }
    req.end()
  })
}

// 判断返回的是否为有效 JSON 数据（非 HTML）
function isValidJsonData(res) {
  if (!res || res.statusCode !== 200) return false
  if (res.data && res.data._isHtml) return false
  if (typeof res.data === 'string' && res.data.trim().startsWith('<')) return false
  return true
}

// 解析模型列表（兼容多种数据结构）
function parseModelsList(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.data)) return data.data
  if (data && Array.isArray(data.models)) return data.models
  return []
}

exports.main = async (event) => {
  const { action, serverUrl, apiToken } = event

  if (!serverUrl) {
    return { success: false, error: '未配置 OpenClaw 服务器地址' }
  }

  // 去掉末尾斜杠
  const baseUrl = serverUrl.replace(/\/+$/, '')

  // 配置 API 地址：通过 Nginx 反代 /oc-api/ 访问（同一域名）
  const configApiBase = `${baseUrl}/oc-api`

  // OpenClaw Gateway 认证
  const headers = {}
  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`
  }

  // 配置 API 认证（和 gateway token 相同）
  const configHeaders = {}
  if (apiToken) {
    configHeaders['Authorization'] = `Bearer ${apiToken}`
  }

  // 辅助函数：优先从配置 API 获取数据
  async function fetchFromConfigApi(apiPath) {
    if (!configApiBase) return null
    try {
      const url = `${configApiBase}${apiPath}`
      const res = await httpRequest(url, { headers: configHeaders })
      if (res.statusCode === 200 && res.data && !res.data._isHtml) {
        // 配置 API 返回 { success: true, data: [...] }
        if (res.data.success && res.data.data !== undefined) {
          return res.data.data
        }
        // 也兼容直接返回数据的情况
        return res.data
      }
    } catch (e) {
      // 配置 API 不可用，静默失败
    }
    return null
  }

  try {
    // =====================================================
    // OpenClaw Gateway 可用的 REST 端点（基于官方文档）:
    //
    // GET  /health              → {"ok":true,"status":"live"}
    // GET  /v1/models           → OpenAI 兼容的模型列表
    // GET  /v1/models/{id}      → 单个模型详情
    // POST /v1/chat/completions → 聊天补全
    // POST /v1/embeddings       → 嵌入向量
    // POST /v1/responses        → Agent 响应
    //
    // 注意: 会话统计等数据需通过 WebSocket 获取，
    //       /v1/sessions 和 /status 不是 REST 端点
    // =====================================================

    // ========== 获取仪表盘概览 ==========
    if (action === 'getDashboard') {
      // 并行请求：健康检查 + 配置API模型 + 配置API统计
      const [healthRes, configModels, configStats] = await Promise.all([
        httpRequest(`${baseUrl}/health`, { headers }).catch(e => ({ statusCode: 0, data: null })),
        fetchFromConfigApi('/api/models'),
        fetchFromConfigApi('/api/stats')
      ])

      const healthy = healthRes.statusCode === 200
      const healthData = healthy ? healthRes.data : null

      // 模型列表
      let modelDistribution = []
      if (configModels && Array.isArray(configModels)) {
        modelDistribution = configModels.map(m => ({
          name: m.name || m.id || '--',
          messages: 0,
          tokens: 0,
          owned_by: m.providerId || ''
        }))
      }

      // 统计
      const stats = configStats || { totalTokens: 0, totalMessages: 0, totalSessions: 0 }

      const debug = {
        healthy,
        modelsSource: configModels ? 'config-api' : 'none',
        modelsCount: modelDistribution.length,
        statsSource: configStats ? 'config-api' : 'none'
      }

      return {
        success: true,
        data: {
          sessions: { total: stats.totalSessions || 0, active: 0 },
          messages: {
            total: stats.totalMessages || 0,
            tokens: stats.totalTokens || 0,
            inputTokens: stats.inputTokens || 0,
            outputTokens: stats.outputTokens || 0
          },
          models: modelDistribution,
          cost: 0,
          healthy: healthy,
          gatewayStatus: healthData ? healthData.status : 'unknown'
        },
        debug
      }
    }

    // ========== 测试连接 ==========
    if (action === 'testConnection') {
      const res = await httpRequest(`${baseUrl}/health`, { headers })
      return {
        success: res.statusCode === 200,
        statusCode: res.statusCode,
        contentType: res.contentType,
        data: res.data
      }
    }

    // ========== 获取模型列表 ==========
    if (action === 'getModels') {
      // 优先从配置 API 读取（直接解析 openclaw.json）
      const configModels = await fetchFromConfigApi('/api/models')
      if (configModels) {
        return { success: true, data: configModels, source: 'config-api' }
      }

      // fallback: 尝试 Gateway REST
      const res = await httpRequest(`${baseUrl}/v1/models`, { headers })
      if (isValidJsonData(res)) {
        return { success: true, data: res.data, source: 'gateway-rest' }
      }

      return {
        success: false,
        error: '模型列表获取失败。请确保服务器上已启动 openclaw-api 服务 (端口9100)',
        hint: '在服务器上运行: sudo node /path/to/openclaw-api.js'
      }
    }

    // ========== 获取 Agent 列表 ==========
    if (action === 'getAgents') {
      // 优先从配置 API 读取
      const configAgents = await fetchFromConfigApi('/api/agents')
      if (configAgents) {
        return { success: true, data: configAgents, source: 'config-api' }
      }

      // fallback: 用 Gateway 健康状态构造默认 agent
      const healthRes = await httpRequest(`${baseUrl}/health`, { headers }).catch(e => ({ statusCode: 0 }))
      const healthy = healthRes.statusCode === 200

      return {
        success: true,
        data: [{
          id: 'main',
          name: 'Main Bot',
          emoji: '🦞',
          model: '--',
          state: healthy ? 'online' : 'offline',
          sessionCount: 0,
          platforms: []
        }],
        source: 'fallback'
      }
    }

    // ========== 获取会话列表 ==========
    if (action === 'getSessions') {
      const agentId = event.agentId || 'main'
      const configSessions = await fetchFromConfigApi(`/api/sessions?agentId=${agentId}`)
      if (configSessions) {
        return { success: true, data: configSessions, source: 'config-api' }
      }

      return {
        success: true,
        data: [],
        hint: '请确保服务器上已启动 openclaw-api 服务 (端口9100)'
      }
    }

    // ========== 会话内切换模型 ==========
    if (action === 'switchSessionModel') {
      const { sessionKey, modelId, agentId } = event
      if (!sessionKey || !modelId) {
        return { success: false, error: '缺少 sessionKey 或 modelId' }
      }
      const result = await fetchFromConfigApi(
        `/api/switch-session-model?agentId=${encodeURIComponent(agentId || 'main')}&sessionKey=${encodeURIComponent(sessionKey)}&modelId=${encodeURIComponent(modelId)}`
      )
      if (result !== null) return result
      return { success: true, hint: '模型偏好已记录（需配置API支持写入）' }
    }

    // ========== 删除会话 ==========
    if (action === 'deleteSession') {
      const { sessionKey, agentId } = event
      if (!sessionKey) {
        return { success: false, error: '缺少 sessionKey' }
      }
      const result = await fetchFromConfigApi(
        `/api/delete-session?agentId=${encodeURIComponent(agentId || 'main')}&sessionKey=${encodeURIComponent(sessionKey)}`
      )
      if (result !== null) return result
      return { success: false, error: '需要配置API支持删除操作' }
    }

    // ========== 获取统计概览 ==========
    if (action === 'getStats') {
      const configStats = await fetchFromConfigApi('/api/stats')
      if (configStats) {
        return { success: true, data: configStats, source: 'config-api' }
      }

      return {
        success: true,
        data: { totalTokens: 0, totalMessages: 0, totalSessions: 0, avgResponseMs: 0 }
      }
    }

    // ========== 模型探测/测试 ==========
    if (action === 'probeModel') {
      const modelId = event.modelId
      if (!modelId) {
        return { success: false, error: '未指定模型 ID' }
      }

      // 优先通过配置 API 测试（直接向上游 provider 发请求）
      const probeResult = await fetchFromConfigApi(`/api/probe-model?modelId=${encodeURIComponent(modelId)}`)
      if (probeResult !== null) {
        return probeResult
      }

      // fallback: 通过 Gateway REST API
      try {
        const res = await httpRequest(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: {
            model: modelId,
            messages: [{ role: 'user', content: 'Reply with OK.' }],
            max_tokens: 8,
            stream: false
          }
        })

        if (res.statusCode === 200 && !res.data._isHtml) {
          return { success: true, data: res.data }
        }

        const errMsg = res.data && typeof res.data === 'object'
          ? (res.data.error && res.data.error.message) || JSON.stringify(res.data).substring(0, 100)
          : `HTTP ${res.statusCode}`

        return { success: false, error: errMsg, statusCode: res.statusCode }
      } catch (err) {
        return { success: false, error: err.message || '探测异常' }
      }
    }

    // ========== 切换模型 ==========
    if (action === 'switchModel') {
      const modelId = event.modelId
      if (!modelId) {
        return { success: false, error: '未指定模型 ID' }
      }

      // 尝试通过配置 API 切换（如果支持）
      // 目前配置 API 是只读的，所以返回 success 让前端本地记录
      return {
        success: true,
        data: { modelId },
        hint: '模型偏好已记录。实际切换需通过 OpenClaw 配置文件或 /model 命令完成。'
      }
    }

    // ========== 获取详细统计（日/周/月） ==========
    if (action === 'getStatsDetail') {
      const configStats = await fetchFromConfigApi('/api/stats-detail')
      if (configStats) {
        return { success: true, data: configStats, source: 'config-api' }
      }

      // fallback: 获取基础统计并模拟日维度
      const basicStats = await fetchFromConfigApi('/api/stats')
      if (basicStats) {
        // 构造一个简单的单日数据点
        const today = new Date().toISOString().slice(0, 10)
        return {
          success: true,
          data: {
            totalTokens: basicStats.totalTokens || 0,
            totalMessages: basicStats.totalMessages || 0,
            totalSessions: basicStats.totalSessions || 0,
            daily: [{
              date: today,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: basicStats.totalTokens || 0,
              messageCount: basicStats.totalMessages || 0
            }],
            weekly: [],
            monthly: []
          },
          source: 'basic-stats'
        }
      }

      return { success: true, data: { totalTokens: 0, totalMessages: 0, totalSessions: 0, daily: [], weekly: [], monthly: [] } }
    }

    // ========== 通用代理（直接转发路径） ==========
    if (action === 'proxy' && event.path) {
      const res = await httpRequest(`${baseUrl}${event.path}`, { headers })
      return {
        success: isValidJsonData(res),
        statusCode: res.statusCode,
        contentType: res.contentType,
        data: res.data
      }
    }

    return { success: false, error: '未知 action: ' + action }
  } catch (err) {
    return { success: false, error: err.message || '请求异常' }
  }
}
