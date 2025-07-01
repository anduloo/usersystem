#!/bin/bash

# 宝塔面板环境准备脚本
# 用于在宝塔面板中安装和配置必要的软件

set -e

echo "🔧 开始准备宝塔面板环境..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查是否以root权限运行
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}错误: 此脚本需要root权限运行${NC}"
   exit 1
fi

echo -e "${BLUE}📋 环境准备清单:${NC}"
echo "1. 安装Node.js 18.x"
echo "2. 安装PM2进程管理器"
echo "3. 安装PostgreSQL数据库"
echo "4. 配置防火墙"
echo "5. 创建数据库用户"
echo ""

# 1. 更新系统包
echo -e "${YELLOW}📦 更新系统包...${NC}"
apt update && apt upgrade -y
echo -e "${GREEN}✅ 系统包更新完成${NC}"

# 2. 安装Node.js 18.x
echo -e "${YELLOW}📦 安装Node.js 18.x...${NC}"
if ! command -v node &> /dev/null; then
    # 添加NodeSource仓库
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    
    # 验证安装
    echo -e "${GREEN}✅ Node.js安装完成: $(node -v)${NC}"
    echo -e "${GREEN}✅ npm安装完成: $(npm -v)${NC}"
else
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt "18" ]; then
        echo -e "${YELLOW}⚠️  当前Node.js版本过低，正在升级...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
        echo -e "${GREEN}✅ Node.js升级完成: $(node -v)${NC}"
    else
        echo -e "${GREEN}✅ Node.js版本已满足要求: $(node -v)${NC}"
    fi
fi

# 3. 安装PM2
echo -e "${YELLOW}📦 安装PM2进程管理器...${NC}"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    echo -e "${GREEN}✅ PM2安装完成: $(pm2 -v)${NC}"
else
    echo -e "${GREEN}✅ PM2已安装: $(pm2 -v)${NC}"
fi

# 4. 安装PostgreSQL
echo -e "${YELLOW}📦 安装PostgreSQL数据库...${NC}"
if ! command -v psql &> /dev/null; then
    # 添加PostgreSQL官方仓库
    sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
    apt update
    
    # 安装PostgreSQL
    apt install -y postgresql postgresql-contrib
    
    # 启动并设置开机自启
    systemctl start postgresql
    systemctl enable postgresql
    
    echo -e "${GREEN}✅ PostgreSQL安装完成${NC}"
else
    echo -e "${GREEN}✅ PostgreSQL已安装${NC}"
fi

# 5. 配置PostgreSQL
echo -e "${YELLOW}🔧 配置PostgreSQL...${NC}"

# 切换到postgres用户创建数据库和用户
sudo -u postgres psql << EOF
-- 创建数据库
CREATE DATABASE usersystem;

-- 创建用户
CREATE USER usersystem_user WITH PASSWORD 'usersystem_password_2024';

-- 授权
GRANT ALL PRIVILEGES ON DATABASE usersystem TO usersystem_user;

-- 连接到usersystem数据库
\c usersystem

-- 授权schema权限
GRANT ALL ON SCHEMA public TO usersystem_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO usersystem_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO usersystem_user;

-- 设置默认权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO usersystem_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO usersystem_user;

\q
EOF

echo -e "${GREEN}✅ PostgreSQL配置完成${NC}"

# 6. 配置PostgreSQL远程访问（可选）
echo -e "${YELLOW}🔧 配置PostgreSQL远程访问...${NC}"
read -p "是否允许PostgreSQL远程访问? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # 修改postgresql.conf
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /etc/postgresql/*/main/postgresql.conf
    
    # 修改pg_hba.conf
    echo "host    all             all             0.0.0.0/0               md5" >> /etc/postgresql/*/main/pg_hba.conf
    
    # 重启PostgreSQL
    systemctl restart postgresql
    
    echo -e "${GREEN}✅ PostgreSQL远程访问已启用${NC}"
    echo -e "${YELLOW}⚠️  请确保防火墙允许5432端口${NC}"
else
    echo -e "${YELLOW}⚠️  跳过PostgreSQL远程访问配置${NC}"
fi

# 7. 配置防火墙
echo -e "${YELLOW}🔧 配置防火墙...${NC}"
if command -v ufw &> /dev/null; then
    # 允许SSH
    ufw allow ssh
    
    # 允许HTTP和HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # 允许应用端口
    ufw allow 3001/tcp
    
    # 如果启用了PostgreSQL远程访问
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ufw allow 5432/tcp
    fi
    
    # 启用防火墙
    ufw --force enable
    
    echo -e "${GREEN}✅ 防火墙配置完成${NC}"
else
    echo -e "${YELLOW}⚠️  UFW未安装，跳过防火墙配置${NC}"
fi

# 8. 创建项目目录
echo -e "${YELLOW}📁 创建项目目录...${NC}"
mkdir -p /www/wwwroot/usersystem
chown -R www-data:www-data /www/wwwroot/usersystem
echo -e "${GREEN}✅ 项目目录创建完成${NC}"

# 9. 创建环境变量示例文件
echo -e "${YELLOW}📝 创建环境变量示例文件...${NC}"
cat > /www/wwwroot/usersystem/.env.example << EOF
# 数据库配置
DATABASE_URL="postgresql://usersystem_user:usersystem_password_2024@localhost:5432/usersystem?schema=public"

# JWT配置
JWT_SECRET="your-super-secret-jwt-key-here-change-this-in-production"

# 服务器配置
PORT=3001
NODE_ENV=production

# CORS配置
ALLOWED_ORIGINS="https://your-domain.com,https://www.your-domain.com"

# 日志配置
LOG_LEVEL=info
EOF

echo -e "${GREEN}✅ 环境变量示例文件创建完成${NC}"

# 10. 创建系统服务文件
echo -e "${YELLOW}🔧 创建系统服务文件...${NC}"
cat > /etc/systemd/system/usersystem.service << EOF
[Unit]
Description=User Management System
After=network.target postgresql.service

[Service]
Type=forking
User=www-data
Group=www-data
WorkingDirectory=/www/wwwroot/usersystem
ExecStart=/usr/bin/pm2 start npm --name usersystem -- start
ExecReload=/usr/bin/pm2 reload usersystem
ExecStop=/usr/bin/pm2 stop usersystem
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 重新加载systemd
systemctl daemon-reload

echo -e "${GREEN}✅ 系统服务文件创建完成${NC}"

# 11. 创建日志轮转配置
echo -e "${YELLOW}📝 创建日志轮转配置...${NC}"
cat > /etc/logrotate.d/usersystem << EOF
/www/wwwroot/usersystem/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        /usr/bin/pm2 reloadLogs
    endscript
}
EOF

echo -e "${GREEN}✅ 日志轮转配置创建完成${NC}"

# 12. 创建监控脚本
echo -e "${YELLOW}🔧 创建监控脚本...${NC}"
mkdir -p /www/wwwroot/usersystem/scripts

cat > /www/wwwroot/usersystem/scripts/monitor.sh << 'EOF'
#!/bin/bash

# 监控脚本
PROJECT_NAME="usersystem"
PORT="3001"
LOG_FILE="/www/wwwroot/usersystem/logs/monitor.log"

# 记录日志
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> $LOG_FILE
}

# 检查应用状态
if ! netstat -tlnp | grep -q ":$PORT "; then
    log "应用未运行，尝试重启..."
    pm2 restart $PROJECT_NAME
    log "应用重启完成"
else
    log "应用运行正常"
fi

# 检查磁盘空间
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    log "警告: 磁盘使用率超过80%"
fi

# 检查内存使用
MEMORY_USAGE=$(free | awk 'NR==2{printf "%.2f", $3*100/$2}')
if (( $(echo "$MEMORY_USAGE > 80" | bc -l) )); then
    log "警告: 内存使用率超过80%"
fi
EOF

chmod +x /www/wwwroot/usersystem/scripts/monitor.sh
echo -e "${GREEN}✅ 监控脚本创建完成${NC}"

# 13. 设置定时任务
echo -e "${YELLOW}⏰ 设置定时任务...${NC}"
# 添加监控任务到crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /www/wwwroot/usersystem/scripts/monitor.sh") | crontab -

echo -e "${GREEN}✅ 定时任务设置完成${NC}"

# 14. 环境准备完成
echo ""
echo -e "${GREEN}🎉 宝塔面板环境准备完成！${NC}"
echo ""
echo -e "${BLUE}📋 环境信息:${NC}"
echo "Node.js版本: $(node -v)"
echo "npm版本: $(npm -v)"
echo "PM2版本: $(pm2 -v)"
echo "PostgreSQL版本: $(psql --version)"
echo ""
echo -e "${BLUE}📁 目录信息:${NC}"
echo "项目目录: /www/wwwroot/usersystem"
echo "环境变量示例: /www/wwwroot/usersystem/.env.example"
echo "监控脚本: /www/wwwroot/usersystem/scripts/monitor.sh"
echo ""
echo -e "${BLUE}🗄️  数据库信息:${NC}"
echo "数据库名: usersystem"
echo "用户名: usersystem_user"
echo "密码: usersystem_password_2024"
echo "连接字符串: postgresql://usersystem_user:usersystem_password_2024@localhost:5432/usersystem?schema=public"
echo ""
echo -e "${BLUE}🔧 服务信息:${NC}"
echo "系统服务: usersystem.service"
echo "防火墙状态: $(ufw status | head -1)"
echo "定时任务: 每5分钟执行一次监控"
echo ""
echo -e "${YELLOW}⚠️  下一步操作:${NC}"
echo "1. 上传项目文件到 /www/wwwroot/usersystem/"
echo "2. 编辑 .env 文件配置环境变量"
echo "3. 运行部署脚本: bash scripts/baota-deploy.sh"
echo "4. 在宝塔面板中配置网站和SSL证书"
echo ""
echo -e "${GREEN}🚀 环境准备脚本执行完成！${NC}" 