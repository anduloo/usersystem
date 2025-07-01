# 宝塔面板部署指南

本文档详细介绍如何在宝塔面板中部署用户管理系统。

## 📋 部署前准备

### 1. 服务器要求
- **操作系统**: CentOS 7+ / Ubuntu 18+ / Debian 9+
- **内存**: 最少 2GB，推荐 4GB+
- **磁盘**: 最少 20GB 可用空间
- **网络**: 公网IP，域名（可选但推荐）

### 2. 宝塔面板要求
- **宝塔面板版本**: 7.0+
- **Nginx**: 1.18+
- **Node.js**: 18.x
- **PostgreSQL**: 12+

## 🚀 部署步骤

### 第一步：环境准备

1. **登录宝塔面板**
   ```bash
   # 在浏览器中访问宝塔面板
   http://your-server-ip:8888
   ```

2. **安装必要软件**
   - 进入"软件商店"
   - 安装以下软件：
     - Nginx 1.18+
     - Node.js 18.x
     - PostgreSQL 12+
     - PM2管理器

3. **运行环境准备脚本**
   ```bash
   # 上传环境准备脚本到服务器
   # 在SSH终端中执行
   sudo bash scripts/baota-setup.sh
   ```

### 第二步：上传项目文件

1. **创建项目目录**
   ```bash
   # 在宝塔面板文件管理器中
   # 进入 /www/wwwroot/
   # 创建 usersystem 文件夹
   ```

2. **上传项目文件**
   - 将整个 `server` 目录内容上传到 `/www/wwwroot/usersystem/`
   - 确保文件权限正确（www-data:www-data）

3. **设置文件权限**
   ```bash
   chown -R www-data:www-data /www/wwwroot/usersystem
   chmod -R 755 /www/wwwroot/usersystem
   ```

### 第三步：配置环境变量

1. **编辑环境变量文件**
   ```bash
   cd /www/wwwroot/usersystem
   cp .env.example .env
   nano .env
   ```

2. **配置数据库连接**
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

### 第四步：数据库初始化

1. **运行数据库迁移**
   ```bash
   cd /www/wwwroot/usersystem
   npx prisma migrate deploy
   ```

2. **验证数据库连接**
   ```bash
   npx prisma db pull
   ```

### 第五步：部署应用

1. **运行部署脚本**
   ```bash
   cd /www/wwwroot/usersystem
   bash scripts/baota-deploy.sh
   ```

2. **检查应用状态**
   ```bash
   pm2 status
   pm2 logs usersystem
   ```

### 第六步：配置网站

1. **添加网站**
   - 进入宝塔面板"网站"管理
   - 点击"添加站点"
   - 填写域名（如：your-domain.com）
   - 选择PHP版本：纯静态

2. **配置SSL证书**
   - 在网站设置中申请SSL证书
   - 开启"强制HTTPS"

3. **配置反向代理**
   - 在网站设置中找到"反向代理"
   - 添加代理：
     - 代理名称：usersystem
     - 目标URL：http://127.0.0.1:3001
     - 发送域名：$host

4. **配置Nginx**
   - 在网站设置中找到"配置文件"
   - 替换为 `scripts/baota-nginx.conf` 的内容
   - 修改域名配置
   - 保存并重启Nginx

## 🔧 配置说明

### Nginx配置要点

1. **代理设置**
   ```nginx
   location / {
       proxy_pass http://localhost:3001;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

2. **静态文件缓存**
   ```nginx
   location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
       expires 1y;
       add_header Cache-Control "public, immutable";
   }
   ```

3. **安全头设置**
   ```nginx
   add_header X-Frame-Options DENY;
   add_header X-Content-Type-Options nosniff;
   add_header X-XSS-Protection "1; mode=block";
   add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
   ```

### PM2配置

1. **启动应用**
   ```bash
   pm2 start npm --name usersystem -- start
   ```

2. **设置开机自启**
   ```bash
   pm2 save
   pm2 startup
   ```

3. **监控应用**
   ```bash
   pm2 monit
   ```

## 📊 监控和维护

### 1. 应用监控

- **PM2监控面板**
  ```bash
  pm2 monit
  ```

- **日志查看**
  ```bash
  pm2 logs usersystem
  pm2 logs usersystem --lines 100
  ```

### 2. 系统监控

- **资源使用**
  ```bash
  htop
  df -h
  free -h
  ```

- **端口监听**
  ```bash
  netstat -tlnp | grep 3001
  ```

### 3. 数据库监控

- **连接状态**
  ```bash
  sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
  ```

- **数据库大小**
  ```bash
  sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('usersystem'));"
  ```

## 🔄 更新部署

### 1. 代码更新

```bash
# 备份当前版本
cp -r /www/wwwroot/usersystem /www/wwwroot/usersystem_backup_$(date +%Y%m%d)

# 上传新代码
# 替换 /www/wwwroot/usersystem/ 目录内容

# 安装依赖
cd /www/wwwroot/usersystem
npm install --production

# 运行数据库迁移
npx prisma migrate deploy

# 重启应用
pm2 restart usersystem
```

### 2. 配置更新

```bash
# 更新环境变量
nano /www/wwwroot/usersystem/.env

# 重启应用
pm2 restart usersystem

# 重启Nginx
nginx -s reload
```

## 🚨 故障排除

### 常见问题

1. **应用无法启动**
   ```bash
   # 检查端口占用
   netstat -tlnp | grep 3001
   
   # 检查日志
   pm2 logs usersystem
   
   # 检查环境变量
   cat /www/wwwroot/usersystem/.env
   ```

2. **数据库连接失败**
   ```bash
   # 检查PostgreSQL状态
   systemctl status postgresql
   
   # 测试数据库连接
   psql -h localhost -U usersystem_user -d usersystem
   ```

3. **Nginx配置错误**
   ```bash
   # 检查Nginx配置
   nginx -t
   
   # 查看Nginx错误日志
   tail -f /www/wwwlogs/your-domain.com.error.log
   ```

4. **SSL证书问题**
   - 在宝塔面板中重新申请SSL证书
   - 检查域名解析是否正确
   - 确认防火墙允许443端口

### 日志位置

- **应用日志**: `/www/wwwroot/usersystem/logs/`
- **PM2日志**: `pm2 logs usersystem`
- **Nginx访问日志**: `/www/wwwlogs/your-domain.com.log`
- **Nginx错误日志**: `/www/wwwlogs/your-domain.com.error.log`
- **系统日志**: `/var/log/syslog`

## 📞 技术支持

如果在部署过程中遇到问题：

1. 查看相关日志文件
2. 检查配置文件是否正确
3. 确认所有服务状态
4. 提交Issue到GitHub项目

## 🎉 部署完成

部署完成后，您可以通过以下地址访问：

- **管理后台**: https://your-domain.com/admin
- **用户门户**: https://your-domain.com/portal
- **登录页面**: https://your-domain.com/login
- **健康检查**: https://your-domain.com/health

---

祝您部署顺利！🚀 