const express = require('express');
const path = require('path'); // 引入 path 模块
const cors = require('cors');
require('dotenv').config();
const cookieParser = require('cookie-parser');

// 引入我们的新路由
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes'); // 引入新路由
const projectRoutes = require('./routes/projectRoutes'); // 引入新路由

const app = express();

// 配置 EJS 模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views')); // 设置模板文件存放目录

// 配置CORS以支持远程调用
const corsOptions = {
  origin: function (origin, callback) {
    // 允许的域名列表
    const allowedOrigins = [
      'http://localhost:3000',           // 本地开发
      'http://localhost:3001',           // 本地开发
      'http://localhost:8080',           // 其他本地端口
      'http://127.0.0.1:3000',           // 本地IP
      'http://127.0.0.1:3001',           // 本地IP
      'http://127.0.0.1:8080',           // 本地IP
      // 生产环境域名（请根据实际情况修改）
      'https://your-domain.com',         // 生产域名
      'https://*.your-domain.com',       // 子域名
      'https://client-app.com',          // 客户端应用域名
      'https://*.client-app.com'         // 客户端子域名
    ];
    
    // 允许没有origin的请求（如移动应用、Postman等）
    if (!origin) return callback(null, true);
    
    // 检查origin是否在允许列表中
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // 开发环境允许所有来源
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        console.log('CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,                     // 允许携带凭证（cookies, authorization headers）
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // 允许的HTTP方法
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name'
  ], // 允许的请求头
  exposedHeaders: ['Content-Length', 'X-Requested-With'], // 暴露给客户端的响应头
  maxAge: 86400 // 预检请求缓存时间（秒）
};

app.use(cors(corsOptions));
app.use(express.json());
// 用于解析 POST 请求中 application/x-www-form-urlencoded 类型的数据
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 静态资源托管
const rootDir = path.resolve(__dirname, '../..');
app.use(express.static(rootDir)); // 允许直接访问根目录下的 html 文件
app.use('/titie', express.static(path.join(rootDir, 'titie')));
app.use('/namecard', express.static(path.join(rootDir, 'namecard')));
app.use('/image', express.static(path.join(rootDir, 'image')));
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => {
  res.send('用户管理系统后端服务已启动！');
});

// 为了避免路由冲突，我们将所有认证和页面渲染的路由都放在 authRoutes 中处理
// 并可以给它一个统一的前缀，或者直接挂载在根上
app.use('/', authRoutes); 

// API 路由
app.use('/api/users', userRoutes); 
app.use('/api/projects', projectRoutes); 

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`服务器正在 http://localhost:${PORT} 上运行`);
  console.log('CORS配置已启用，支持远程调用');
});

console.log('DATABASE_URL:', process.env.DATABASE_URL);