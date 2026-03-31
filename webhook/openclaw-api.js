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

  const result = []
  Object.entries(sessions).forEach(([key, s]) => {
    // 检测会话类型
    let type = 'other'
    const k = key.toLowerCase()
    if (k.includes(':main')) type = 'main'
    else if (k.includes('feishu') && k.includes('direct')) type = 'feishu-dm'
    else if (k.includes('feishu') && k.includes('group')) type = 'feishu-group'
    else if (k.includes('discord') && k.includes('direct')) type = 'discord-dm'
    else if (k.includes('discord')) type = 'discord-channel'
    else if (k.includes('telegram') && k.includes('group')) type = 'telegram-group'
    else if (k.includes('telegram')) type = 'telegram-dm'
    else if (k.includes('whatsapp') && k.includes('group')) type = 'whatsapp-group'
    else if (k.includes('whatsapp')) type = 'whatsapp-dm'
    else if (k.includes('cron')) type = 'cron'

    // 提取 target
    let target = ''
    const parts = key.split(':')
    if (parts.length >= 3) target = parts[parts.length - 1]

    result.push({
      key,
      type,
      target,
      sessionId: s.sessionId || '',
      updatedAt: s.updatedAt || 0,
      totalTokens: s.totalTokens || 0,
      contextTokens: s.contextTokens || 0,
      systemSent: s.systemSent !== false
    })
  })

  // 按最近更新排序
  result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  return result
}

// 获取统计数据
function getStats() {
  const agentsDir = path.join(OPENCLAW_HOME, 'agents')
  let totalTokens = 0, totalMessages = 0, totalSessions = 0

  try {
    const dirs = fs.readdirSync(agentsDir).filter(d =>
      fs.statSync(path.join(agentsDir, d)).isDirectory()
    )

    dirs.forEach(agentId => {
      // 统计会话
      const sessionsFile = path.join(agentsDir, agentId, 'sessions', 'sessions.json')
      const sessions = readJsonFile(sessionsFile)
      if (sessions && typeof sessions === 'object') {
        totalSessions += Object.keys(sessions).length
        Object.values(sessions).forEach(s => {
          if (s.totalTokens) totalTokens += s.totalTokens
        })
      }

      // 统计消息（扫描 JSONL 文件）
      const sessionsDir = path.join(agentsDir, agentId, 'sessions')
      try {
        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'))
        files.forEach(f => {
          try {
            const content = fs.readFileSync(path.join(sessionsDir, f), 'utf-8')
            const lines = content.split('\n').filter(l => l.trim())
            lines.forEach(line => {
              try {
                const obj = JSON.parse(line)
                if (obj.type === 'message') totalMessages++
              } catch (e) {}
            })
          } catch (e) {}
        })
      } catch (e) {}
    })
  } catch (e) {}

  return { totalTokens, totalMessages, totalSessions, avgResponseMs: 0 }
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

                // Token 统计（只统计 assistant 消息的 usage）
                if (obj.role === 'assistant' && obj.usage) {
                  const u = obj.usage
                  dayMap[date].inputTokens += u.input || u.inputTokens || u.prompt_tokens || 0
                  dayMap[date].outputTokens += u.output || u.outputTokens || u.completion_tokens || 0
                  dayMap[date].totalTokens += u.totalTokens || u.total_tokens || ((u.input || 0) + (u.output || 0))
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

  jsonResponse(res, { error: 'not found' }, 404)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[OpenClaw Config API] Running on http://127.0.0.1:${PORT}`)
  console.log(`[OpenClaw Config API] OPENCLAW_HOME = ${OPENCLAW_HOME}`)
})
