const { getData, saveData, showToast, showConfirm } = require('../../../utils/util')
const { encrypt, decrypt } = require('../../../utils/crypto')

Page({
  data: {
    secretId: '',
    secretKey: '',
    region: 'ap-guangzhou',
    isEdit: false,
    testing: false,
    testStatus: '', // '' | 'success' | 'fail'
    testStatusText: '',
    regions: [
      { value: 'ap-guangzhou', label: '广州' },
      { value: 'ap-shanghai', label: '上海' },
      { value: 'ap-beijing', label: '北京' },
      { value: 'ap-chengdu', label: '成都' },
      { value: 'ap-nanjing', label: '南京' },
      { value: 'ap-hongkong', label: '中国香港' },
      { value: 'ap-singapore', label: '新加坡' },
      { value: 'ap-tokyo', label: '东京' },
      { value: 'na-siliconvalley', label: '硅谷' }
    ],
    regionIndex: 0
  },

  onLoad() {
    const config = getData('cloudConfig', null)
    if (config) {
      const regionIdx = this.data.regions.findIndex(r => r.value === config.region)
      this.setData({
        secretId: config.secretId || '',
        secretKey: config.secretKey ? '••••••••••••••••' : '',
        region: config.region || 'ap-guangzhou',
        regionIndex: regionIdx >= 0 ? regionIdx : 0,
        isEdit: true
      })
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [field]: e.detail.value })
  },

  onRegionChange(e) {
    const idx = parseInt(e.detail.value)
    this.setData({
      regionIndex: idx,
      region: this.data.regions[idx].value
    })
  },

  // 测试连接
  async onTestConnection() {
    const { secretId, secretKey } = this.data
    if (!secretId.trim()) { showToast('请输入 SecretId'); return }

    let realKey = ''
    if (secretKey === '••••••••••••••••') {
      const old = getData('cloudConfig', null)
      if (old && old.secretKey) realKey = decrypt(old.secretKey)
    } else {
      realKey = secretKey.trim()
    }
    if (!realKey) { showToast('请输入 SecretKey'); return }

    this.setData({ testing: true, testStatus: '', testStatusText: '测试中...' })

    try {
      const res = await new Promise((resolve) => {
        wx.cloud.callFunction({
          name: 'tencentCloud',
          data: {
            action: 'getBalance',
            secretId: secretId.trim(),
            secretKey: realKey
          },
          success: (r) => {
            console.log('[测试连接] 返回:', JSON.stringify(r.result))
            resolve(r.result || {})
          },
          fail: (err) => resolve({ success: false, error: err.errMsg })
        })
      })

      if (res.success) {
        this.setData({
          testing: false,
          testStatus: 'success',
          testStatusText: '连接成功！账户余额 ¥' + (res.data ? res.data.balance : '--')
        })
      } else {
        this.setData({
          testing: false,
          testStatus: 'fail',
          testStatusText: res.error || '连接失败'
        })
      }
    } catch (err) {
      this.setData({
        testing: false,
        testStatus: 'fail',
        testStatusText: '异常: ' + err.message
      })
    }
  },

  onSave() {
    const { secretId, secretKey, region } = this.data

    if (!secretId.trim()) { showToast('请输入 SecretId'); return }

    let encryptedKey = ''
    if (secretKey === '••••••••••••••••') {
      const old = getData('cloudConfig', null)
      encryptedKey = old ? old.secretKey : ''
    } else if (secretKey.trim()) {
      encryptedKey = encrypt(secretKey.trim())
    }

    if (!encryptedKey) { showToast('请输入 SecretKey'); return }

    const config = {
      secretId: secretId.trim(),
      secretKey: encryptedKey,
      region: region,
      updatedAt: new Date().toISOString()
    }

    saveData('cloudConfig', config)
    showToast('已保存')
    setTimeout(() => wx.navigateBack(), 500)
  },

  async onDelete() {
    const confirm = await showConfirm('删除配置', '确定要删除腾讯云配置吗？')
    if (confirm) {
      wx.removeStorageSync('cloudConfig')
      showToast('已删除')
      setTimeout(() => wx.navigateBack(), 500)
    }
  }
})
