#!/bin/bash
# ============================================
# AI 智能体交互脚本
# 用法: bash ai-chat.sh "你的需求描述"
# 示例: bash ai-chat.sh "把密码本的分类增加一个教育类"
# ============================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
AIDER_ENV="$HOME/aider-env"

# 检查参数
if [ -z "$1" ]; then
    echo "用法: bash ai-chat.sh \"你的修改需求\""
    echo ""
    echo "示例:"
    echo "  bash ai-chat.sh \"把密码本的分类增加一个教育类\""
    echo "  bash ai-chat.sh \"订阅管理增加按名称搜索功能\""
    echo "  bash ai-chat.sh \"首页增加一个快捷入口卡片\""
    echo ""
    echo "交互模式（不带参数直接对话）:"
    echo "  bash ai-chat.sh --interactive"
    exit 1
fi

cd "$PROJECT_DIR"

# 激活 aider 虚拟环境
source "$AIDER_ENV/bin/activate"

if [ "$1" = "--interactive" ]; then
    # 交互模式 - 持续对话
    echo "🤖 进入 AI 交互模式（输入 /exit 退出）"
    echo "📁 项目: $PROJECT_DIR"
    echo ""
    aider --auto-commits --auto-test --model "$AI_MODEL"
else
    # 单次任务模式 - 执行完自动提交并推送
    echo "🤖 AI 正在处理: $1"
    echo "📁 项目: $PROJECT_DIR"
    echo ""

    # 让 AI 修改代码（自动 commit）
    aider --auto-commits --model "${AI_MODEL:-claude-sonnet-4-20250514}" --message "$1"

    # 自动推送到远程
    echo ""
    echo "📤 推送到 Git 远程仓库..."
    git push origin main

    if [ $? -eq 0 ]; then
        echo "✅ 代码已推送！Webhook 将自动触发小程序更新"
    else
        echo "❌ 推送失败，请检查 Git 配置"
    fi
fi

deactivate
