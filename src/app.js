const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const cookieParser = require('cookie-parser');

// 引入路由
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const projectRoutes = require('./routes/projectRoutes');
const configRoutes = require('./routes/configRoutes');
const wechatRoutes = require('./routes/wechatRoutes');

const app = express();

// 配置 EJS 模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// 配置CORS
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:8080',
      'https://your-domain.com',
      'https://*.your-domain.com',
      'https://client-app.com',
      'https://*.client-app.com'
    ];
    
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name'
  ],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
  maxAge: 86400
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 静态资源托管
const rootDir = path.resolve(__dirname, '../..');
app.use(express.static(rootDir));
app.use('/titie', express.static(path.join(rootDir, 'titie')));
app.use('/namecard', express.static(path.join(rootDir, 'namecard')));
app.use('/image', express.static(path.join(rootDir, 'image')));
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use('/js', express.static(path.join(__dirname, '../js')));
app.use('/fonts', express.static(path.join(__dirname, '../fonts')));
app.use('/components', express.static(path.join(__dirname, '../components')));
app.use(express.static(path.join(__dirname, '../public')));

// 首页
app.get('/', (req, res) => res.redirect('/login'));

// 路由
app.use('/', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/configs', configRoutes);
app.use('/api/wechat', wechatRoutes);

// 全局错误处理中间件
app.use((error, req, res, next) => {
  // 如果是API请求，返回JSON错误
  if (req.path.startsWith('/api/')) {
    return res.status(400).json({ 
      success: false, 
      message: '请求失败' 
    });
  }
  
  // 如果是页面请求，重定向到登录页
  return res.redirect('/login?error=系统错误，请重新登录');
});

// 404处理
app.use((req, res) => {
  // 如果是API请求，返回JSON错误
  if (req.path.startsWith('/api/')) {
    return res.status(400).json({ 
      success: false, 
      message: '接口不存在' 
    });
  }
  
  // 如果是页面请求，重定向到登录页
  return res.redirect('/login?error=页面不存在');
});

module.exports = app; 