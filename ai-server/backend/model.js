// model.js（新建的文件，专门放数据模型）
const mongoose = require('mongoose');

// 连接数据库
mongoose.connect('mongodb://localhost:27017/userDB')
    .then(() => console.log('数据库连接成功'))
    .catch(err => console.log('数据库连接失败', err));

// 定义数据结构
const userSchema = new mongoose.Schema({
    name: String,
    age: Number,
    email: String
});

// 导出数据模型（供主文件使用）
module.exports = mongoose.model('User', userSchema);