# 服务器部署指南 - Ubuntu 24.04 LTS

## 快速开始

### 第一步：本地推送代码到 Git

```bash
# 在你的 Windows 电脑上
cd 项目目录
git init
git add .
git commit -m "init: 私人工具箱小程序"

# 先去 GitHub/Gitee 创建仓库，然后：
git remote add origin https://github.com/你的用户名/private-toolbox.git
git push -u origin main
```

### 第二步：服务器上运行部署脚本

```bash
# SSH 登录服务器
ssh user@你的服务器IP

# 下载并执行部署脚本（或手动上传）
# 先修改 server-setup.sh 中的配置区域：APPID、GIT_REPO 等
bash server-setup.sh
```

### 第三步：配置密钥（3个）

#### 1) 小程序上传密钥
- 登录 https://mp.weixin.qq.com
- 开发 → 开发设置 → 小程序代码上传
- 点击「生成」下载密钥文件
- 上传到服务器：
```bash
scp private.key user@服务器IP:/home/user/miniprogram/private.key
```

#### 2) Git SSH Key（让服务器能 push 代码）
```bash
# 在服务器上生成
ssh-keygen -t ed25519 -C "your@email.com"
cat ~/.ssh/id_ed25519.pub
# 复制公钥，添加到 GitHub → Settings → SSH Keys
```

#### 3) AI 模型 API Key
```bash
# 写入 ~/.bashrc 永久生效
echo 'export ANTHROPIC_API_KEY=sk-ant-你的密钥' >> ~/.bashrc

# 或者用 OpenAI
echo 'export OPENAI_API_KEY=sk-你的密钥' >> ~/.bashrc

source ~/.bashrc
```

### 第四步：配置 Webhook 为系统服务（开机自启）

```bash
cd /home/$(whoami)/miniprogram

# 修改 service 文件中的用户名和路径
sed -i "s|REPLACE_WITH_YOUR_USERNAME|$(whoami)|g" webhook/miniprogram-webhook.service
sed -i "s|REPLACE_WITH_PROJECT_DIR|$(pwd)|g" webhook/miniprogram-webhook.service

# 安装为系统服务
sudo cp webhook/miniprogram-webhook.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable miniprogram-webhook
sudo systemctl start miniprogram-webhook

# 检查状态
sudo systemctl status miniprogram-webhook
```

### 第五步：配置 GitHub Webhook

1. 打开 GitHub 仓库 → Settings → Webhooks → Add webhook
2. Payload URL: `http://你的服务器IP:9000/webhook`
3. Content type: `application/json`
4. Secret: 留空（或设置后同步到服务环境变量 `WEBHOOK_SECRET`）
5. 触发事件: 选 `Just the push event`

### 第六步：防火墙放行

```bash
# 放行 Webhook 端口
sudo ufw allow 9000/tcp
sudo ufw status
```

---

## 日常使用

### 方式一：一句话让 AI 改代码（推荐）

```bash
# SSH 登录服务器后：
cd ~/miniprogram

# 单次任务 - 说完就改、改完就推、推完就更新
bash ai-chat.sh "把密码本的分类增加一个「教育」类别"
bash ai-chat.sh "订阅管理列表增加按名称搜索功能"
bash ai-chat.sh "首页增加显示最近到期的3个订阅"

# 交互模式 - 持续对话
bash ai-chat.sh --interactive
```

### 方式二：手动改代码后推送

```bash
cd ~/miniprogram
# 编辑文件...
git add .
git commit -m "fix: 修复xxx"
git push origin main
# Webhook 自动触发部署
```

### 方式三：只部署不推送

```bash
cd ~/miniprogram
node deploy.js
```

---

## 完整链路

```
你 SSH 到服务器
    │
    ▼
bash ai-chat.sh "需求描述"
    │
    ├── Aider 调用大模型分析代码
    ├── 自动修改相关文件
    ├── 自动 git commit
    └── 自动 git push
         │
         ▼
    GitHub 触发 Webhook
         │
         ▼
    服务器 Webhook 收到通知
         │
         ├── git pull（拉最新代码）
         └── node deploy.js（上传小程序）
              │
              ▼
    小程序体验版自动更新 ✅
```

---

## 常见问题

### Q: 每次都要 SSH 登录服务器吗？
可以用手机 SSH 工具（如 Termius、JuiceSSH），随时随地对话修改。
也可以后续搭个 Web 聊天界面，通过网页与 AI 对话。

### Q: miniprogram-ci 上传后需要手动设为体验版吗？
首次上传需要去后台手动「选为体验版」，之后的更新会自动覆盖体验版。

### Q: Aider 支持哪些模型？
- Claude (Anthropic) - 推荐，代码能力强
- GPT-4 (OpenAI)
- DeepSeek
- 本地模型 (Ollama)

### Q: 日志在哪看？
```bash
# Webhook 日志
tail -f ~/miniprogram/webhook/webhook.log

# 系统服务日志
sudo journalctl -u miniprogram-webhook -f
```

### Q: 如何更新 Aider？
```bash
source ~/aider-env/bin/activate
pip install --upgrade aider-chat
deactivate
```
