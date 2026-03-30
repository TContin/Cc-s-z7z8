const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { path, cookie } = event
  const url = 'https://aicodewith.com' + path

  try {
    const res = await cloud.fetch({
      url,
      method: 'GET',
      headers: {
        'Cookie': cookie,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://aicodewith.com/zh/dashboard/usage-records'
      }
    })

    // cloud.fetch 返回的 body 可能是 Buffer
    let data = res.body
    if (Buffer.isBuffer(data)) {
      data = JSON.parse(data.toString('utf-8'))
    } else if (typeof data === 'string') {
      try { data = JSON.parse(data) } catch (e) {}
    }

    return {
      success: true,
      statusCode: res.status || res.statusCode || 200,
      data
    }
  } catch (err) {
    // cloud.fetch 可能不可用，改用 got/node-fetch
    const http = require('https')
    
    return new Promise((resolve) => {
      const urlObj = new URL(url)
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'Cookie': cookie,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://aicodewith.com/zh/dashboard/usage-records'
        }
      }

      const req = http.request(options, (res) => {
        let body = ''
        res.on('data', chunk => body += chunk)
        res.on('end', () => {
          let parsed
          try { parsed = JSON.parse(body) } catch (e) { parsed = body }
          resolve({
            success: true,
            statusCode: res.statusCode,
            data: parsed
          })
        })
      })

      req.on('error', (e) => {
        resolve({ success: false, error: e.message })
      })

      req.setTimeout(10000, () => {
        req.destroy()
        resolve({ success: false, error: '请求超时' })
      })

      req.end()
    })
  }
}
