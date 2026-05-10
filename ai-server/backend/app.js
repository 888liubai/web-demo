require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { Sequelize, DataTypes } = require('sequelize');
const mysql = require('mysql2/promise');

// ===================== 【核心修复】自动创建数据库（解决 Unknown database 'userdb' 报错）=====================
async function createDatabaseIfNotExists() {
    try {
        // 连接MySQL服务，不指定数据库
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '123456',
            port: 3306
        });
        // 自动创建数据库
        await connection.query(`CREATE DATABASE IF NOT EXISTS userDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await connection.end();
        console.log('✅ 数据库 userDB 自动创建/校验完成');
    } catch (error) {
        console.error('❌ 创建数据库失败:', error);
        process.exit(1);
    }
}

// ===================== MYSQL 连接（密码 123456）=====================
const sequelize = new Sequelize('userDB', 'root', '123456', {
    host: 'localhost',
    dialect: 'mysql',
    port: 3306
});

// ===================== 模型定义（完整保留你所有字段）=====================
const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, unique: true },
    password: DataTypes.STRING,
    nickname: DataTypes.STRING,
    avatar: DataTypes.STRING,
    role: { type: DataTypes.STRING, defaultValue: 'user' },
    status: { type: DataTypes.STRING, defaultValue: 'enable' },
    last_login_time: DataTypes.DATE,
}, { timestamps: true, createdAt: 'create_time', updatedAt: 'update_time' });

const Record = sequelize.define('Record', {
    user_id: DataTypes.INTEGER,
    input_content: DataTypes.TEXT,
    result_content: DataTypes.TEXT,
    summary: DataTypes.TEXT,
    record_status: { type: DataTypes.STRING, defaultValue: 'normal' }
}, { timestamps: true, createdAt: 'create_time', updatedAt: false });

const QaRecord = sequelize.define('QaRecord', {
    user_id: DataTypes.INTEGER,
    question: DataTypes.TEXT,
    answer: DataTypes.TEXT,
    record_status: { type: DataTypes.STRING, defaultValue: 'normal' }
}, { timestamps: true, createdAt: 'create_time', updatedAt: false });

const SystemConfig = sequelize.define('SystemConfig', {
    config_key: DataTypes.STRING,
    config_value: DataTypes.TEXT,
    description: DataTypes.TEXT
}, { timestamps: false });

const AuditLog = sequelize.define('AuditLog', {
    user_id: DataTypes.INTEGER,
    operate_type: DataTypes.STRING,
    operate_content: DataTypes.TEXT,
    ip: DataTypes.STRING,
    result: DataTypes.STRING
}, { timestamps: true, createdAt: 'create_time', updatedAt: false });

const Log = sequelize.define('Log', {
    content: DataTypes.TEXT
}, { timestamps: true, createdAt: 'create_time', updatedAt: false });
// ===================== 轮播图模型（新增）=====================
const Carousel = sequelize.define('Carousel', {
    // 轮播图标题
    title: { type: DataTypes.STRING, allowNull: false },
    // 轮播图描述
    description: { type: DataTypes.TEXT },
    // 图片URL（支持网络图片/本地上传图片）
    image_url: { type: DataTypes.STRING, allowNull: false },
    // 标签（📚知识专栏/🎥视频专区）
    tag: { type: DataTypes.STRING, defaultValue: '📚 知识专栏' },
    // 跳转类型：knowledge=知识, video=视频
    type: { type: DataTypes.STRING, defaultValue: 'knowledge' },
    // 搜索关键词
    keyword: { type: DataTypes.STRING },
    // 排序（数字越小越靠前）
    sort: { type: DataTypes.INTEGER, defaultValue: 0 },
    // 状态：enable=启用, disable=禁用
    status: { type: DataTypes.STRING, defaultValue: 'enable' }
}, { timestamps: true, createdAt: 'create_time', updatedAt: 'update_time' });
// 关联关系
Record.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
QaRecord.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
AuditLog.belongsTo(User, { as: 'user', foreignKey: 'user_id' });

// 密码验证
User.prototype.validatePassword = function (pwd) {
    return this.password === pwd;
};

// ===================== 全局配置（完全不变）=====================
const CONFIG = {
    PORT: process.env.PORT || 3000,
    JWT_SECRET: process.env.JWT_SECRET || 'fallback_jwt_secret_only_for_dev',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
    INVITE_CODE: process.env.INVITE_CODE || '123456',
    FILE: {
        sizeLimit: 100 * 1024 * 1024,
        uploadDir: path.join(__dirname, 'uploads'),
        avatarDir: path.join(__dirname, 'uploads', 'avatar'),
        frontendDir: path.join(__dirname, '../frontend'),
        adminDir: path.join(__dirname, 'admin'),
        pythonScripts: {
            infer: path.join(__dirname, 'model', 'infer.py'),
            qwen: path.join(__dirname, 'model', 'Qwen.py')
        }
    },
    PYTHON: {
        envPath: process.env.PYTHON_PATH || 'python',
        timeout: 120000
    },
    DEFAULT_QWEN_URL: process.env.QWEN_API_URL || 'http://localhost:23333/generate',
    ERROR_CODE: {
        SUCCESS: 0,
        PARAM_ERROR: -1,
        SERVER_ERROR: 500,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403
    }
};

const app = express();

// ===================== 中间件（完全不变）=====================
app.use(cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));
app.use(bodyParser.json({ limit: CONFIG.FILE.sizeLimit }));
app.use(bodyParser.urlencoded({ extended: true, limit: CONFIG.FILE.sizeLimit }));

// ===================== 权限中间件（完全不变）=====================
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const tokenFromQuery = req.query.token;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (tokenFromQuery) {
        token = tokenFromQuery;
    }

    if (!token) {
        if (req.path === '/admin') return res.redirect('/frontend/login.html');
        return res.json({ code: CONFIG.ERROR_CODE.UNAUTHORIZED, msg: '未登录或Token无效' });
    }

    try {
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (req.path === '/admin') return res.redirect('/frontend/login.html');
        return res.json({ code: CONFIG.ERROR_CODE.UNAUTHORIZED, msg: 'Token已过期，请重新登录' });
    }
};

const adminOnlyMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        if (req.path === '/admin') return res.status(403).send('无权访问，需要管理员权限');
        return res.json({ code: CONFIG.ERROR_CODE.FORBIDDEN, msg: '无权访问，需要管理员权限' });
    }
    next();
};

const auditLogMiddleware = (operateType) => (req, res, next) => {
    const originalSend = res.send;
    let result = 'success';

    res.send = function (data) {
        originalSend.call(this, data);
        try {
            const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
            if (parsedData.code !== CONFIG.ERROR_CODE.SUCCESS) result = 'fail';
            if (req.user && req.user.role === 'admin') {
                AuditLog.create({
                    user_id: req.user.id,
                    operate_type: operateType,
                    operate_content: `${req.method} ${req.path} | 参数: ${JSON.stringify(req.body || req.query)}`,
                    ip: req.ip,
                    result: result
                }).catch(e => console.error('记录审计日志失败:', e));
            }
        } catch (e) {
            console.error('记录审计日志失败:', e);
        }
    };
    next();
};

// ===================== 系统初始化（完全不变）=====================
let systemConfigCache = {};

async function initSystem() {
    try {
        // 先自动创建数据库
        await createDatabaseIfNotExists();

        await sequelize.authenticate();
        console.log('✅ MySQL 数据库连接成功');

        await sequelize.sync({ alter: true });
        console.log('✅ 数据库表结构同步完成');

        // 【修改】默认管理员密码改为 123456
        const [admin, created] = await User.findOrCreate({
            where: { username: 'admin' },
            defaults: {
                password: '123456',
                nickname: '超级管理员',
                role: 'admin'
            }
        });
        created ? console.log('✅ 默认管理员创建成功: admin / 123456') : console.log('✅ 管理员账号已存在');

        const defaultConfigs = [
            { key: 'qwen_api_url', value: CONFIG.DEFAULT_QWEN_URL, desc: 'Qwen模型服务地址' },
            { key: 'enable_register', value: 'true', desc: '是否开放用户注册' },
            { key: 'enable_user_delete', value: 'false', desc: '是否允许用户删除记录' },
            { key: 'data_retention_days', value: '365', desc: '数据保留天数' }
        ];
        for (const cfg of defaultConfigs) {
            await SystemConfig.findOrCreate({
                where: { config_key: cfg.key },
                defaults: { config_value: cfg.value, description: cfg.desc }
            });
        }

        const configs = await SystemConfig.findAll();
        configs.forEach(c => systemConfigCache[c.config_key] = c.config_value);
        console.log('✅ 系统配置加载完成');

    } catch (err) {
        console.error('❌ 系统初始化失败:', err);
        process.exit(1);
    }
}
initSystem();

// ===================== 工具函数（完全不变）=====================
function getMockRecognitionResult(fileType, disease = '水稻稻曲病', rate = 92) {
    const result = `模拟识别结果：${fileType} 文件识别为${disease}（置信度${rate}%）`;
    const summary = `${result} | 建议使用对应农药防治，遵循绿色防控原则`;
    return { result, summary };
}
function getMockQAAnswer(recognizeResult, question) {
    return `基于识别结果：${recognizeResult || '未知病害'}，针对问题"${question}"的专业解答：
1. 病害特征：该病害主要危害水稻叶片和茎秆，发病初期出现褐色斑点，后期扩大为不规则病斑。
2. 防治方法：农业防治+化学防治+生物防治结合。
3. 注意事项：施药时注意天气条件，严格遵守农药安全间隔期。`;
}

// ===================== 路由页面（完全 100% 保留你原版）=====================
app.get('/admin', (req, res) => {
    const adminPagePath = path.join(CONFIG.FILE.adminDir, 'index.html');
    if (!fs.existsSync(adminPagePath)) {
        return res.status(404).send(`后台页面文件不存在，请检查路径: ${adminPagePath}`);
    }
    res.sendFile(adminPagePath);
});
// ===================== 轮播图公共接口（新增）=====================
// 获取所有启用的轮播图（前端首页调用）
app.get('/api/carousel/list', async (req, res) => {
    try {
        const list = await Carousel.findAll({
            where: { status: 'enable' },
            order: [['sort', 'ASC'], ['create_time', 'DESC']]
        });
        res.json({ code: 0, data: list });
    } catch (err) {
        res.json({ code: 500, msg: '获取轮播图失败：' + err.message });
    }
});
// ===================== 管理员-轮播图管理（新增）=====================
// 获取所有轮播图（管理员后台）
app.get('/api/admin/carousel', authMiddleware, adminOnlyMiddleware, async (req, res) => {
    const list = await Carousel.findAll({ order: [['sort', 'ASC']] });
    res.json({ code: 0, data: list });
});

// 添加轮播图
app.post('/api/admin/carousel/add', authMiddleware, adminOnlyMiddleware, async (req, res) => {
    try {
        await Carousel.create(req.body);
        res.json({ code: 0, msg: '添加成功' });
    } catch (err) {
        res.json({ code: 500, msg: '添加失败：' + err.message });
    }
});

// 修改轮播图
app.post('/api/admin/carousel/update', authMiddleware, adminOnlyMiddleware, async (req, res) => {
    try {
        await Carousel.update(req.body, { where: { id: req.body.id } });
        res.json({ code: 0, msg: '修改成功' });
    } catch (err) {
        res.json({ code: 500, msg: '修改失败：' + err.message });
    }
});

// 删除轮播图
app.post('/api/admin/carousel/delete', authMiddleware, adminOnlyMiddleware, async (req, res) => {
    try {
        await Carousel.destroy({ where: { id: req.body.id } });
        res.json({ code: 0, msg: '删除成功' });
    } catch (err) {
        res.json({ code: 500, msg: '删除失败：' + err.message });
    }
});
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>智能识别系统 - 后端服务</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background-color: #f7f9fc; padding: 40px; color: #2c3e50; }
        .container { max-width: 900px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        h1 { font-size: 28px; margin-bottom: 30px; display: flex; align-items: center; gap: 12px; color: #1a202c; }
        .status-badge { display: inline-flex; align-items: center; gap: 6px; background-color: #d4edda; color: #155724; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: 600; }
        .section { margin-bottom: 25px; }
        .section-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #4a5568; display: flex; align-items: center; gap: 8px; }
        .link-group { display: flex; flex-direction: column; gap: 10px; }
        .nav-link { color: #3182ce; text-decoration: none; font-size: 16px; transition: color 0.2s; display: inline-flex; align-items: center; gap: 8px; }
        .nav-link:hover { color: #2b6cb0; text-decoration: underline; }
        .info-item { font-size: 15px; padding: 10px 0; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; }
        .info-item:last-child { border-bottom: none; }
        .info-label { color: #718096; }
        .info-value { font-weight: 500; color: #2d3748; }
        .warning { background: #fff3cd; color: '#856404'; padding: 15px; border-radius: 8px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1><span class="status-badge">✅ 运行中</span>智能识别系统后端服务</h1>
        <div class="section">
            <div class="section-title">📄 页面导航</div>
            <div class="link-group">
                <a href="/frontend/login.html" class="nav-link">1️⃣ 登录/注册页面</a>
                <a href="/frontend/index.html" class="nav-link">2️⃣ 系统主页面（普通用户）</a>
                <a href="/admin" class="nav-link" style="color: #e53e3e;">🔐 后台管理页面（仅管理员 admin）</a>
            </div>
        </div>
        <div class="section">
            <div class="section-title">⚙️ 系统状态</div>
            <div class="info-item">
                <span class="info-label">数据库状态</span>
                <span class="info-value">已连接</span>
            </div>
            <div class="info-item">
                <span class="info-label">默认管理员账号</span>
                <span class="info-value">admin / 123456</span>
            </div>
        </div>
        <div class="warning">
            <strong>⚠️ 重要提示：</strong><br>
            1. 关闭浏览器后登录态自动失效，下次打开必须重新登录<br>
            2. 前端清空记录仅清除页面展示，不会删除后端数据<br>
            3. 仅管理员可在后台管理页面操作/删除数据
        </div>
    </div>
</body>
</html>
  `);
});

// ===================== 下面所有路由 100% 完全保留你原版 =====================
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, inviteCode } = req.body;
        if (!username || !password || !inviteCode) return res.json({ code: -1, msg: '请填写完整信息' });
        if (inviteCode !== CONFIG.INVITE_CODE) return res.json({ code: -1, msg: '邀请码错误' });
        if (systemConfigCache.enable_register !== 'true') return res.json({ code: -1, msg: '注册功能已关闭' });

        const exists = await User.findOne({ where: { username } });
        if (exists) return res.json({ code: -1, msg: '用户名已存在' });

        await User.create({ username, password, nickname: username, role: 'user' });
        res.json({ code: 0, msg: '注册成功' });
    } catch (err) {
        res.json({ code: 500, msg: '注册失败: ' + err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.json({ code: -1, msg: '请填写账号密码' });

        const user = await User.findOne({ where: { username } });
        if (!user) return res.json({ code: -1, msg: '用户不存在' });
        if (user.status === 'disabled') return res.json({ code: -1, msg: '账号已被禁用' });

        const isPwdValid = await user.validatePassword(password);
        if (!isPwdValid) return res.json({ code: -1, msg: '密码错误' });

        user.last_login_time = new Date();
        await user.save();

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            CONFIG.JWT_SECRET,
            { expiresIn: CONFIG.JWT_EXPIRES_IN }
        );

        res.json({ code: 0, msg: '登录成功', data: { token, user: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, role: user.role } } });
    } catch (err) {
        console.error('❌ 登录接口异常:', err);
        res.json({ code: 500, msg: '登录失败: ' + err.message });
    }
});

app.use('/api/user', authMiddleware);
app.get('/api/user/info', async (req, res) => {
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'username', 'nickname', 'avatar', 'role'] });
    res.json({ code: 0, data: user });
});
app.post('/api/user/updateNickname', async (req, res) => {
    await User.update({ nickname: req.body.nickname }, { where: { id: req.user.id } });
    res.json({ code: 0, msg: '更新成功' });
});
app.post('/api/user/changePassword', async (req, res) => {
    const user = await User.findByPk(req.user.id);
    const isValid = await user.validatePassword(req.body.oldPassword);
    if (!isValid) return res.json({ code: -1, msg: '原密码错误' });
    user.password = req.body.newPassword;
    await user.save();
    res.json({ code: 0, msg: '密码修改成功' });
});
app.get('/api/user/records', async (req, res) => {
    const records = await Record.findAll({ where: { user_id: req.user.id, record_status: 'normal' }, order: [['create_time', 'DESC']] });
    res.json({ code: 0, data: records });
});
app.get('/api/user/qa', async (req, res) => {
    const records = await QaRecord.findAll({ where: { user_id: req.user.id, record_status: 'normal' }, order: [['create_time', 'DESC']] });
    res.json({ code: 0, data: records });
});
app.post('/api/user/records/delete', async (req, res) => {
    try {
        const { clearAll } = req.body;
        if (clearAll) {
            await Record.update({ record_status: 'deleted' }, { where: { user_id: req.user.id, record_status: 'normal' } });
        }
        res.json({ code: 0, msg: '记录已清空' });
    } catch (err) {
        res.json({ code: 500, msg: '清空失败: ' + err.message });
    }
});
app.post('/api/user/qa/delete', async (req, res) => {
    try {
        const { clearAll } = req.body;
        if (clearAll) {
            await QaRecord.update({ record_status: 'deleted' }, { where: { user_id: req.user.id, record_status: 'normal' } });
        }
        res.json({ code: 0, msg: '记录已清空' });
    } catch (err) {
        res.json({ code: 500, msg: '清空失败: ' + err.message });
    }
});

app.use('/api/admin', authMiddleware, adminOnlyMiddleware);
app.get('/api/admin/users', async (req, res) => {
    const users = await User.findAll({ order: [['create_time', 'DESC']] });
    res.json({ code: 0, data: users });
});
app.post('/api/admin/users/create', auditLogMiddleware('create'), async (req, res) => {
    await User.create(req.body);
    res.json({ code: 0, msg: '创建成功' });
});
app.post('/api/admin/users/update', auditLogMiddleware('update'), async (req, res) => {
    await User.update(req.body, { where: { id: req.body.id } });
    res.json({ code: 0, msg: '更新成功' });
});
app.post('/api/admin/users/resetPwd', auditLogMiddleware('update'), async (req, res) => {
    const user = await User.findByPk(req.body.id);
    user.password = '123456';
    await user.save();
    res.json({ code: 0, msg: '密码已重置为 123456' });
});
app.post('/api/admin/users/delete', auditLogMiddleware('delete'), async (req, res) => {
    await User.destroy({ where: { id: req.body.id } });
    res.json({ code: 0, msg: '用户已删除' });
});
app.get('/api/admin/records', async (req, res) => {
    const records = await Record.findAll({ include: [{ model: User, as: 'user', attributes: ['username', 'nickname'] }], order: [['create_time', 'DESC']] });
    res.json({ code: 0, data: records });
});
app.post('/api/admin/records/delete', auditLogMiddleware('delete'), async (req, res) => {
    await Record.destroy({ where: { id: req.body.id } });
    res.json({ code: 0, msg: '记录已永久删除' });
});
app.post('/api/admin/records/restore', auditLogMiddleware('update'), async (req, res) => {
    await Record.update({ record_status: 'normal' }, { where: { id: req.body.id } });
    res.json({ code: 0, msg: '记录已恢复' });
});
app.get('/api/admin/qa', async (req, res) => {
    const records = await QaRecord.findAll({ include: [{ model: User, as: 'user', attributes: ['username', 'nickname'] }], order: [['create_time', 'DESC']] });
    res.json({ code: 0, data: records });
});
app.post('/api/admin/qa/delete', auditLogMiddleware('delete'), async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.json({ code: -1, msg: '缺少记录ID' });
        await QaRecord.destroy({ where: { id } });
        res.json({ code: 0, msg: '问答记录已永久删除' });
    } catch (err) {
        res.json({ code: 500, msg: '删除失败: ' + err.message });
    }
});
app.get('/api/admin/config', async (req, res) => {
    const configs = await SystemConfig.findAll();
    res.json({ code: 0, data: configs });
});
app.post('/api/admin/config/save', auditLogMiddleware('update'), async (req, res) => {
    const { config_key, config_value } = req.body;
    await SystemConfig.update({ config_value }, { where: { config_key } });
    systemConfigCache[config_key] = config_value;
    res.json({ code: 0, msg: '配置已更新' });
});
app.get('/api/admin/audit', async (req, res) => {
    const logs = await AuditLog.findAll({ include: [{ model: User, as: 'user', attributes: ['username'] }], order: [['create_time', 'DESC']] });
    res.json({ code: 0, data: logs });
});

app.post('/api/ai/recognize', authMiddleware, async (req, res) => {
    try {
        const { fileType, mediaUrl } = req.body;
        if (!fileType) return res.json({ code: CONFIG.ERROR_CODE.PARAM_ERROR, msg: '缺少文件类型' });

        const mockResult = getMockRecognitionResult(fileType);
        await Record.create({ user_id: req.user.id, input_content: mediaUrl, result_content: mockResult.result, summary: mockResult.summary });
        res.json({ code: 0, msg: '识别完成', data: mockResult });
    } catch (err) {
        res.json({ code: 500, msg: '识别接口异常：' + err.message });
    }
});
app.post('/api/ask_rice', authMiddleware, async (req, res) => {
    try {
        const { recognizeResult, question } = req.body;
        if (!question?.trim()) return res.json({ code: -1, msg: '请输入有效的问题！' });

        const mockAnswer = getMockQAAnswer(recognizeResult, question);
        await QaRecord.create({ user_id: req.user.id, question, answer: mockAnswer });
        res.json({ code: 0, msg: '问答成功', answer: mockAnswer });
    } catch (err) {
        res.json({ code: 500, msg: '问答接口异常：' + err.message });
    }
});

if (!fs.existsSync(CONFIG.FILE.uploadDir)) fs.mkdirSync(CONFIG.FILE.uploadDir, { recursive: true });
if (!fs.existsSync(CONFIG.FILE.avatarDir)) fs.mkdirSync(CONFIG.FILE.avatarDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, file.fieldname === 'avatar' ? CONFIG.FILE.avatarDir : CONFIG.FILE.uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: CONFIG.FILE.sizeLimit } });

app.use('/uploads', express.static(CONFIG.FILE.uploadDir));
app.post('/api/upload/image', upload.single('image'), (req, res) => {
    if (!req.file) return res.json({ code: -1, msg: '请上传图片' });
    res.json({ code: 0, data: { url: `/uploads/${req.file.filename}` } });
});
app.post('/api/upload/video', upload.single('video'), (req, res) => {
    if (!req.file) return res.json({ code: -1, msg: '请上传视频' });
    res.json({ code: 0, data: { url: `/uploads/${req.file.filename}` } });
});
app.post('/api/upload/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    if (!req.file) return res.json({ code: -1, msg: '请上传头像' });
    const avatarUrl = `/uploads/avatar/${req.file.filename}`;
    await User.update({ avatar: avatarUrl }, { where: { id: req.user.id } });
    res.json({ code: 0, msg: '头像更新成功', data: { url: avatarUrl } });
});

app.get('/api/getRecognitionRecords', authMiddleware, async (req, res) => {
    const where = req.user.role === 'admin' ? {} : { user_id: req.user.id, record_status: 'normal' };
    const records = await Record.findAll({ where, order: [['create_time', 'DESC']] });
    res.json({ code: 0, data: records });
});
app.get('/api/getQARecords', authMiddleware, async (req, res) => {
    const where = req.user.role === 'admin' ? {} : { user_id: req.user.id, record_status: 'normal' };
    const records = await QaRecord.findAll({ where, order: [['create_time', 'DESC']] });
    res.json({ code: 0, data: records });
});
app.get('/api/getLogs', authMiddleware, async (req, res) => {
    const logs = await Log.findAll({ order: [['create_time', 'DESC']] });
    res.json({ code: 0, data: logs });
});

fs.existsSync(CONFIG.FILE.frontendDir)
    ? (app.use('/frontend', express.static(CONFIG.FILE.frontendDir)), console.log('📂 前端目录托管成功'))
    : console.log('❌ 前端目录不存在');
app.use('/backend', express.static(__dirname));

app.listen(CONFIG.PORT, () => {
    console.log(`\n🚀 智能识别系统后端服务已启动，端口：${CONFIG.PORT}`);
    console.log(`🌐 后端服务页地址：http://localhost:${CONFIG.PORT}`);
    console.log(`🔐 登录页面地址：http://localhost:${CONFIG.PORT}/frontend/login.html`);
    console.log(`🏠 系统主页面地址：http://localhost:${CONFIG.PORT}/frontend/index.html`);
    console.log(`🔧 后台管理页面：http://localhost:${CONFIG.PORT}/admin (仅 admin)`);
    console.log(`👤 默认管理员账号：admin / 123456\n`);
});

process.on('uncaughtException', (err) => console.error('未捕获的异常：', err));
process.on('unhandledRejection', (reason) => console.error('未处理的Promise拒绝：', reason));