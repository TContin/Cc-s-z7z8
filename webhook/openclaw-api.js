/**
 * OpenClaw Config Reader API
 * 
 * 轻量 HTTP 服务，读取 /root/.openclaw/ 下的配置和会话文件
 * 暴露给云函数使用
 * 
 * 部署方式: 在服务器上以 root 运行
 *   sudo node openclaw-api.js
 * 
 * 或用 pm2:
 *   sudo pm2 start openclaw-api.js --name openclaw-api
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 9100
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || '/root/.openclaw'
const API_TOKEN = process.env.OC_API_TOKEN || '2a8ef266638c0f5bb750b1a2dcd68c964882bf8b7674f44a'

// 简单的 token 验证
function checkAuth(req) {
  const auth = req.headers['authorization'] || ''
  const token = auth.replace('Bearer ', '').trim()
  if (token === API_TOKEN) return true
  // 也接受 query 参数
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.searchParams.get('token') === API_TOKEN) return true
  return false
}

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type'
  })
  res.end(JSON.stringify(data))
}

function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (e) {
    console.error(`[readJsonFile] 读取失败 ${filePath}:`, e.message)
    return null
  }
}

// 读取主配置
function getConfig() {
  return readJsonFile(path.join(OPENCLAW_HOME, 'openclaw.json'))
}

// 获取模型列表
function getModels(config) {
  if (!config || !config.models || !config.models.providers) return []
  const providers = config.models.providers
  const models = []

  Object.entries(providers).forEach(([providerId, provider]) => {
    const providerModels = provider.models || []
    providerModels.forEach(m => {
      models.push({
        id: m.id || m.name,
        name: m.name || m.id,
        providerId,
        baseUrl: provider.baseUrl || '',
        api: provider.api || '',
        reasoning: m.reasoning || false,
        input: m.input || ['text'],
        contextWindow: m.contextWindow || 0,
        maxTokens: m.maxTokens || 0,
        cost: m.cost || {}
      })
    })
  })

  return models
}

// 获取 Agent 列表
function getAgents(config) {
  const agentsDir = path.join(OPENCLAW_HOME, 'agents')
  const agents = []

  try {
    const dirs = fs.readdirSync(agentsDir).filter(d => {
      return fs.statSync(path.join(agentsDir, d)).isDirectory()
    })

    dirs.forEach(agentId => {
      const agentDir = path.join(agentsDir, agentId)
      const agentConf = readJsonFile(path.join(agentDir, 'agent', 'agent.json'))
        || readJsonFile(path.join(agentDir, 'agent.json'))
        || {}

      // 读取会话统计
      let sessionCount = 0
      let totalTokens = 0
      let lastActive = 0
      const sessionsFile = path.join(agentDir, 'sessions', 'sessions.json')
      const sessions = readJsonFile(sessionsFile)
      if (sessions && typeof sessions === 'object') {
        const keys = Object.keys(sessions)
        sessionCount = keys.length
        keys.forEach(k => {
          const s = sessions[k]
          if (s.totalTokens) totalTokens += s.totalTokens
          if (s.updatedAt && s.updatedAt > lastActive) lastActive = s.updatedAt
        })
      }

      // 检测绑定的平台
      const platforms = []
      if (config && config.channels) {
        Object.entries(config.channels).forEach(([name, ch]) => {
          if (ch && typeof ch === 'object') {
            platforms.push({
              type: name,
              name: name,
              connected: ch.enabled !== false
            })
          }
        })
      }

      // 判断状态
      const now = Date.now()
      let state = 'offline'
      if (lastActive) {
        const lastMs = lastActive < 1e12 ? lastActive * 1000 : lastActive
        const diff = now - lastMs
        if (diff < 120000) state = 'working'
        else if (diff < 600000) state = 'online'
        else if (diff < 86400000) state = 'idle'
      }

      // 读取模型配置
      const modelConf = agentConf.model || {}
      const modelName = modelConf.primary || modelConf.default || ''

      agents.push({
        id: agentId,
        name: agentConf.name || agentId,
        emoji: agentConf.emoji || '🤖',
        model: modelName,
        state,
        sessionCount,
        totalTokens,
        lastActive: lastActive || 0,
        platforms
      })
    })
  } catch (e) {
    // agents 目录不存在时返回默认 agent
    agents.push({
      id: 'main',
      name: 'Main Bot',
      emoji: '🦞',
      model: '',
      state: 'online',
      sessionCount: 0,
      totalTokens: 0,
      lastActive: 0,
      platforms: []
    })
  }

  return agents
}

// 获取会话列表
function getSessions(agentId) {
  const sessionsFile = path.join(OPENCLAW_HOME, 'agents', agentId || 'main', 'sessions', 'sessions.json')
  const sessions = readJsonFile(sessionsFile)
  if (!sessions || typeof sessions !== 'object') return []

  // 先尝试从 JSONL 中读取每个会话最后使用的模型
  const sessionModels = getSessionModels(agentId)

  const result = []
  const cronJobs = new Set() // 用于去重 cron:run（和 cron:job 是同一个任务）

  Object.entries(sessions).forEach(([key, s]) => {
    const k = key.toLowerCase()
    const parts = key.split(':')

    // 检测会话类型（更精准）
    let type = 'other'
    if (k.includes(':main') || k === 'main') type = 'main'
    else if (k.startsWith('telegram:direct')) type = 'telegram-dm'
    else if (k.startsWith('telegram:group')) type = 'telegram-group'
    else if (k.startsWith('telegram:slash')) type = 'telegram-dm' // slash 命令也算私聊
    else if (k.startsWith('feishu:direct') || k.startsWith('lark:direct')) type = 'feishu-dm'
    else if (k.startsWith('feishu:group') || k.startsWith('lark:group')) type = 'feishu-group'
    else if (k.startsWith('discord:direct')) type = 'discord-dm'
    else if (k.startsWith('discord:channel') || k.startsWith('discord:')) type = 'discord-channel'
    else if (k.startsWith('whatsapp:direct')) type = 'whatsapp-dm'
    else if (k.startsWith('whatsapp:group')) type = 'whatsapp-group'
    else if (k.startsWith('wechat:direct') || k.startsWith('weixin:direct') || k.startsWith('openclaw-weixin:direct')) type = 'wechat-dm'
    else if (k.startsWith('wechat:group') || k.startsWith('weixin:group') || k.startsWith('openclaw-weixin:group')) type = 'wechat-group'
    else if (k.startsWith('cron:run:')) {
      // cron:run 和 cron:job 是同一个任务，跳过 cron:run
      return
    }
    else if (k.startsWith('cron:job:') || k.includes('cron')) type = 'cron'

    // 提取 target（显示友好的标识）
    let target = ''
    if (parts.length >= 3) {
      target = parts.slice(2).join(':')
      // 如果 target 太长，截断
      if (target.length > 30) target = target.slice(0, 12) + '...' + target.slice(-8)
    }

    // 获取当前模型（从 JSONL 中最后的 model_change 事件）
    const currentModel = sessionModels[key] || ''

    result.push({
      key,
      type,
      target,
      sessionId: s.sessionId || '',
      updatedAt: s.updatedAt || 0,
      totalTokens: s.totalTokens || 0,
      contextTokens: s.contextTokens || 0,
      systemSent: s.systemSent !== false,
      currentModel
    })
  })

  // 按最近更新排序
  result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  return result
}

// 从 JSONL 日志中提取每个会话最后使用的模型
function getSessionModels(agentId) {
  const sessionsDir = path.join(OPENCLAW_HOME, 'agents', agentId || 'main', 'sessions')
  const modelMap = {} // { filename: lastModelId }

  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.'))
    files.forEach(f => {
      try {
        const content = fs.readFileSync(path.join(sessionsDir, f), 'utf-8')
        const lines = content.split('\n').filter(l => l.trim())
        // 从后往前找最后一个 model_change
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const obj = JSON.parse(lines[i])
            if (obj.type === 'model_change' && obj.modelId) {
              // 用文件名关联到 session key（简化映射）
              modelMap[f] = obj.modelId
              break
            }
          } catch (e) {}
        }
      } catch (e) {}
    })
  } catch (e) {}

  return modelMap
}

// 获取统计数据
function getStats() {
  const agentsDir = path.join(OPENCLAW_HOME, 'agents')
  let totalTokens = 0, totalMessages = 0, totalSessions = 0
  let totalInputTokens = 0, totalOutputTokens = 0

  try {
    const dirs = fs.readdirSync(agentsDir).filter(d =>
      fs.statSync(path.join(agentsDir, d)).isDirectory()
    )

    dirs.forEach(agentId => {
      const sessionsFile = path.join(agentsDir, agentId, 'sessions', 'sessions.json')
      const sessions = readJsonFile(sessionsFile)
      if (sessions && typeof sessions === 'object') {
        totalSessions += Object.keys(sessions).length
      }

      // 扫描 JSONL 文件
      const sessionsDir = path.join(agentsDir, agentId, 'sessions')
      try {
        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.'))
        files.forEach(f => {
          try {
            const content = fs.readFileSync(path.join(sessionsDir, f), 'utf-8')
            const lines = content.split('\n').filter(l => l.trim())
            lines.forEach(line => {
              try {
                const obj = JSON.parse(line)
                if (obj.type !== 'message') return
                totalMessages++
                // usage 在 obj.message.usage 中
                const msg = obj.message || {}
                if (msg.role === 'assistant' && msg.usage) {
                  const u = msg.usage
                  totalInputTokens += u.input || 0
                  totalOutputTokens += u.output || 0
                  totalTokens += u.totalTokens || ((u.input || 0) + (u.output || 0))
                }
              } catch (e) {}
            })
          } catch (e) {}
        })
      } catch (e) {}
    })
  } catch (e) {}

  return { totalTokens, totalMessages, totalSessions, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, avgResponseMs: 0 }
}

// 获取详细统计（日/周/月维度）
function getStatsDetail() {
  const agentsDir = path.join(OPENCLAW_HOME, 'agents')
  const dayMap = {} // { "2026-03-31": { inputTokens, outputTokens, totalTokens, messageCount } }
  let totalTokens = 0, totalMessages = 0, totalSessions = 0

  try {
    const dirs = fs.readdirSync(agentsDir).filter(d =>
      fs.statSync(path.join(agentsDir, d)).isDirectory()
    )

    dirs.forEach(agentId => {
      // 统计会话数
      const sessionsFile = path.join(agentsDir, agentId, 'sessions', 'sessions.json')
      const sessions = readJsonFile(sessionsFile)
      if (sessions && typeof sessions === 'object') {
        totalSessions += Object.keys(sessions).length
        Object.values(sessions).forEach(s => {
          if (s.totalTokens) totalTokens += s.totalTokens
        })
      }

      // 扫描 JSONL 日志文件
      const sessionsDir = path.join(agentsDir, agentId, 'sessions')
      try {
        const files = fs.readdirSync(sessionsDir).filter(f =>
          f.endsWith('.jsonl') && !f.includes('.deleted.')
        )

        files.forEach(f => {
          try {
            const content = fs.readFileSync(path.join(sessionsDir, f), 'utf-8')
            const lines = content.split('\n').filter(l => l.trim())

            lines.forEach(line => {
              try {
                const obj = JSON.parse(line)
                if (obj.type !== 'message') return

                totalMessages++

                // 提取日期
                let date = ''
                if (obj.timestamp) {
                  const ts = typeof obj.timestamp === 'number'
                    ? (obj.timestamp < 1e12 ? obj.timestamp * 1000 : obj.timestamp)
                    : new Date(obj.timestamp).getTime()
                  date = new Date(ts).toISOString().slice(0, 10)
                }
                if (!date) return

                if (!dayMap[date]) {
                  dayMap[date] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, messageCount: 0 }
                }

                dayMap[date].messageCount++

                // Token 统计：usage 在 obj.message.usage 中
                const msg = obj.message || {}
                if (msg.role === 'assistant' && msg.usage) {
                  const u = msg.usage
                  dayMap[date].inputTokens += u.input || 0
                  dayMap[date].outputTokens += u.output || 0
                  dayMap[date].totalTokens += u.totalTokens || ((u.input || 0) + (u.output || 0))
                }
              } catch (e) {}
            })
          } catch (e) {}
        })
      } catch (e) {}
    })
  } catch (e) {}

  // 转为数组并排序
  const daily = Object.entries(dayMap)
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 聚合为周数据
  const weekMap = {}
  daily.forEach(d => {
    const dt = new Date(d.date)
    const day = dt.getDay()
    const monday = new Date(dt)
    monday.setDate(dt.getDate() - ((day + 6) % 7))
    const weekKey = monday.toISOString().slice(0, 10)

    if (!weekMap[weekKey]) {
      weekMap[weekKey] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, messageCount: 0 }
    }
    weekMap[weekKey].inputTokens += d.inputTokens
    weekMap[weekKey].outputTokens += d.outputTokens
    weekMap[weekKey].totalTokens += d.totalTokens
    weekMap[weekKey].messageCount += d.messageCount
  })

  const weekly = Object.entries(weekMap)
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 聚合为月数据
  const monthMap = {}
  daily.forEach(d => {
    const monthKey = d.date.slice(0, 7)
    if (!monthMap[monthKey]) {
      monthMap[monthKey] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, messageCount: 0 }
    }
    monthMap[monthKey].inputTokens += d.inputTokens
    monthMap[monthKey].outputTokens += d.outputTokens
    monthMap[monthKey].totalTokens += d.totalTokens
    monthMap[monthKey].messageCount += d.messageCount
  })

  const monthly = Object.entries(monthMap)
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { totalTokens, totalMessages, totalSessions, daily, weekly, monthly }
}

// HTTP 服务器
const server = http.createServer((req, res) => {
  // CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    })
    return res.end()
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const pathname = url.pathname

  // 健康检查（不需要认证）
  if (pathname === '/health') {
    return jsonResponse(res, { ok: true, service: 'openclaw-config-api' })
  }

  // 其他接口需要认证
  if (!checkAuth(req)) {
    return jsonResponse(res, { error: 'unauthorized' }, 401)
  }

  const config = getConfig()

  if (pathname === '/api/config') {
    // 返回配置摘要（不暴露 API Key）
    const safe = config ? {
      gateway: config.gateway || {},
      agents: config.agents || {},
      channels: config.channels || {},
      hasModels: !!(config.models && config.models.providers),
      providerCount: config.models ? Object.keys(config.models.providers || {}).length : 0
    } : null
    return jsonResponse(res, { success: true, data: safe })
  }

  if (pathname === '/api/models') {
    const models = getModels(config)
    return jsonResponse(res, { success: true, data: models })
  }

  if (pathname === '/api/agents') {
    const agents = getAgents(config)
    return jsonResponse(res, { success: true, data: agents })
  }

  if (pathname.startsWith('/api/sessions')) {
    const agentId = url.searchParams.get('agentId') || 'main'
    const sessions = getSessions(agentId)
    return jsonResponse(res, { success: true, data: sessions })
  }

  if (pathname === '/api/stats') {
    const stats = getStats()
    return jsonResponse(res, { success: true, data: stats })
  }

  if (pathname === '/api/stats-detail') {
    const detail = getStatsDetail()
    return jsonResponse(res, { success: true, data: detail })
  }

  // 模型探测：直接向上游 provider 发请求
  if (pathname === '/api/probe-model') {
    const modelId = url.searchParams.get('modelId')
    if (!modelId) return jsonResponse(res, { success: false, error: '未指定 modelId' }, 400)

    probeModel(config, modelId).then(result => {
      jsonResponse(res, result)
    }).catch(err => {
      jsonResponse(res, { success: false, error: err.message })
    })
    return // 异步处理
  }

  // 删除会话
  if (pathname === '/api/delete-session') {
    const agentId = url.searchParams.get('agentId') || 'main'
    const sessionKey = url.searchParams.get('sessionKey')
    if (!sessionKey) return jsonResponse(res, { success: false, error: '缺少 sessionKey' }, 400)

    try {
      const sessionsFile = path.join(OPENCLAW_HOME, 'agents', agentId, 'sessions', 'sessions.json')
      const sessions = readJsonFile(sessionsFile)
      if (sessions && sessions[sessionKey] !== undefined) {
        delete sessions[sessionKey]
        fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2), 'utf-8')
        return jsonResponse(res, { success: true })
      }
      return jsonResponse(res, { success: false, error: '会话不存在' })
    } catch (e) {
      return jsonResponse(res, { success: false, error: e.message })
    }
  }

  // 会话内切换模型（写入 JSONL 日志中的 model_change 事件）
  if (pathname === '/api/switch-session-model') {
    const agentId = url.searchParams.get('agentId') || 'main'
    const sessionKey = url.searchParams.get('sessionKey')
    const modelId = url.searchParams.get('modelId')
    if (!sessionKey || !modelId) return jsonResponse(res, { success: false, error: '缺少参数' }, 400)

    try {
      // 找到模型所属的 provider
      let providerId = ''
      if (config && config.models && config.models.providers) {
        for (const [pid, prov] of Object.entries(config.models.providers)) {
          const found = (prov.models || []).find(m => m.id === modelId)
          if (found) { providerId = pid; break }
        }
      }

      // 写入 model_change 事件到对应会话的 JSONL
      const sessionsDir = path.join(OPENCLAW_HOME, 'agents', agentId, 'sessions')
      // 找到会话对应的 jsonl 文件
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.'))

      // 匹配 sessionKey 对应的文件（通常文件名包含 session 信息）
      // 如果找不到精确匹配，写入最近修改的文件
      let targetFile = ''
      for (const f of files) {
        if (f.includes(sessionKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20))) {
          targetFile = path.join(sessionsDir, f)
          break
        }
      }
      if (!targetFile && files.length > 0) {
        // 用最近修改的文件
        const sorted = files.map(f => ({
          name: f,
          mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs
        })).sort((a, b) => b.mtime - a.mtime)
        targetFile = path.join(sessionsDir, sorted[0].name)
      }

      if (targetFile) {
        const event = {
          type: 'model_change',
          id: Math.random().toString(36).slice(2, 10),
          parentId: null,
          timestamp: new Date().toISOString(),
          provider: providerId,
          modelId: modelId
        }
        fs.appendFileSync(targetFile, '\n' + JSON.stringify(event), 'utf-8')
        return jsonResponse(res, { success: true, data: { modelId, providerId } })
      }

      return jsonResponse(res, { success: false, error: '未找到会话文件' })
    } catch (e) {
      return jsonResponse(res, { success: false, error: e.message })
    }
  }

  jsonResponse(res, { error: 'not found' }, 404)
})

// 模型探测：直接向上游 provider 发请求
async function probeModel(config, modelId) {
  if (!config || !config.models || !config.models.providers) {
    return { success: false, error: '无模型配置' }
  }

  // 找到这个模型属于哪个 provider
  const providers = config.models.providers
  let targetProvider = null
  let targetModel = null

  for (const [pid, prov] of Object.entries(providers)) {
    const found = (prov.models || []).find(m => m.id === modelId || m.name === modelId)
    if (found) {
      targetProvider = { id: pid, ...prov }
      targetModel = found
      break
    }
  }

  if (!targetProvider) {
    return { success: false, error: `未找到模型 ${modelId}` }
  }

  const baseUrl = targetProvider.baseUrl
  const apiKey = targetProvider.apiKey
  const api = targetProvider.api || 'openai-completions'

  if (!baseUrl || !apiKey) {
    return { success: false, error: '缺少 baseUrl 或 apiKey' }
  }

  try {
    const https = require('https')
    const http = require('http')
    const startTime = Date.now()

    // 构造请求
    let reqUrl, reqBody, reqHeaders

    if (api === 'anthropic-messages') {
      reqUrl = `${baseUrl}/v1/messages`
      reqHeaders = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
      reqBody = JSON.stringify({
        model: modelId,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply OK.' }]
      })
    } else {
      // OpenAI 兼容
      reqUrl = `${baseUrl}/chat/completions`
      reqHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
      reqBody = JSON.stringify({
        model: modelId,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply OK.' }]
      })
    }

    return new Promise((resolve) => {
      const urlObj = new URL(reqUrl)
      const isHttps = urlObj.protocol === 'https:'
      const lib = isHttps ? https : http

      const req = lib.request({
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: reqHeaders,
        timeout: 15000
      }, (res) => {
        let body = ''
        res.on('data', chunk => body += chunk)
        res.on('end', () => {
          const elapsed = Date.now() - startTime
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, elapsed, statusCode: res.statusCode })
          } else {
            let errMsg = `HTTP ${res.statusCode}`
            try { const d = JSON.parse(body); errMsg = d.error?.message || errMsg } catch (e) {}
            resolve({ success: false, error: errMsg, elapsed, statusCode: res.statusCode })
          }
        })
      })

      req.on('error', (e) => resolve({ success: false, error: e.message, elapsed: Date.now() - startTime }))
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '超时', elapsed: Date.now() - startTime }) })
      req.write(reqBody)
      req.end()
    })
  } catch (e) {
    return { success: false, error: e.message }
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[OpenClaw Config API] Running on http://127.0.0.1:${PORT}`)
  console.log(`[OpenClaw Config API] OPENCLAW_HOME = ${OPENCLAW_HOME}`)
})
