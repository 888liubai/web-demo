const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ========== 【强制修正】数据库配置（用你已有的 ai_system_db） ==========
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '123456', // 你的MySQL密码
  database: 'ai_system_db', // 绝对固定为你创建的库名，不再用ai_recognition
  charset: 'utf8mb4'
};

// 创建数据库连接池
const db = mysql.createPool(dbConfig).promise();

// 测试数据库连接（启动时就验证）
(async () => {
  try {
    await db.query('SELECT 1');
    console.log('✅ MySQL 数据库连接成功！使用数据库：ai_system_db');
  } catch (err) {
    console.error('❌ 数据库连接失败：', err.message);
    process.exit(1);
  }
})();

// 基础中间件
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ========== 【双保险】静态文件托管（彻底解决页面找不到） ==========
// 1. 优先托管 frontend 目录（你的页面在这里）
const frontendPath = path.join(__dirname, '../frontend');
console.log('📂 frontend 目录路径：', frontendPath);
// 2. 兜底托管 backend 自身目录（把页面复制到这里也能访问）
console.log('📂 backend 兜底目录：', __dirname);

// 同时托管两个目录，确保能找到页面
app.use(express.static(frontendPath));
app.use(express.static(__dirname));

// 验证目录是否存在
if (fs.existsSync(frontendPath)) {
  const files = fs.readdirSync(frontendPath);
  console.log('📁 frontend 目录内的文件：', files);
} else {
  console.error('❌ frontend 目录不存在！请检查路径');
}

// ========== 【兜底路由】直接返回页面，100%能访问 ==========
// 兜底登录页
app.get('/login.html', (req, res) => {
  const loginPath = path.join(frontendPath, 'login.html');
  if (fs.existsSync(loginPath)) {
    res.sendFile(loginPath);
  } else {
    res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>智能识别系统 - 登录/注册</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: "Microsoft YaHei", sans-serif; }
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .form-box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            width: 400px;
        }
        .tab-switch { display: flex; justify-content: center; margin-bottom: 20px; }
        .tab-btn {
            padding: 8px 20px;
            border: none;
            background: transparent;
            font-size: 16px;
            cursor: pointer;
            color: #666;
        }
        .tab-btn.active {
            color: #667eea;
            font-weight: bold;
            border-bottom: 2px solid #667eea;
        }
        .form-title {
            text-align: center;
            margin-bottom: 30px;
            color: #333;
            font-size: 24px;
        }
        .form-item { margin-bottom: 20px; }
        .form-item label {
            display: block;
            margin-bottom: 8px;
            color: #666;
        }
        .form-item input {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
        }
        .submit-btn {
            width: 100%;
            padding: 12px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.3s;
        }
        .submit-btn:hover { background: #5a6edb; }
        .tip-text {
            color: red;
            text-align: center;
            margin-bottom: 15px;
            display: none;
        }
        .success-text {
            color: green;
            text-align: center;
            margin-bottom: 15px;
            display: none;
        }
    </style>
</head>
<body>
<div class="form-box">
    <div class="tab-switch">
        <button class="tab-btn active" id="loginTab">登录</button>
        <button class="tab-btn" id="registerTab">注册</button>
    </div>

    <div id="loginForm">
        <h2 class="form-title">🤖 智能识别系统 - 登录</h2>
        <div class="tip-text" id="loginError">账号或密码错误</div>
        <div class="form-item">
            <label for="loginUsername">用户名</label>
            <input type="text" id="loginUsername" placeholder="请输入用户名">
        </div>
        <div class="form-item">
            <label for="loginPassword">密码</label>
            <input type="password" id="loginPassword" placeholder="请输入密码">
        </div>
        <button class="submit-btn" id="loginBtn">登录系统</button>
    </div>

    <div id="registerForm" style="display: none;">
        <h2 class="form-title">🤖 智能识别系统 - 注册</h2>
        <div class="tip-text" id="registerError">注册失败提示</div>
        <div class="success-text" id="registerSuccess">注册成功提示</div>
        <div class="form-item">
            <label for="regUsername">用户名</label>
            <input type="text" id="regUsername" placeholder="请输入用户名（唯一）">
        </div>
        <div class="form-item">
            <label for="regPassword">密码</label>
            <input type="password" id="regPassword" placeholder="请输入密码">
        </div>
        <div class="form-item">
            <label for="regInviteCode">邀请码（必填）</label>
            <input type="text" id="regInviteCode" placeholder="请输入注册邀请码">
        </div>
        <button class="submit-btn" id="registerBtn">提交注册</button>
    </div>
</div>

<script>
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    loginTab.addEventListener('click', () => {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        document.getElementById('loginError').style.display = 'none';
        document.getElementById('registerError').style.display = 'none';
        document.getElementById('registerSuccess').style.display = 'none';
    });

    registerTab.addEventListener('click', () => {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerForm.style.display = 'block';
        loginForm.style.display = 'none';
        document.getElementById('loginError').style.display = 'none';
        document.getElementById('registerError').style.display = 'none';
        document.getElementById('registerSuccess').style.display = 'none';
    });

    const registerBtn = document.getElementById('registerBtn');
    const regUsername = document.getElementById('regUsername');
    const regPassword = document.getElementById('regPassword');
    const regInviteCode = document.getElementById('regInviteCode');
    const registerError = document.getElementById('registerError');
    const registerSuccess = document.getElementById('registerSuccess');

    registerBtn.addEventListener('click', async () => {
        const username = regUsername.value.trim();
        const password = regPassword.value.trim();
        const inviteCode = regInviteCode.value.trim();

        if (!username || !password || !inviteCode) {
            registerError.textContent = '请填写所有必填项！';
            registerError.style.display = 'block';
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, inviteCode })
            });

            const result = await response.json();
            if (result.code === 0) {
                registerSuccess.textContent = result.msg;
                registerSuccess.style.display = 'block';
                registerError.style.display = 'none';
                regUsername.value = '';
                regPassword.value = '';
                regInviteCode.value = '';
                setTimeout(() => loginTab.click(), 3000);
            } else {
                registerError.textContent = result.msg;
                registerError.style.display = 'block';
                registerSuccess.style.display = 'none';
            }
        } catch (err) {
            registerError.textContent = '注册失败：请检查后端服务是否启动！';
            registerError.style.display = 'block';
            registerSuccess.style.display = 'none';
        }
    });

    const loginBtn = document.getElementById('loginBtn');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');

    loginBtn.addEventListener('click', async () => {
        const username = loginUsername.value.trim();
        const password = loginPassword.value.trim();

        if (!username || !password) {
            loginError.textContent = '请填写用户名和密码！';
            loginError.style.display = 'block';
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();
            if (result.code === 0) {
                loginError.style.display = 'none';
                localStorage.setItem('isLogin', 'true');
                localStorage.setItem('username', result.data.username);
                alert('登录成功！即将跳转到主页面');
                window.location.href = 'index.html';
            } else {
                loginError.textContent = result.msg;
                loginError.style.display = 'block';
            }
        } catch (err) {
            loginError.textContent = '登录失败：请检查后端服务是否启动！';
            loginError.style.display = 'block';
        }
    });
</script>
</body>
</html>
    `);
  }
});

// 兜底主页面
app.get('/index.html', (req, res) => {
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>智能识别系统 - 主页面</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: "Microsoft YaHei", sans-serif; }
    body { background-color: #f0f2f6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header {
        background: #667eea;
        color: white;
        padding: 15px 20px;
        border-radius: 8px 8px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .logout-btn {
        padding: 8px 15px;
        background: white;
        color: #667eea;
        border: none;
        border-radius: 5px;
        cursor: pointer;
    }
    .tab-nav {
        display: flex;
        background: white;
        border-bottom: 1px solid #eee;
    }
    .tab-item {
        padding: 15px 25px;
        cursor: pointer;
        border-bottom: 3px solid transparent;
        transition: all 0.2s;
    }
    .tab-item.active {
        border-bottom-color: #667eea;
        color: #667eea;
        font-weight: bold;
    }
    .tab-content {
        background: white;
        padding: 20px;
        min-height: 500px;
        border-radius: 0 0 8px 8px;
    }
    .tab-panel {
        display: none;
    }
    .tab-panel.active {
        display: block;
    }
</style>
<body>
<div class="container">
    <div class="header">
        <h2>智能识别系统</h2>
        <button class="logout-btn" id="logoutBtn">退出登录</button>
    </div>

    <div class="tab-nav">
        <div class="tab-item active" data-tab="camera">摄像头功能</div>
        <div class="tab-item" data-tab="file">文件上传</div>
        <div class="tab-item" data-tab="recognition">AI识别</div>
        <div class="tab-item" data-tab="history">历史记录</div>
    </div>

    <div class="tab-content">
        <div class="tab-panel active" id="cameraPanel">
            <h3>摄像头功能模块</h3>
            <p>摄像头功能正常加载</p>
        </div>
        <div class="tab-panel" id="filePanel">
            <h3>文件上传模块</h3>
            <p>文件上传功能正常加载</p>
        </div>
        <div class="tab-panel" id="recognitionPanel">
            <h3>AI识别模块</h3>
            <p>AI识别功能正常加载</p>
        </div>
        <div class="tab-panel" id="historyPanel">
            <h3>历史记录模块</h3>
            <p>历史记录功能正常加载</p>
        </div>
    </div>
</div>

<script>
    // 退出登录
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('isLogin');
        window.location.href = 'login.html';
    });

    // 标签切换
    const tabItems = document.querySelectorAll('.tab-item');
    const tabPanels = document.querySelectorAll('.tab-panel');
    tabItems.forEach(item => {
        item.addEventListener('click', () => {
            tabItems.forEach(ti => ti.classList.remove('active'));
            tabPanels.forEach(tp => tp.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(item.dataset.tab + 'Panel').classList.add('active');
        });
    });

    // 登录校验
    window.onload = () => {
        if (localStorage.getItem('isLogin') !== 'true') {
            alert('请先登录！');
            window.location.href = 'login.html';
        }
    };
</script>
</body>
</html>
    `);
  }
});

// 根路径兜底
app.get('/', (req, res) => {
  res.send(`
    <h1>✅ 智能识别系统服务正常运行</h1>
    <p>📄 <a href="/login.html">登录/注册页面</a></p>
    <p>📄 <a href="/index.html">系统主页面</a></p>
    <p>🔌 <a href="/api/getLogs">接口测试（查询日志）</a></p>
  `);
});

// ========== 注册/登录接口 ==========
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, inviteCode } = req.body;
    if (!username || !password || !inviteCode) {
      return res.json({ code: -1, msg: '请填写所有必填项！' });
    }
    if (inviteCode !== '123456') {
      return res.json({ code: -1, msg: '邀请码错误！' });
    }
    const [existing] = await db.query('SELECT * FROM sys_user WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.json({ code: -1, msg: '用户名已存在！' });
    }
    const encryptedPwd = bcrypt.hashSync(password, 10);
    await db.query('INSERT INTO sys_user (username, password, invite_code) VALUES (?, ?, ?)',
        [username, encryptedPwd, inviteCode]);
    res.json({ code: 0, msg: '注册成功！请登录' });
  } catch (err) {
    res.json({ code: -1, msg: '注册失败：' + err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ code: -1, msg: '请填写账号密码！' });
    }
    const [users] = await db.query('SELECT * FROM sys_user WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.json({ code: -1, msg: '用户名不存在！' });
    }
    const isPwdOk = bcrypt.compareSync(password, users[0].password);
    if (!isPwdOk) {
      return res.json({ code: -1, msg: '密码错误！' });
    }
    res.json({ code: 0, msg: '登录成功！', data: { username } });
  } catch (err) {
    res.json({ code: -1, msg: '登录失败：' + err.message });
  }
});

// ========== 业务接口 ==========
app.post('/api/addLog', async (req, res) => {
  try {
    const { content } = req.body;
    const [result] = await db.query('INSERT INTO operation_logs (content) VALUES (?)', [content]);
    res.json({ code: 200, msg: '日志添加成功', logId: result.insertId });
  } catch (err) {
    res.json({ code: 500, msg: '日志添加失败', error: err.message });
  }
});

app.get('/api/getLogs', async (req, res) => {
  try {
    const [logs] = await db.query('SELECT * FROM operation_logs ORDER BY create_time DESC');
    res.json({ code: 200, data: logs });
  } catch (err) {
    res.json({ code: 500, msg: '查询日志失败', error: err.message });
  }
});

app.post('/api/addResult', async (req, res) => {
  try {
    const { media_type, resnet_result, audio_result, ai_summary, local_summary } = req.body;
    const sql = `INSERT INTO recog_results 
      (media_type, resnet_result, audio_result, ai_summary, local_summary) 
      VALUES (?, ?, ?, ?, ?)`;
    const [result] = await db.query(sql, [media_type, resnet_result, audio_result, ai_summary, local_summary]);
    res.json({ code: 200, msg: '结果保存成功', resultId: result.insertId });
  } catch (err) {
    res.json({ code: 500, msg: '结果保存失败', error: err.message });
  }
});

app.get('/api/getResults', async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM recog_results ORDER BY create_time DESC');
    res.json({ code: 200, data: results });
  } catch (err) {
    res.json({ code: 500, msg: '查询结果失败', error: err.message });
  }
});

// ========== 启动服务 ==========
app.listen(PORT, () => {
  console.log(`🚀 整合服务启动成功！`);
  console.log(`🌐 根地址：http://localhost:${PORT}`);
  console.log(`📄 登录页面：http://localhost:${PORT}/login.html`);
  console.log(`📄 主页面：http://localhost:${PORT}/index.html`);
  console.log(`🔌 接口示例：http://localhost:${PORT}/api/getLogs`);
});