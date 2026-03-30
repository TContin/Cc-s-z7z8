"""
Webhook Server - 监听 Git Push 事件，自动部署小程序
适用于 GitHub / Gitee / 自建 Git 仓库
"""

import http.server
import json
import subprocess
import os
import hmac
import hashlib
from datetime import datetime

PORT = int(os.environ.get('WEBHOOK_PORT', 9000))
SECRET = os.environ.get('WEBHOOK_SECRET', '')  # 可选，用于验证请求
PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def log(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f'[{timestamp}] {msg}', flush=True)


def verify_signature(payload, signature):
    """验证 GitHub Webhook 签名（可选）"""
    if not SECRET:
        return True
    expected = 'sha256=' + hmac.new(
        SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def run_cmd(cmd, cwd=None):
    """执行命令并返回结果"""
    log(f'  执行: {cmd}')
    result = subprocess.run(
        cmd, shell=True, cwd=cwd or PROJECT_DIR,
        capture_output=True, text=True, timeout=120
    )
    if result.stdout:
        log(f'  stdout: {result.stdout.strip()}')
    if result.stderr:
        log(f'  stderr: {result.stderr.strip()}')
    return result.returncode == 0


class WebhookHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/webhook':
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get('Content-Length', 0))
        payload = self.rfile.read(content_length)

        # 验证签名（如果设置了 SECRET）
        signature = self.headers.get('X-Hub-Signature-256', '')
        if not verify_signature(payload, signature):
            log('❌ 签名验证失败')
            self.send_response(403)
            self.end_headers()
            return

        log('📨 收到 Push 事件')

        # 拉取最新代码
        log('📥 拉取最新代码...')
        if not run_cmd('git pull origin main'):
            log('❌ git pull 失败')
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b'git pull failed')
            return

        # 上传小程序
        log('📤 上传小程序...')
        if run_cmd('node deploy.js'):
            log('✅ 部署成功！')
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'deploy success')
        else:
            log('❌ 部署失败')
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b'deploy failed')

    def do_GET(self):
        """健康检查"""
        if self.path == '/health':
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'ok')
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        """静默默认日志"""
        pass


if __name__ == '__main__':
    server = http.server.HTTPServer(('0.0.0.0', PORT), WebhookHandler)
    log(f'🚀 Webhook 服务已启动，监听端口 {PORT}')
    log(f'📁 项目目录: {PROJECT_DIR}')
    log(f'🔗 Webhook 地址: http://0.0.0.0:{PORT}/webhook')
    log(f'💚 健康检查: http://0.0.0.0:{PORT}/health')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log('👋 服务已停止')
        server.server_close()
