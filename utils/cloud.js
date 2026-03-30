/**
 * 云端同步工具
 * 使用微信云开发存储用户数据
 * 数据按用户 openid 隔离
 */

// 初始化云开发（需要在 app.js 中调用 wx.cloud.init）
const COLLECTION_NAME = 'user_data'

/**
 * 上传数据到云端
 */
async function uploadToCloud() {
  try {
    const db = wx.cloud.database()
    const { result } = await wx.cloud.callFunction({ name: 'getOpenId' })
    const openid = result.openid

    const passwords = wx.getStorageSync('passwords') || []
    const subscriptions = wx.getStorageSync('subscriptions') || []
    const settings = wx.getStorageSync('settings') || {}
    const notes = wx.getStorageSync('notes') || []
    const apiCredentials = wx.getStorageSync('apiCredentials') || null

    // 不上传访问密码到云端（安全考虑）
    const safeSettings = { ...settings }
    delete safeSettings.password

    const data = {
      passwords,
      subscriptions,
      settings: safeSettings,
      notes,
      apiCredentials,
      updatedAt: new Date().toISOString()
    }

    // 查询是否已有记录
    const { data: existing } = await db.collection(COLLECTION_NAME)
      .where({ _openid: openid })
      .limit(1)
      .get()

    if (existing.length > 0) {
      // 更新
      await db.collection(COLLECTION_NAME).doc(existing[0]._id).update({
        data
      })
    } else {
      // 新建
      await db.collection(COLLECTION_NAME).add({ data })
    }

    return { success: true }
  } catch (err) {
    console.error('上传云端失败:', err)
    return { success: false, error: err.message || '上传失败' }
  }
}

/**
 * 从云端下载数据
 */
async function downloadFromCloud() {
  try {
    const db = wx.cloud.database()
    const { result } = await wx.cloud.callFunction({ name: 'getOpenId' })
    const openid = result.openid

    const { data } = await db.collection(COLLECTION_NAME)
      .where({ _openid: openid })
      .limit(1)
      .get()

    if (data.length === 0) {
      return { success: false, error: '云端暂无数据' }
    }

    const cloudData = data[0]
    return {
      success: true,
      data: {
        passwords: cloudData.passwords || [],
        subscriptions: cloudData.subscriptions || [],
        settings: cloudData.settings || {},
        notes: cloudData.notes || [],
        apiCredentials: cloudData.apiCredentials || null,
        updatedAt: cloudData.updatedAt || ''
      }
    }
  } catch (err) {
    console.error('下载云端失败:', err)
    return { success: false, error: err.message || '下载失败' }
  }
}

/**
 * 将云端数据覆盖到本地
 */
async function syncFromCloud() {
  const result = await downloadFromCloud()
  if (!result.success) return result

  const { passwords, subscriptions, settings, notes, apiCredentials } = result.data

  // 覆盖本地数据
  wx.setStorageSync('passwords', passwords)
  wx.setStorageSync('subscriptions', subscriptions)
  if (notes && notes.length > 0) {
    wx.setStorageSync('notes', notes)
  }
  if (apiCredentials) {
    wx.setStorageSync('apiCredentials', apiCredentials)
  }

  // 合并设置（保留本地密码）
  const localSettings = wx.getStorageSync('settings') || {}
  const mergedSettings = {
    ...localSettings,
    ...settings,
    password: localSettings.password || '' // 保留本地密码
  }
  wx.setStorageSync('settings', mergedSettings)

  return { success: true, updatedAt: result.data.updatedAt }
}

/**
 * 清除云端数据
 */
async function clearCloudData() {
  try {
    const db = wx.cloud.database()
    const { result } = await wx.cloud.callFunction({ name: 'getOpenId' })
    const openid = result.openid

    const { data: existing } = await db.collection(COLLECTION_NAME)
      .where({ _openid: openid })
      .limit(1)
      .get()

    if (existing.length > 0) {
      await db.collection(COLLECTION_NAME).doc(existing[0]._id).remove()
    }

    return { success: true }
  } catch (err) {
    console.error('清除云端数据失败:', err)
    return { success: false, error: err.message || '清除失败' }
  }
}

/**
 * 自动上传（设置变更时调用）
 */
async function autoUploadIfEnabled() {
  const settings = wx.getStorageSync('settings') || {}
  if (settings.cloudSync) {
    return await uploadToCloud()
  }
  return { success: false, error: '未开启云同步' }
}

module.exports = {
  uploadToCloud,
  downloadFromCloud,
  syncFromCloud,
  clearCloudData,
  autoUploadIfEnabled
}
