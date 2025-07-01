#!/bin/bash

# 快速部署脚本 - 宝塔面板专用
# 一键部署用户管理系统

set -e

echo "🚀 用户管理系统 - 宝塔面板快速部署"
echo "=================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置变量
PROJECT_NAME="usersystem"
PROJECT_PATH="/www/wwwroot/${PROJECT_NAME}"
PORT="3001"

echo -e "${BLUE}📋 部署信息:${NC}"
echo "项目名称: $PROJECT_NAME"
echo "项目路径: $PROJECT_PATH"
echo "应用端口: $PORT"
echo ""

# 检查当前目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ 错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 1. 安装依赖
echo -e "${YELLOW}📦 安装项目依赖...${NC}"
npm install --production
echo -e "${GREEN}✅ 依赖安装完成${NC}"

# 2. 安装Prisma CLI
echo -e "${YELLOW}🔧 安装Prisma CLI...${NC}"
npm install -g prisma
echo -e "${GREEN}✅ Prisma CLI安装完成${NC}"

# 3. 生成Prisma客户端
echo -e "${YELLOW}🔧 生成Prisma客户端...${NC}"
npx prisma generate
echo -e "${GREEN}✅ Prisma客户端生成完成${NC}"

# 4. 检查环境变量
echo -e "${YELLOW}🔧 检查环境变量...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  已复制.env.example到.env${NC}"
        echo -e "${YELLOW}⚠️  请编辑.env文件配置数据库连接和JWT密钥${NC}"
        echo ""
        echo -e "${BLUE}📝 需要配置的内容:${NC}"
        echo "1. DATABASE_URL - 数据库连接字符串"
        echo "2. JWT_SECRET - JWT密钥（请修改为随机字符串）"
        echo "3. ALLOWED_ORIGINS - 允许的域名"
        echo ""
        read -p "是否现在编辑.env文件? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            nano .env
        fi
    else
        echo -e "${RED}❌ 错误: 未找到.env或.env.example文件${NC}"
        exit 1
    fi
fi

# 5. 数据库迁移
echo -e "${YELLOW}🗄️  数据库迁移...${NC}"
read -p "是否运行数据库迁移? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npx prisma migrate deploy
    echo -e "${GREEN}✅ 数据库迁移完成${NC}"
else
    echo -e "${YELLOW}⚠️  跳过数据库迁移${NC}"
fi

# 6. 启动应用
echo -e "${YELLOW}🚀 启动应用...${NC}"

# 检查PM2是否安装
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}📦 安装PM2...${NC}"
    npm install -g pm2
fi

# 检查是否已有PM2进程
if pm2 list | grep -q "$PROJECT_NAME"; then
    echo -e "${YELLOW}🔄 重启现有PM2进程...${NC}"
    pm2 restart $PROJECT_NAME
else
    echo -e "${YELLOW}🆕 创建新的PM2进程...${NC}"
    pm2 start npm --name $PROJECT_NAME -- start
fi

# 保存PM2配置
pm2 save

# 7. 检查应用状态
echo -e "${YELLOW}🔍 检查应用状态...${NC}"
sleep 3
pm2 status

# 8. 检查端口监听
echo -e "${YELLOW}🔍 检查端口监听...${NC}"
if netstat -tlnp | grep -q ":$PORT "; then
    echo -e "${GREEN}✅ 应用已成功启动在端口 $PORT${NC}"
else
    echo -e "${RED}❌ 应用启动失败，请检查日志${NC}"
    pm2 logs $PROJECT_NAME --lines 10
    exit 1
fi

# 9. 创建Nginx配置示例
echo -e "${YELLOW}🌐 创建Nginx配置示例...${NC}"
NGINX_CONFIG_EXAMPLE="nginx-config-example.conf"

cat > $NGINX_CONFIG_EXAMPLE << EOF
# Nginx配置示例
# 请将此配置复制到宝塔面板的网站配置中

server {
    listen 80;
    server_name your-domain.com; # 请替换为您的域名
    
    # 重定向到HTTPS
    return 301 https://\$server_name\$request_uri;
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
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://localhost:$PORT;
    }

    # 健康检查
    location /health {
        access_log off;
        return 200 "OK";
        add_header Content-Type text/plain;
    }
}
EOF

echo -e "${GREEN}✅ Nginx配置示例已创建: $NGINX_CONFIG_EXAMPLE${NC}"

# 10. 部署完成
echo ""
echo -e "${GREEN}🎉 部署完成！${NC}"
echo ""
echo -e "${BLUE}📋 部署信息:${NC}"
echo "项目路径: $(pwd)"
echo "应用端口: $PORT"
echo "PM2进程名: $PROJECT_NAME"
echo ""
echo -e "${BLUE}🔗 访问地址:${NC}"
echo "本地访问: http://localhost:$PORT"
echo "管理后台: http://localhost:$PORT/admin"
echo "用户门户: http://localhost:$PORT/portal"
echo "登录页面: http://localhost:$PORT/login"
echo "健康检查: http://localhost:$PORT/health"
echo ""
echo -e "${BLUE}📝 常用命令:${NC}"
echo "查看应用状态: pm2 status"
echo "查看应用日志: pm2 logs $PROJECT_NAME"
echo "重启应用: pm2 restart $PROJECT_NAME"
echo "停止应用: pm2 stop $PROJECT_NAME"
echo ""
echo -e "${YELLOW}⚠️  下一步操作:${NC}"
echo "1. 在宝塔面板中添加网站"
echo "2. 配置域名和SSL证书"
echo "3. 将 $NGINX_CONFIG_EXAMPLE 的内容复制到网站配置中"
echo "4. 修改域名配置并重启Nginx"
echo ""
echo -e "${GREEN}🚀 快速部署脚本执行完成！${NC}" 