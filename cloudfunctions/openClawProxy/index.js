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
        const modelsData = modelsRes.data
        // 尝试多种可能的数据结构
        let modelsList = []
        if (Array.isArray(modelsData)) {
          modelsList = modelsData
        } else if (modelsData && Array.isArray(modelsData.data)) {
          modelsList = modelsData.data
        } else if (modelsData && Array.isArray(modelsData.models)) {
          modelsList = modelsData.models
        }

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
