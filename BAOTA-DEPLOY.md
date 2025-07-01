# 宝塔面板部署指南

## 🚀 快速开始

### 方式一：一键部署（推荐）

1. **上传项目文件**
   - 将整个 `server` 目录内容上传到宝塔面板的 `/www/wwwroot/usersystem/` 目录

2. **运行快速部署脚本**
   ```bash
   cd /www/wwwroot/usersystem
   bash scripts/quick-deploy.sh
   ```

3. **配置网站**
   - 在宝塔面板中添加网站
   - 配置域名和SSL证书
   - 使用生成的 `nginx-config-example.conf` 配置Nginx

### 方式二：完整部署

1. **环境准备**
   ```bash
   # 上传环境准备脚本并运行
   sudo bash scripts/baota-setup.sh
   ```

2. **上传项目文件**
   - 将项目文件上传到 `/www/wwwroot/usersystem/`

3. **运行部署脚本**
   ```bash
   cd /www/wwwroot/usersystem
   bash scripts/baota-deploy.sh
   ```

## 📋 部署前检查清单

### 服务器要求
- [ ] 操作系统：CentOS 7+ / Ubuntu 18+ / Debian 9+
- [ ] 内存：最少 2GB，推荐 4GB+
- [ ] 磁盘：最少 20GB 可用空间
- [ ] 网络：公网IP，域名（推荐）

### 宝塔面板要求
- [ ] 宝塔面板版本：7.0+
- [ ] Nginx：1.18+
- [ ] Node.js：18.x
- [ ] PostgreSQL：12+

## 🔧 详细配置步骤

### 1. 环境变量配置

编辑 `.env` 文件：

```bash
# 数据库配置
DATABASE_URL="postgresql://usersystem_user:usersystem_password_2024@localhost:5432/usersystem?schema=public"

# JWT配置（请修改为随机字符串）
JWT_SECRET="your-super-secret-jwt-key-here-change-this-in-production"

# 服务器配置
PORT=3001
NODE_ENV=production

# CORS配置（替换为您的域名）
ALLOWED_ORIGINS="https://your-domain.com,https://www.your-domain.com"

# 日志配置
LOG_LEVEL=info
```

### 2. 数据库配置

如果使用环境准备脚本，数据库会自动创建：

```bash
# 数据库信息
数据库名: usersystem
用户名: usersystem_user
密码: usersystem_password_2024
连接字符串: postgresql://usersystem_user:usersystem_password_2024@localhost:5432/usersystem?schema=public
```

### 3. Nginx配置

在宝塔面板网站设置中，将配置文件替换为：

```nginx
server {
    listen 80;
    server_name your-domain.com; # 请替换为您的域名
    
    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com; # 请替换为您的域名

    # SSL证书配置（宝塔面板会自动配置）
    
    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 代理到Node.js应用
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://localhost:3001;
    }

    # 健康检查
    location /health {
        access_log off;
        return 200 "OK";
        add_header Content-Type text/plain;
    }
}
```

## 📊 监控和维护

### 应用监控

```bash
# 查看应用状态
pm2 status

# 查看应用日志
pm2 logs usersystem

# 监控面板
pm2 monit

# 重启应用
pm2 restart usersystem
```

### 系统监控

```bash
# 检查端口监听
netstat -tlnp | grep 3001

# 检查资源使用
htop
df -h
free -h
```

### 数据库监控

```bash
# 检查数据库连接
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"

# 检查数据库大小
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('usersystem'));"
```

## 🔄 更新部署

### 代码更新

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

### 配置更新

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

## 📁 文件说明

### 部署脚本
- `scripts/quick-deploy.sh` - 快速部署脚本
- `scripts/baota-deploy.sh` - 完整部署脚本
- `scripts/baota-setup.sh` - 环境准备脚本

### 配置文件
- `scripts/baota-nginx.conf` - Nginx配置模板
- `scripts/baota-install.md` - 详细安装说明

### 文档
- `README.md` - 项目说明文档
- `DEPLOYMENT.md` - 通用部署指南
- `BAOTA-DEPLOY.md` - 宝塔面板部署指南

---

祝您部署顺利！🚀 