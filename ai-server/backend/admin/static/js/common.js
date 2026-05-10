// 全局变量
const API_BASE = '/api';
let currentUser = null;

// 初始化：检查登录状态
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
        alert('未登录，请先登录');
        window.location.href = '/frontend/login.html'; // 跳转到前端登录页
        return;
    }

    try {
        currentUser = JSON.parse(userStr);
        // 如果不是管理员，禁止访问
        if (currentUser.role !== 'admin') {
            alert('无权访问管理后台');
            window.location.href = '/frontend/index.html';
            return;
        }
        initPage();
    } catch (e) {
        logout();
    }
});

// 统一请求封装
async function request(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const res = await fetch(`${API_BASE}${url}`, {
            ...options,
            headers
        });
        const data = await res.json();
        if (data.code === 401) {
            logout();
            return null;
        }
        return data;
    } catch (err) {
        console.error('请求失败:', err);
        alert('网络请求失败');
        return null;
    }
}

// 退出登录
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/frontend/login.html';
}

// 简单的日期格式化
function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
}

// 占位：每个页面自己实现 initPage
function initPage() {
    console.log('Page initialized');
}