const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const https = require('https')
const crypto = require('crypto')

// ========== 腾讯云 API v3 签名 ==========
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest()
}

function tcApiRequest(secretId, secretKey, service, action, version, payload, region) {
  const host = `${service}.tencentcloudapi.com`
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().substring(0, 10)
  const body = JSON.stringify(payload || {})

  // 1. 拼接规范请求串
  const httpRequestMethod = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  const contentType = 'application/json; charset=utf-8'
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const hashedPayload = sha256(body)
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`

  // 2. 拼接待签名字符串
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256(canonicalRequest)}`

  // 3. 计算签名
  const secretDate = hmacSha256(`TC3${secretKey}`, date)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  // 4. 拼接 Authorization
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const headers = {
    'Content-Type': contentType,
    'Host': host,
    'Authorization': authorization,
    'X-TC-Action': action,
    'X-TC-Version': version,
    'X-TC-Timestamp': timestamp.toString()
  }
  if (region) {
    headers['X-TC-Region'] = region
  }

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host,
      path: '/',
      method: 'POST',
      headers
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          resolve({ error: data })
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
    req.write(body)
    req.end()
  })
}

// ========== 主入口 ==========

// 时间格式化工具
function formatTime(str) {
  if (!str) return ''
  try {
    const d = new Date(str)
    if (isNaN(d.getTime())) return str
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const sec = String(d.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${day} ${h}:${min}:${sec}`
  } catch (e) {
    return str
  }
}

exports.main = async (event) => {
  const { secretId, secretKey, action } = event

  if (!secretId || !secretKey) {
    return { success: false, error: '请提供 SecretId 和 SecretKey' }
  }

  try {
    // ========== 查询轻量应用服务器 ==========
    if (action === 'getLighthouseInstances') {
      const region = event.region || 'ap-guangzhou'
      const res = await tcApiRequest(secretId, secretKey, 'lighthouse', 'DescribeInstances', '2020-03-24', {
        Limit: 100
      }, region)

      if (res.Response && res.Response.Error) {
        return { success: false, error: res.Response.Error.Message }
      }

      const instances = (res.Response && res.Response.InstanceSet) || []
      return {
        success: true,
        data: instances.map(inst => ({
          id: inst.InstanceId,
          name: inst.InstanceName,
          status: inst.InstanceState,
          os: inst.OsName,
          publicIp: (inst.PublicAddresses && inst.PublicAddresses[0]) || '',
          privateIp: (inst.PrivateAddresses && inst.PrivateAddresses[0]) || '',
          cpu: inst.CPU,
          memory: inst.Memory,
          disk: inst.SystemDisk ? inst.SystemDisk.DiskSize : 0,
          bandwidth: inst.InternetAccessible ? inst.InternetAccessible.InternetMaxBandwidthOut : 0,
          expiredTime: inst.ExpiredTime,
          createdTime: inst.CreatedTime,
          region: region,
          zone: inst.Zone
        }))
      }
    }

    // ========== 查询轻量服务器流量包 ==========
    if (action === 'getLighthouseTraffic') {
      const region = event.region || 'ap-guangzhou'
      const instanceId = event.instanceId
      if (!instanceId) return { success: false, error: '请提供 instanceId' }

      const res = await tcApiRequest(secretId, secretKey, 'lighthouse', 'DescribeInstancesTrafficPackages', '2020-03-24', {
        InstanceIds: [instanceId]
      }, region)

      if (res.Response && res.Response.Error) {
        return { success: false, error: res.Response.Error.Message }
      }

      const pkgs = (res.Response && res.Response.InstanceTrafficPackageSet) || []
      return { success: true, data: pkgs }
    }

    // ========== 查询域名列表 ==========
    if (action === 'getDomains') {
      const res = await tcApiRequest(secretId, secretKey, 'domain', 'DescribeDomainNameList', '2018-08-08', {
        Limit: 100
      })

      if (res.Response && res.Response.Error) {
        return { success: false, error: res.Response.Error.Message }
      }

      const domains = (res.Response && res.Response.DomainSet) || []
      return {
        success: true,
        data: domains.map(d => ({
          name: d.DomainName,
          status: d.Status,
          expiredDate: d.ExpirationDate,
          autoRenew: d.AutoRenew,
          buyStatus: d.BuyStatus,
          registrar: d.Registrar
        }))
      }
    }

    // ========== 查询 SSL 证书列表 ==========
    if (action === 'getSSLCertificates') {
      const res = await tcApiRequest(secretId, secretKey, 'ssl', 'DescribeCertificates', '2019-12-05', {
        Limit: 100
      })

      if (res.Response && res.Response.Error) {
        return { success: false, error: res.Response.Error.Message }
      }

      const certs = (res.Response && res.Response.Certificates) || []
      return {
        success: true,
        data: certs.map(c => ({
          id: c.CertificateId,
          domain: c.Domain,
          subjectAltName: c.SubjectAltName,
          status: c.Status,
          certBeginTime: c.CertBeginTime,
          certEndTime: c.CertEndTime,
          productName: c.ProductZhName || c.ProductName,
          isVip: c.IsVip,
          renewable: c.RenewAble
        }))
      }
    }

    // ========== 查询账户余额 ==========
    if (action === 'getBalance') {
      const res = await tcApiRequest(secretId, secretKey, 'billing', 'DescribeAccountBalance', '2018-07-09', {})

      if (res.Response && res.Response.Error) {
        return { success: false, error: res.Response.Error.Message }
      }

      const balance = res.Response
      return {
        success: true,
        data: {
          // 余额单位是分，转成元
          balance: balance.Balance != null ? (balance.Balance / 100).toFixed(2) : '0',
          uin: balance.Uin || '',
          realBalance: balance.RealBalance != null ? (balance.RealBalance / 100).toFixed(2) : '0',
          cashAccountBalance: balance.CashAccountBalance != null ? (balance.CashAccountBalance / 100).toFixed(2) : '0',
          incomeIntoAccountBalance: balance.IncomeIntoAccountBalance != null ? (balance.IncomeIntoAccountBalance / 100).toFixed(2) : '0',
          presentAccountBalance: balance.PresentAccountBalance != null ? (balance.PresentAccountBalance / 100).toFixed(2) : '0',
          freezeAmount: balance.FreezeAmount != null ? (balance.FreezeAmount / 100).toFixed(2) : '0',
          oweAmount: balance.OweAmount != null ? (balance.OweAmount / 100).toFixed(2) : '0'
        }
      }
    }

    // ========== 一次性获取所有数据（仪表盘） ==========
    if (action === 'getDashboard') {
      const region = event.region || 'ap-guangzhou'

      const [instancesRes, domainsRes, certsRes, balanceRes] = await Promise.all([
        tcApiRequest(secretId, secretKey, 'lighthouse', 'DescribeInstances', '2020-03-24', { Limit: 100 }, region),
        tcApiRequest(secretId, secretKey, 'domain', 'DescribeDomainNameList', '2018-08-08', { Limit: 100 }),
        tcApiRequest(secretId, secretKey, 'ssl', 'DescribeCertificates', '2019-12-05', { Limit: 100 }),
        tcApiRequest(secretId, secretKey, 'billing', 'DescribeAccountBalance', '2018-07-09', {})
      ])

      // 轻量服务器
      const instances = (instancesRes.Response && !instancesRes.Response.Error && instancesRes.Response.InstanceSet) || []

      // 流量包 + 实时监控（并行查询）
      let trafficData = []
      let monitorMap = {}

      if (instances.length > 0) {
        const instIds = instances.map(i => i.InstanceId)
        const now = new Date()
        const startTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
        const endTime = now.toISOString()

        // 轻量服务器监控指标（注意和 CVM 不同）
        const metrics = [
          'CpuLoadPercent',    // CPU 利用率
          'MemUsage',          // 内存利用率
          'lanOuttraffic',     // 外网出带宽 (Mbps)
          'lanIntraffic',      // 外网入带宽 (Mbps)
          'DiskReadTraffic',   // 磁盘读流量 (KB/s)
          'DiskWriteTraffic'   // 磁盘写流量 (KB/s)
        ]

        const parallelTasks = [
          // 流量包
          tcApiRequest(secretId, secretKey, 'lighthouse', 'DescribeInstancesTrafficPackages', '2020-03-24', {
            InstanceIds: instIds
          }, region).catch(e => ({ Response: { Error: { Message: e.message } } }))
        ]

        // 为第一台服务器查实时监控
        const mainInstId = instIds[0]
        for (const metric of metrics) {
          parallelTasks.push(
            tcApiRequest(secretId, secretKey, 'monitor', 'GetMonitorData', '2018-07-24', {
              Namespace: 'QCE/LIGHTHOUSE',
              MetricName: metric,
              Period: 300,
              StartTime: startTime,
              EndTime: endTime,
              Instances: [{ Dimensions: [{ Name: 'InstanceId', Value: mainInstId }] }]
            }, region).catch(e => {
              console.error('[monitor] 指标', metric, '查询失败:', e.message)
              return null
            })
          )
        }

        const results = await Promise.all(parallelTasks)

        // 解析流量包
        const trafficRes = results[0]
        console.log('[traffic] 原始返回:', JSON.stringify(trafficRes && trafficRes.Response).substring(0, 500))
        trafficData = (trafficRes && trafficRes.Response && trafficRes.Response.InstanceTrafficPackageSet) || []

        // 解析实时监控
        for (let i = 0; i < metrics.length; i++) {
          const mRes = results[1 + i]
          if (mRes && mRes.Response && !mRes.Response.Error && mRes.Response.DataPoints && mRes.Response.DataPoints.length > 0) {
            const dp = mRes.Response.DataPoints[0]
            const values = dp.Values || []
            const lastVal = values.length > 0 ? values[values.length - 1] : null
            monitorMap[metrics[i]] = lastVal
          } else if (mRes && mRes.Response && mRes.Response.Error) {
            console.log('[monitor] 指标', metrics[i], '错误:', mRes.Response.Error.Message)
          }
        }
        console.log('[monitor] 最终数据:', JSON.stringify(monitorMap))
      }

      // 域名
      const domains = (domainsRes.Response && !domainsRes.Response.Error && domainsRes.Response.DomainSet) || []

      // SSL 证书
      const certs = (certsRes.Response && !certsRes.Response.Error && certsRes.Response.Certificates) || []

      // 余额
      const bal = (balanceRes.Response && !balanceRes.Response.Error) ? balanceRes.Response : null

      return {
        success: true,
        data: {
          instances: instances.map(inst => {
            const tp = trafficData.find(t => t.InstanceId === inst.InstanceId)
            const trafficPkgs = (tp && tp.TrafficPackageSet) || []
            let trafficUsed = 0, trafficTotal = 0
            // 累加所有流量包（不过滤状态）
            trafficPkgs.forEach(p => {
              trafficTotal += p.TrafficPackageTotal || 0
              trafficUsed += p.TrafficUsed || 0
            })

            // 流量包重置时间
            let trafficResetTime = ''
            if (trafficPkgs.length > 0) {
              trafficResetTime = trafficPkgs[0].Deadline || trafficPkgs[0].EndTime || ''
            }

            return {
              id: inst.InstanceId,
              name: inst.InstanceName,
              status: inst.InstanceState,
              os: inst.OsName,
              publicIp: (inst.PublicAddresses && inst.PublicAddresses[0]) || '',
              cpu: inst.CPU,
              memory: inst.Memory,
              diskSize: inst.SystemDisk ? inst.SystemDisk.DiskSize : 0,
              bandwidth: inst.InternetAccessible ? inst.InternetAccessible.InternetMaxBandwidthOut : 0,
              expiredTime: formatTime(inst.ExpiredTime),
              createdTime: formatTime(inst.CreatedTime),
              zone: inst.Zone,
              trafficUsedMB: (trafficUsed / 1048576).toFixed(1),
              trafficTotalGB: (trafficTotal / 1073741824).toFixed(0),
              trafficPercent: trafficTotal > 0 ? ((trafficUsed / trafficTotal) * 100).toFixed(2) : '0',
              trafficResetTime: formatTime(trafficResetTime)
            }
          }),
          // 实时监控（主服务器）
          monitor: {
            cpuPercent: monitorMap['CpuLoadPercent'] != null ? Number(monitorMap['CpuLoadPercent']).toFixed(3) : null,
            memPercent: monitorMap['MemUsage'] != null ? Number(monitorMap['MemUsage']).toFixed(0) : null,
            memUsedMB: monitorMap['MemUsage'] != null && instances.length > 0
              ? (instances[0].Memory * 1024 * Number(monitorMap['MemUsage']) / 100).toFixed(0)
              : null,
            bandwidthInMbps: monitorMap['lanIntraffic'] != null ? Number(monitorMap['lanIntraffic']).toFixed(3) : null,
            bandwidthOutMbps: monitorMap['lanOuttraffic'] != null ? Number(monitorMap['lanOuttraffic']).toFixed(3) : null,
            diskReadKBs: monitorMap['DiskReadTraffic'] != null ? Number(monitorMap['DiskReadTraffic']).toFixed(3) : null,
            diskWriteKBs: monitorMap['DiskWriteTraffic'] != null ? Number(monitorMap['DiskWriteTraffic']).toFixed(3) : null
          },
          domains: domains.map(d => ({
            name: d.DomainName,
            status: d.Status,
            expiredDate: d.ExpirationDate,
            autoRenew: d.AutoRenew
          })),
          certificates: certs.map(c => ({
            id: c.CertificateId,
            domain: c.Domain,
            sans: c.SubjectAltName,
            status: c.Status,
            beginTime: c.CertBeginTime,
            endTime: c.CertEndTime,
            productName: c.ProductZhName || c.ProductName
          })),
          balance: bal ? {
            total: (bal.Balance != null ? (bal.Balance / 100).toFixed(2) : '0'),
            cash: (bal.CashAccountBalance != null ? (bal.CashAccountBalance / 100).toFixed(2) : '0'),
            gift: (bal.PresentAccountBalance != null ? (bal.PresentAccountBalance / 100).toFixed(2) : '0'),
            frozen: (bal.FreezeAmount != null ? (bal.FreezeAmount / 100).toFixed(2) : '0'),
            owe: (bal.OweAmount != null ? (bal.OweAmount / 100).toFixed(2) : '0')
          } : null,
          errors: {
            instances: instancesRes.Response && instancesRes.Response.Error ? instancesRes.Response.Error.Message : null,
            domains: domainsRes.Response && domainsRes.Response.Error ? domainsRes.Response.Error.Message : null,
            certificates: certsRes.Response && certsRes.Response.Error ? certsRes.Response.Error.Message : null,
            balance: balanceRes.Response && balanceRes.Response.Error ? balanceRes.Response.Error.Message : null
          }
        }
      }
    }

    return { success: false, error: '未知 action: ' + action }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
