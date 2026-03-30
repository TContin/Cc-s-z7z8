/**
 * API 监控调试工具
 * 在开发者工具「控制台」粘贴执行
 */

// ============================================================
// 【测试1】直接调云函数测试密码登录（粘贴到控制台执行）
// ============================================================

/*

wx.cloud.callFunction({
  name: 'apiProxy',
  data: {
    action: 'passwordLogin',
    email: 'contin-kd@outlook.com',
    password: '你的真实密码',
    cookie: ''
  },
  success: (res) => {
    console.log('===== 登录结果 =====')
    console.log('完整返回:', JSON.stringify(res.result, null, 2))
    if (res.result && res.result.success) {
      console.log('✅ 登录成功! userId:', res.result.userId)
      console.log('Cookie 长度:', res.result.cookie ? res.result.cookie.length : 0)
    } else {
      console.log('❌ 登录失败:', res.result && res.result.error)
    }
  },
  fail: (err) => {
    console.error('云函数调用失败:', err)
  }
})

*/

// ============================================================
// 【测试2】检查云函数是否已更新（看有没有 passwordLogin action）
// ============================================================

/*

wx.cloud.callFunction({
  name: 'apiProxy',
  data: {
    action: 'passwordLogin',
    email: '',
    password: '',
    cookie: ''
  },
  success: (res) => {
    console.log('云函数返回:', JSON.stringify(res.result))
    // 如果返回 { success: false, error: '请提供邮箱和密码' } 说明云函数已更新
    // 如果返回别的（比如报错 path 相关），说明云函数还没更新成功
  },
  fail: (err) => {
    console.error('云函数调用失败:', err)
  }
})

*/

// ============================================================
// 【测试3】手动写入配置（老方法，应急用）
// ============================================================

/*

wx.setStorageSync('apiConfig', {
  userId: '37313b8f-b0fb-4195-9619-5a6ecb802c2a',
  cookie: '在这里粘贴从浏览器复制的完整Cookie',
  name: 'AI Code With',
  updatedAt: new Date().toISOString()
})

console.log('✅ API 配置已写入！请重新进入 API 监控页面')

*/
