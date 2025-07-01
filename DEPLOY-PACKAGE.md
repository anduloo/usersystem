# 部署包说明

## 📦 部署包内容

本部署包包含完整的用户管理系统后端，专为宝塔面板优化。

### 文件结构
```
server/
├── src/                    # 源代码
│   ├── controllers/        # 控制器
│   ├── routes/            # 路由
│   ├── middlewares/       # 中间件
│   └── index.js           # 主入口文件
├── prisma/                # 数据库配置
│   ├── schema.prisma      # 数据库模式
│   └── migrations/        # 数据库迁移
├── views/                 # EJS模板
│   ├── admin.ejs          # 管理后台
│   ├── portal.ejs         # 用户门户
│   └── login.ejs          # 登录页面
├── css/                   # 样式文件
│   ├── admin.css          # 管理后台样式
│   ├── portal.css         # 用户门户样式
│   └── login.css          # 登录页面样式
├── public/                # 静态资源
│   └── js/                # JavaScript文件
│       ├── sso-sdk.js     # SSO客户端SDK
│       └── *.html         # 示例页面
├── scripts/               # 部署脚本
│   ├── quick-deploy.sh    # 快速部署脚本
│   ├── baota-deploy.sh    # 完整部署脚本
│   ├── baota-setup.sh     # 环境准备脚本
│   ├── baota-nginx.conf   # Nginx配置模板
│   └── baota-install.md   # 详细安装说明
├── package.json           # 项目配置
├── .env.example           # 环境变量示例
├── README.md              # 项目说明
├── DEPLOYMENT.md          # 通用部署指南
├── BAOTA-DEPLOY.md        # 宝塔面板部署指南
└── DEPLOY-PACKAGE.md      # 本文件
```

## 🚀 快速部署步骤

### 1. 上传部署包

1. **登录宝塔面板**
   - 访问：`http://your-server-ip:8888`

2. **创建项目目录**
   - 进入文件管理器
   - 导航到 `/www/wwwroot/`
   - 创建 `usersystem` 文件夹

3. **上传文件**
   - 将整个 `server` 目录内容上传到 `/www/wwwroot/usersystem/`
   - 确保保持目录结构完整

### 2. 运行快速部署

```bash
# SSH连接到服务器
ssh root@your-server-ip

# 进入项目目录
cd /www/wwwroot/usersystem

# 运行快速部署脚本
bash scripts/quick-deploy.sh
```

### 3. 配置网站

1. **添加网站**
   - 在宝塔面板中进入"网站"管理
   - 点击"添加站点"
   - 填写域名（如：your-domain.com）
   - 选择PHP版本：纯静态

2. **配置SSL证书**
   - 在网站设置中申请SSL证书
   - 开启"强制HTTPS"

3. **配置Nginx**
   - 在网站设置中找到"配置文件"
   - 将 `scripts/baota-nginx.conf` 的内容复制进去
   - 修改域名配置
   - 保存并重启Nginx

## 🔧 环境变量配置

部署脚本会自动创建 `.env` 文件，您需要编辑以下配置：

```bash
# 数据库配置
DATABASE_URL="postgresql://usersystem_user:usersystem_password_2024@localhost:5432/usersystem?schema=public"

# JWT密钥（请修改为随机字符串）
JWT_SECRET="your-super-secret-jwt-key-here-change-this-in-production"

# 服务器配置
PORT=3001
NODE_ENV=production

# CORS配置（替换为您的域名）
ALLOWED_ORIGINS="https://your-domain.com,https://www.your-domain.com"
```

## 📊 部署验证

部署完成后，可以通过以下方式验证：

### 1. 检查应用状态
```bash
pm2 status
```

### 2. 检查端口监听
```bash
netstat -tlnp | grep 3001
```

### 3. 访问健康检查
```
http://localhost:3001/health
```

### 4. 访问应用页面
- 管理后台：`http://localhost:3001/admin`
- 用户门户：`http://localhost:3001/portal`
- 登录页面：`http://localhost:3001/login`

## 🔄 更新部署

### 代码更新流程

1. **备份当前版本**
   ```bash
   cp -r /www/wwwroot/usersystem /www/wwwroot/usersystem_backup_$(date +%Y%m%d)
   ```

2. **上传新代码**
   - 替换 `/www/wwwroot/usersystem/` 目录内容

3. **更新依赖**
   ```bash
   cd /www/wwwroot/usersystem
   npm install --production
   ```

4. **运行数据库迁移**
   ```bash
   npx prisma migrate deploy
   ```

5. **重启应用**
   ```bash
   pm2 restart usersystem
   ```

## 🚨 常见问题

### 1. 权限问题
```bash
# 设置正确的文件权限
chown -R www-data:www-data /www/wwwroot/usersystem
chmod -R 755 /www/wwwroot/usersystem
```

### 2. 端口占用
```bash
# 检查端口占用
netstat -tlnp | grep 3001

# 如果端口被占用，可以修改.env文件中的PORT
```

### 3. 数据库连接失败
```bash
# 检查PostgreSQL状态
systemctl status postgresql

# 测试数据库连接
psql -h localhost -U usersystem_user -d usersystem
```

### 4. Nginx配置错误
```bash
# 检查Nginx配置
nginx -t

# 查看Nginx错误日志
tail -f /www/wwwlogs/your-domain.com.error.log
```

## 📞 技术支持

如果在部署过程中遇到问题：

1. **查看日志**
   ```bash
   pm2 logs usersystem
   tail -f /www/wwwlogs/your-domain.com.error.log
   ```

2. **检查配置**
   - 确认 `.env` 文件配置正确
   - 确认Nginx配置正确
   - 确认数据库连接正常

3. **重启服务**
   ```bash
   pm2 restart usersystem
   nginx -s reload
   ```

4. **提交Issue**
   - 如果问题无法解决，请提交Issue到GitHub项目

## 🎉 部署完成

部署完成后，您可以通过以下地址访问：

- **管理后台**: https://your-domain.com/admin
- **用户门户**: https://your-domain.com/portal
- **登录页面**: https://your-domain.com/login
- **健康检查**: https://your-domain.com/health

## 📝 注意事项

1. **安全配置**
   - 请修改JWT_SECRET为随机字符串
   - 配置正确的CORS域名
   - 启用HTTPS

2. **性能优化**
   - 配置静态文件缓存
   - 启用Gzip压缩
   - 监控应用性能

3. **备份策略**
   - 定期备份数据库
   - 备份应用代码
   - 备份配置文件

---

祝您部署顺利！🚀 