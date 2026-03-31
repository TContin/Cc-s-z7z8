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

  // OpenClaw Gateway 认证：Bearer token
  const headers = {}
  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`
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
      // 并行请求可用的 REST 端点
      const [healthRes, modelsRes] = await Promise.all([
        httpRequest(`${baseUrl}/health`, { headers }).catch(e => ({ statusCode: 0, data: null, error: e.message })),
        httpRequest(`${baseUrl}/v1/models`, { headers }).catch(e => ({ statusCode: 0, data: null, error: e.message }))
      ])

      // 调试信息
      const debug = {
        health: { status: healthRes.statusCode, contentType: healthRes.contentType, isJson: isValidJsonData(healthRes) },
        models: { status: modelsRes.statusCode, contentType: modelsRes.contentType, isJson: isValidJsonData(modelsRes) }
      }

      // ---- 解析健康状态 ----
      const healthy = healthRes.statusCode === 200
      const healthData = healthy ? healthRes.data : null

      // ---- 解析模型列表 (GET /v1/models) ----
      // OpenAI 兼容格式: { object: "list", data: [{ id, object, created, owned_by }] }
      const modelMap = {}

      if (isValidJsonData(modelsRes)) {
        const modelsList = parseModelsList(modelsRes.data)

        for (const m of modelsList) {
          const name = m.id || m.name || m.model || ''
          if (name) {
            modelMap[name] = {
              messages: 0,
              tokens: 0,
              owned_by: m.owned_by || '',
              created: m.created || 0
            }
          }
        }

        debug.modelsCount = modelsList.length
        // 记录第一个模型的结构以帮助调试
        if (modelsList.length > 0) {
          debug.modelSample = Object.keys(modelsList[0])
        }
      } else {
        // /v1/models 返回了 HTML 而非 JSON，可能认证问题
        debug.modelsError = modelsRes.data && modelsRes.data._raw
          ? '返回了HTML而非JSON: ' + modelsRes.data._raw.substring(0, 100)
          : '请求失败 HTTP ' + modelsRes.statusCode
      }

      // 转换 modelMap 为数组
      const modelDistribution = Object.entries(modelMap)
        .filter(([name]) => name !== 'unknown' && name !== '')
        .map(([name, data]) => ({
          name,
          messages: data.messages,
          tokens: data.tokens,
          owned_by: data.owned_by
        }))

      return {
        success: true,
        data: {
          sessions: { total: 0, active: 0 },  // WebSocket 才能获取，REST 不可用
          messages: { total: 0, tokens: 0, inputTokens: 0, outputTokens: 0 },
          models: modelDistribution,
          cost: 0,
          healthy: healthy,
          gatewayStatus: healthData ? healthData.status : 'unknown'
        },
        debug: debug  // 调试信息，帮助定位问题
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
      const res = await httpRequest(`${baseUrl}/v1/models`, { headers })
      if (isValidJsonData(res)) {
        return { success: true, data: res.data }
      }
      return {
        success: false,
        error: `模型列表获取失败 (HTTP ${res.statusCode})`,
        contentType: res.contentType,
        hint: res.data && res.data._isHtml ? '返回了HTML页面而非JSON，请检查Token认证' : ''
      }
    }

    // ========== 获取 Agent 列表 ==========
    // OpenClaw 配置中的 agents 通过 /v1/models 推断
    // 因为 REST 不直接暴露 agents，所以用模型列表构造虚拟 agent
    if (action === 'getAgents') {
      const [healthRes, modelsRes] = await Promise.all([
        httpRequest(`${baseUrl}/health`, { headers }).catch(e => ({ statusCode: 0, data: null })),
        httpRequest(`${baseUrl}/v1/models`, { headers }).catch(e => ({ statusCode: 0, data: null }))
      ])

      const healthy = healthRes.statusCode === 200

      // 从模型列表中提取 agent 风格的条目
      // OpenClaw 在 /v1/models 中会返回 openclaw, openclaw/default, openclaw/<agentId>
      const agents = []
      if (isValidJsonData(modelsRes)) {
        const list = parseModelsList(modelsRes.data)
        const agentModels = list.filter(m => {
          const id = m.id || ''
          return id.startsWith('openclaw/') && id !== 'openclaw/default'
        })

        // 如果有 openclaw/ 前缀的，每个是一个 agent
        if (agentModels.length > 0) {
          agentModels.forEach(m => {
            const agentId = (m.id || '').replace('openclaw/', '')
            agents.push({
              id: agentId,
              name: agentId,
              emoji: '🤖',
              model: m.owned_by || '--',
              state: healthy ? 'online' : 'offline',
              sessionCount: 0,
              platforms: []
            })
          })
        } else {
          // 没有明确的 agent，构造一个默认 "main" agent
          agents.push({
            id: 'main',
            name: 'Main Bot',
            emoji: '🦞',
            model: list.length > 0 ? (list[0].id || '--') : '--',
            state: healthy ? 'online' : 'offline',
            sessionCount: 0,
            platforms: []
          })
        }
      }

      return { success: true, data: agents }
    }

    // ========== 获取会话列表 ==========
    // REST API 不直接暴露会话，返回提示信息
    if (action === 'getSessions') {
      // 尝试通过 /api/sessions 探测（部分版本可能支持）
      const res = await httpRequest(`${baseUrl}/api/sessions`, { headers }).catch(e => ({ statusCode: 0, data: null }))

      if (isValidJsonData(res)) {
        const sessions = Array.isArray(res.data) ? res.data : (res.data.sessions || res.data.data || [])
        return { success: true, data: sessions }
      }

      // REST 不支持，返回空列表并提示
      return {
        success: true,
        data: [],
        hint: '会话数据需要通过 OpenClaw Dashboard Web UI 查看（Gateway 使用 WebSocket 传输会话数据）'
      }
    }

    // ========== 获取统计概览 ==========
    if (action === 'getStats') {
      // 尝试多个可能的统计端点
      const res = await httpRequest(`${baseUrl}/api/stats`, { headers }).catch(e => ({ statusCode: 0, data: null }))

      if (isValidJsonData(res)) {
        return { success: true, data: res.data }
      }

      // REST 不直接支持统计，返回空数据
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

      try {
        // 向模型发送极简请求验证可用性
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

        if (res.statusCode === 200 && isValidJsonData(res)) {
          return { success: true, data: res.data }
        }

        // 检查具体错误
        const errMsg = res.data && typeof res.data === 'object'
          ? (res.data.error && res.data.error.message) || JSON.stringify(res.data).substring(0, 100)
          : `HTTP ${res.statusCode}`

        return { success: false, error: errMsg, statusCode: res.statusCode }
      } catch (err) {
        return { success: false, error: err.message || '探测异常' }
      }
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
