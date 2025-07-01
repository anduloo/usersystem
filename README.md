# 用户管理系统后端 (User Management System Backend)

一个基于Node.js + Express + Prisma + PostgreSQL的完整用户管理系统后端，支持单点登录(SSO)、用户管理、项目管理、权限控制和操作日志等功能。

## 🚀 功能特性

### 核心功能
- ✅ **用户认证系统** - 完整的登录/注册/登出功能
- ✅ **单点登录(SSO)** - 支持跨域和远程服务器集成
- ✅ **用户管理** - 用户CRUD、角色管理、状态控制
- ✅ **项目管理** - 项目创建、编辑、删除
- ✅ **权限控制** - 细粒度的项目访问权限管理
- ✅ **操作日志** - 完整的操作审计日志
- ✅ **登录日志** - 用户登录记录和地理位置追踪
- ✅ **访问日志** - 项目访问记录和统计

### 技术特性
- 🔐 **JWT认证** - 安全的Token认证机制
- 🌐 **CORS支持** - 完整的跨域资源共享配置
- 📊 **数据统计** - Dashboard数据概览和图表
- 🔍 **搜索功能** - 用户和日志的搜索过滤
- 📄 **分页支持** - 所有列表页面的分页功能
- 🎨 **现代UI** - 响应式设计和美观的界面
- 📱 **移动适配** - 支持移动端访问

## 📁 项目结构

```
server/
├── src/                 # 源代码
│   ├── controllers/     # 控制器
│   │   ├── authController.js
│   │   ├── userController.js
│   │   └── projectController.js
│   ├── routes/          # 路由
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   └── projectRoutes.js
│   ├── middlewares/     # 中间件
│   │   └── authMiddleware.js
│   ├── utils/           # 工具函数
│   └── index.js         # 主入口文件
├── prisma/              # 数据库配置
│   ├── schema.prisma    # 数据库模式
│   └── migrations/      # 数据库迁移
├── views/               # EJS模板
│   ├── admin.ejs        # 管理后台
│   ├── portal.ejs       # 用户门户
│   └── login.ejs        # 登录页面
├── css/                 # 样式文件
│   ├── admin.css        # 管理后台样式
│   ├── portal.css       # 用户门户样式
│   └── login.css        # 登录页面样式
├── public/              # 静态资源
│   └── js/              # JavaScript文件
│       ├── sso-sdk.js   # SSO客户端SDK
│       └── *.html       # 示例页面
└── package.json         # 项目配置
```

## 🛠️ 技术栈

### 后端
- **Node.js** - JavaScript运行时
- **Express.js** - Web应用框架
- **Prisma** - 数据库ORM
- **PostgreSQL** - 关系型数据库
- **JWT** - JSON Web Token认证
- **bcrypt** - 密码加密
- **cors** - 跨域资源共享

### 前端
- **EJS** - 模板引擎
- **CSS3** - 样式设计
- **JavaScript** - 客户端脚本
- **Font Awesome** - 图标库

## 🚀 快速开始

### 1. 环境要求
- Node.js 16+
- PostgreSQL 12+
- npm 或 yarn

### 2. 克隆项目
```bash
git clone https://github.com/anduloo/usersystem.git
cd usersystem/server
```

### 3. 安装依赖
```bash
npm install

# 安装Prisma CLI
npm install -g prisma
```

### 4. 配置环境变量
```bash
# 复制环境变量示例文件
cp .env.example .env

# 编辑.env文件，配置数据库连接和JWT密钥
DATABASE_URL="postgresql://username:password@localhost:5432/usersystem?schema=public"
JWT_SECRET="your-super-secret-jwt-key-here"
```

### 5. 数据库设置
```bash
# 生成Prisma客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate dev

# 可选：查看数据库
npx prisma studio
```

### 6. 启动服务器
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 7. 访问应用
- 管理后台: http://localhost:3001/admin
- 用户门户: http://localhost:3001/portal
- 登录页面: http://localhost:3001/login

## 📖 使用指南

### 管理员功能
1. **Dashboard** - 查看系统概览和统计数据
2. **用户管理** - 管理用户账户、角色和权限
3. **项目管理** - 创建和管理项目
4. **操作日志** - 查看管理员操作记录
5. **登录日志** - 查看用户登录记录
6. **访问日志** - 查看项目访问记录

### 用户功能
1. **登录/注册** - 用户认证
2. **项目访问** - 查看有权限的项目
3. **个人信息** - 管理个人资料

### SSO集成
系统提供了完整的SSO SDK，支持：
- 远程服务器集成
- 跨域调用
- 项目权限验证
- 事件监听

详细集成文档请参考：`public/js/README.md`

## 🔧 配置说明

### 数据库配置
```sql
-- 主要数据表
users           -- 用户表
projects        -- 项目表
user_projects   -- 用户项目关联表
admin_logs      -- 管理员操作日志
login_logs      -- 用户登录日志
access_logs     -- 项目访问日志
```

### CORS配置
系统已配置支持跨域访问，可在 `src/index.js` 中修改允许的域名：

```javascript
const allowedOrigins = [
  'http://localhost:3000',
  'https://your-domain.com',
  'https://client-app.com'
];
```

### JWT配置
- Token过期时间：24小时
- 刷新机制：自动处理
- 安全存储：localStorage

## 📊 API文档

### 认证相关
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/logout` - 用户登出
- `GET /api/users/me` - 获取当前用户信息

### 用户管理
- `GET /api/users` - 获取用户列表
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户
- `PATCH /api/users/:id/activate` - 激活用户
- `PATCH /api/users/:id/deactivate` - 禁用用户

### 项目管理
- `GET /api/projects` - 获取项目列表
- `POST /api/projects` - 创建项目
- `PUT /api/projects/:id` - 更新项目
- `DELETE /api/projects/:id` - 删除项目
- `POST /api/projects/assign` - 分配项目权限
- `POST /api/projects/revoke` - 撤销项目权限

### 日志查询
- `GET /api/users/admin-logs` - 管理员操作日志
- `GET /api/users/admin/user-login-logs` - 用户登录日志
- `GET /api/users/admin/user-project-access-logs` - 项目访问日志

## 🔒 安全特性

- **密码加密** - 使用bcrypt加密存储
- **JWT认证** - 安全的Token机制
- **CORS保护** - 精确的跨域控制
- **输入验证** - 完整的参数验证
- **SQL注入防护** - 使用Prisma ORM
- **XSS防护** - 输出转义和CSP

## 🚀 部署指南

### Docker部署
```bash
# 构建镜像
docker build -t usersystem .

# 运行容器
docker run -p 3001:3001 usersystem
```

### 传统部署
1. 配置Nginx反向代理
2. 使用PM2管理进程
3. 配置SSL证书
4. 设置环境变量

详细部署文档请参考：`DEPLOYMENT.md`

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📝 更新日志

### v1.0.0 (2025-7-1)
- ✅ 初始版本发布
- ✅ 完整的用户管理系统
- ✅ SSO功能实现
- ✅ 权限控制系统
- ✅ 日志审计功能
- ✅ 现代化UI设计
- ✅ 跨域支持
- ✅ 完整的文档

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 联系方式

- 项目地址: https://github.com/anduloo/usersystem
- 问题反馈: [Issues](https://github.com/anduloo/usersystem/issues)
- 功能建议: [Discussions](https://github.com/anduloo/usersystem/discussions)

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者和用户！

---

⭐ 如果这个项目对您有帮助，请给我们一个星标！ 
