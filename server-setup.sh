#!/bin/bash
# ============================================
# 私人工具箱 - Ubuntu 24.04 服务器部署脚本
# 一键配置：Git + AI智能体 + 自动部署小程序
# ============================================

set -e

echo "========================================="
echo "  私人工具箱 - 服务器端自动部署配置"
echo "  适用系统: Ubuntu Server 24.04 LTS"
echo "========================================="

# ---- 配置区域（请修改为你的实际信息）----
APPID="wx你的AppID"                          # 小程序 AppID
PROJECT_DIR="/home/$(whoami)/miniprogram"     # 项目存放目录
GIT_REPO="https://github.com/你的用户名/private-toolbox.git"  # Git 仓库地址
WEBHOOK_PORT=9000                             # Webhook 监听端口
AI_MODEL="claude-sonnet-4-20250514"                  # Aider 使用的模型（可选）
# -----------------------------------------

echo ""
echo "[1/6] 更新系统 & 安装基础依赖..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget build-essential python3 python3-pip python3-venv nginx

echo ""
echo "[2/6] 安装 Node.js 20.x..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo "Node: $(node -v), npm: $(npm -v)"

echo ""
echo "[3/6] 安装 miniprogram-ci（小程序上传工具）..."
sudo npm install -g miniprogram-ci

echo ""
echo "[4/6] 安装 Aider（AI 编程智能体）..."
python3 -m venv ~/aider-env
source ~/aider-env/bin/activate
pip install aider-chat
deactivate

echo ""
echo "[5/6] 克隆项目仓库..."
if [ ! -d "$PROJECT_DIR" ]; then
    git clone "$GIT_REPO" "$PROJECT_DIR"
else
    echo "项目目录已存在，跳过克隆"
fi

echo ""
echo "[6/6] 创建部署脚本和 Webhook 服务..."

# 创建部署脚本
cat > "$PROJECT_DIR/deploy.js" << 'DEPLOY_EOF'
const ci = require('miniprogram-ci');
const path = require('path');
const fs = require('fs');

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'deploy.config.json'), 'utf-8')
);

(async () => {
  try {
    const project = new ci.Project({
      appid: config.appid,
      type: 'miniProgram',
      projectPath: __dirname,
      privateKeyPath: path.join(__dirname, 'private.key'),
      ignores: ['node_modules/**', 'deploy.*', 'private.key', '.git/**', 'webhook/**'],
    });

    const now = new Date();
    const version = `1.0.${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;

    const uploadResult = await ci.upload({
      project,
      version,
      desc: `自动部署 ${now.toLocaleString('zh-CN')}`,
      setting: {
        es6: true,
        minify: true,
        minifyWXSS: true,
        minifyWXML: true,
      },
      onProgressUpdate: console.log,
    });

    console.log(`\n✅ 上传成功！版本号: ${version}`);
    console.log('请在小程序后台将此版本「选为体验版」（仅首次需要）');
    console.log(uploadResult);
  } catch (err) {
    console.error('❌ 上传失败:', err.message);
    process.exit(1);
  }
})();
DEPLOY_EOF

# 创建部署配置
cat > "$PROJECT_DIR/deploy.config.json" << EOF
{
  "appid": "$APPID"
}
EOF

echo ""
echo "========================================="
echo "  ✅ 基础环境安装完成！"
echo ""
echo "  接下来你还需要手动完成："
echo ""
echo "  1. 将小程序上传密钥放到:"
echo "     $PROJECT_DIR/private.key"
echo ""
echo "  2. 配置 Git 推送权限（SSH Key 或 Token）"
echo ""
echo "  3. 设置 AI 模型的 API Key:"
echo "     export ANTHROPIC_API_KEY=你的key"
echo "     或"
echo "     export OPENAI_API_KEY=你的key"
echo ""
echo "  4. 启动 Webhook 服务:"
echo "     cd $PROJECT_DIR/webhook && bash start.sh"
echo ""
echo "  详细说明见: $PROJECT_DIR/SERVER_README.md"
echo "========================================="
