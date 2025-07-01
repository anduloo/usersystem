# 部署指南

本文档详细介绍如何部署用户管理系统到生产环境。

## 🚀 部署方式

### 方式一：Docker部署（推荐）

#### 1. 创建Dockerfile

在项目根目录创建 `Dockerfile`：

```dockerfile
# 使用官方Node.js镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 安装Prisma CLI
RUN npm install -g prisma

# 生成Prisma客户端
RUN npx prisma generate

# 暴露端口
EXPOSE 3001

# 启动命令
CMD ["npm", "start"]
```

#### 2. 创建docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/usersystem?schema=public
      - JWT_SECRET=your-super-secret-jwt-key-here
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=usersystem
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

volumes:
  postgres_data:
```

#### 3. 部署命令

```bash
# 构建并启动
docker-compose up -d

# 运行数据库迁移
docker-compose exec app npx prisma migrate deploy

# 查看日志
docker-compose logs -f app
```

### 方式二：传统部署

#### 1. 服务器准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# 安装Nginx
sudo apt install nginx -y

# 安装PM2
sudo npm install -g pm2
```

#### 2. 数据库设置

```bash
# 切换到postgres用户
sudo -u postgres psql

# 创建数据库和用户
CREATE DATABASE usersystem;
CREATE USER usersystem_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE usersystem TO usersystem_user;
\q
```

#### 3. 应用部署

```bash
# 克隆项目
git clone https://github.com/anduloo/usersystem.git
cd usersystem/server

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑.env文件

# 生成Prisma客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate deploy

# 使用PM2启动应用
pm2 start npm --name "usersystem" -- start
pm2 save
pm2 startup
```

#### 4. Nginx配置

创建 `/etc/nginx/sites-available/usersystem`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL配置
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

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
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/usersystem /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 方式三：云平台部署

#### Vercel部署

1. 连接GitHub仓库
2. 配置环境变量
3. 设置构建命令：`npm install && npx prisma generate`
4. 设置输出目录：`.` (当前目录)

#### Railway部署

1. 连接GitHub仓库
2. 配置环境变量
3. 自动部署

## 🔧 环境变量配置

### 必需变量

```bash
# 数据库连接
DATABASE_URL="postgresql://username:password@host:port/database?schema=public"

# JWT密钥
JWT_SECRET="your-super-secret-jwt-key-here"

# 环境
NODE_ENV="production"
```

### 可选变量

```bash
# 服务器端口
PORT=3001

# 日志级别
LOG_LEVEL="info"

# CORS允许的域名
ALLOWED_ORIGINS="https://your-domain.com,https://app.your-domain.com"
```

## 🔒 安全配置

### 1. SSL证书

使用Let's Encrypt免费证书：

```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo crontab -e
# 添加：0 12 * * * /usr/bin/certbot renew --quiet
```

### 2. 防火墙配置

```bash
# 配置UFW
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 3. 数据库安全

```bash
# 配置PostgreSQL
sudo nano /etc/postgresql/15/main/postgresql.conf
# 修改：listen_addresses = 'localhost'

sudo nano /etc/postgresql/15/main/pg_hba.conf
# 只允许本地连接
```

## 📊 监控和日志

### 1. PM2监控

```bash
# 查看应用状态
pm2 status

# 查看日志
pm2 logs usersystem

# 监控面板
pm2 monit
```

### 2. 日志管理

```bash
# 配置日志轮转
sudo nano /etc/logrotate.d/usersystem

# 内容：
/var/log/usersystem/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
}
```

### 3. 性能监控

```bash
# 安装监控工具
npm install -g clinic

# 性能分析
clinic doctor -- node app.js
```

## 🔄 更新部署

### 1. 自动更新脚本

创建 `deploy.sh`：

```bash
#!/bin/bash

# 拉取最新代码
git pull origin main

# 安装依赖
npm install

# 生成Prisma客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate deploy

# 重启应用
pm2 restart usersystem

echo "部署完成！"
```

### 2. GitHub Actions

创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Deploy to server
      uses: appleboy/ssh-action@v0.1.4
      with:
        host: ${{ secrets.HOST }}
        username: ${{ secrets.USERNAME }}
        key: ${{ secrets.KEY }}
        script: |
          cd /path/to/usersystem/server
          ./deploy.sh
```

## 🚨 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查DATABASE_URL配置
   - 确认数据库服务运行状态
   - 检查防火墙设置

2. **应用无法启动**
   - 检查端口是否被占用
   - 查看错误日志
   - 确认环境变量配置

3. **CORS错误**
   - 检查ALLOWED_ORIGINS配置
   - 确认客户端域名在允许列表中

4. **性能问题**
   - 检查数据库索引
   - 优化查询语句
   - 增加服务器资源

### 日志查看

```bash
# 应用日志
pm2 logs usersystem

# Nginx日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# 系统日志
sudo journalctl -u nginx -f
```

## 📈 性能优化

### 1. 数据库优化

```sql
-- 创建索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX idx_access_logs_user_id ON access_logs(user_id);

-- 定期清理日志
DELETE FROM login_logs WHERE created_at < NOW() - INTERVAL '90 days';
DELETE FROM access_logs WHERE created_at < NOW() - INTERVAL '90 days';
```

### 2. 应用优化

```javascript
// 启用压缩
app.use(compression());

// 设置缓存
app.use(express.static('public', {
  maxAge: '1y',
  etag: true
}));

// 连接池配置
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 3. 服务器优化

```bash
# 增加文件描述符限制
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# 优化内核参数
echo "net.core.somaxconn = 65535" >> /etc/sysctl.conf
echo "net.ipv4.tcp_max_syn_backlog = 65535" >> /etc/sysctl.conf
sysctl -p
```

## 📞 技术支持

如果在部署过程中遇到问题，请：

1. 查看日志文件
2. 检查配置是否正确
3. 提交Issue到GitHub
4. 联系技术支持

---

祝您部署顺利！🎉 