#!/bin/bash

# 宝塔面板部署脚本
# 用户管理系统后端部署脚本

set -e

echo "🚀 开始部署用户管理系统到宝塔面板..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
PROJECT_NAME="usersystem"
PROJECT_PATH="/www/wwwroot/${PROJECT_NAME}"
NODE_VERSION="18"
PORT="3001"
PM2_NAME="usersystem"

# 检查是否以root权限运行
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}错误: 请不要使用root权限运行此脚本${NC}"
   exit 1
fi

echo -e "${BLUE}📋 部署配置信息:${NC}"
echo "项目名称: $PROJECT_NAME"
echo "项目路径: $PROJECT_PATH"
echo "Node.js版本: $NODE_VERSION"
echo "端口: $PORT"
echo "PM2进程名: $PM2_NAME"
echo ""

# 1. 检查Node.js版本
echo -e "${YELLOW}🔍 检查Node.js版本...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: 未安装Node.js，请在宝塔面板中安装Node.js $NODE_VERSION${NC}"
    exit 1
fi

NODE_CURRENT_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_CURRENT_VERSION" -lt "$NODE_VERSION" ]; then
    echo -e "${RED}错误: Node.js版本过低，当前版本: $(node -v)，需要版本: $NODE_VERSION+${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js版本检查通过: $(node -v)${NC}"

# 2. 检查PM2
echo -e "${YELLOW}🔍 检查PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}📦 安装PM2...${NC}"
    npm install -g pm2
fi

echo -e "${GREEN}✅ PM2已安装: $(pm2 -v)${NC}"

# 3. 创建项目目录
echo -e "${YELLOW}📁 创建项目目录...${NC}"
sudo mkdir -p $PROJECT_PATH
sudo chown -R $USER:$USER $PROJECT_PATH

# 4. 复制项目文件
echo -e "${YELLOW}📋 复制项目文件...${NC}"
cp -r . $PROJECT_PATH/
cd $PROJECT_PATH

# 5. 安装依赖
echo -e "${YELLOW}📦 安装项目依赖...${NC}"
npm install --production

# 6. 安装Prisma CLI
echo -e "${YELLOW}🔧 安装Prisma CLI...${NC}"
npm install -g prisma

# 7. 生成Prisma客户端
echo -e "${YELLOW}🔧 生成Prisma客户端...${NC}"
npx prisma generate

# 8. 检查环境变量文件
echo -e "${YELLOW}🔧 检查环境变量配置...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  已复制.env.example到.env，请编辑.env文件配置数据库连接和JWT密钥${NC}"
    else
        echo -e "${RED}错误: 未找到.env或.env.example文件${NC}"
        exit 1
    fi
fi

# 9. 运行数据库迁移
echo -e "${YELLOW}🗄️  运行数据库迁移...${NC}"
read -p "是否运行数据库迁移? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npx prisma migrate deploy
    echo -e "${GREEN}✅ 数据库迁移完成${NC}"
else
    echo -e "${YELLOW}⚠️  跳过数据库迁移${NC}"
fi

# 10. 启动应用
echo -e "${YELLOW}🚀 启动应用...${NC}"

# 检查是否已有PM2进程
if pm2 list | grep -q "$PM2_NAME"; then
    echo -e "${YELLOW}🔄 重启现有PM2进程...${NC}"
    pm2 restart $PM2_NAME
else
    echo -e "${YELLOW}🆕 创建新的PM2进程...${NC}"
    pm2 start npm --name $PM2_NAME -- start
fi

# 保存PM2配置
pm2 save

# 11. 设置开机自启
echo -e "${YELLOW}🔧 设置PM2开机自启...${NC}"
pm2 startup
echo -e "${YELLOW}⚠️  请运行上面输出的命令来设置开机自启${NC}"

# 12. 检查应用状态
echo -e "${YELLOW}🔍 检查应用状态...${NC}"
sleep 3
pm2 status

# 13. 检查端口监听
echo -e "${YELLOW}🔍 检查端口监听状态...${NC}"
if netstat -tlnp | grep -q ":$PORT "; then
    echo -e "${GREEN}✅ 应用已成功启动在端口 $PORT${NC}"
else
    echo -e "${RED}❌ 应用启动失败，请检查日志${NC}"
    pm2 logs $PM2_NAME --lines 20
    exit 1
fi

# 14. 创建Nginx配置
echo -e "${YELLOW}🌐 创建Nginx配置...${NC}"
NGINX_CONFIG="/www/server/panel/vhost/nginx/${PROJECT_NAME}.conf"

cat > $NGINX_CONFIG << EOF
server {
    listen 80;
    server_name your-domain.com; # 请替换为您的域名

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
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
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

echo -e "${GREEN}✅ Nginx配置文件已创建: $NGINX_CONFIG${NC}"
echo -e "${YELLOW}⚠️  请在宝塔面板中:${NC}"
echo "1. 进入网站管理"
echo "2. 添加站点或编辑现有站点"
echo "3. 配置域名和SSL证书"
echo "4. 重启Nginx服务"

# 15. 创建健康检查脚本
echo -e "${YELLOW}🔧 创建健康检查脚本...${NC}"
HEALTH_SCRIPT="$PROJECT_PATH/scripts/health-check.sh"

mkdir -p "$PROJECT_PATH/scripts"
cat > $HEALTH_SCRIPT << 'EOF'
#!/bin/bash
# 健康检查脚本

PROJECT_NAME="usersystem"
PORT="3001"

# 检查端口是否监听
if netstat -tlnp | grep -q ":$PORT "; then
    echo "✅ 应用运行正常"
    exit 0
else
    echo "❌ 应用未运行，尝试重启..."
    pm2 restart $PROJECT_NAME
    exit 1
fi
EOF

chmod +x $HEALTH_SCRIPT
echo -e "${GREEN}✅ 健康检查脚本已创建: $HEALTH_SCRIPT${NC}"

# 16. 创建日志目录
echo -e "${YELLOW}📝 创建日志目录...${NC}"
mkdir -p "$PROJECT_PATH/logs"
echo -e "${GREEN}✅ 日志目录已创建: $PROJECT_PATH/logs${NC}"

# 17. 部署完成
echo ""
echo -e "${GREEN}🎉 部署完成！${NC}"
echo ""
echo -e "${BLUE}📋 部署信息:${NC}"
echo "项目路径: $PROJECT_PATH"
echo "应用端口: $PORT"
echo "PM2进程名: $PM2_NAME"
echo "Nginx配置: $NGINX_CONFIG"
echo ""
echo -e "${BLUE}🔗 访问地址:${NC}"
echo "管理后台: http://your-domain.com/admin"
echo "用户门户: http://your-domain.com/portal"
echo "登录页面: http://your-domain.com/login"
echo ""
echo -e "${BLUE}📝 常用命令:${NC}"
echo "查看应用状态: pm2 status"
echo "查看应用日志: pm2 logs $PM2_NAME"
echo "重启应用: pm2 restart $PM2_NAME"
echo "停止应用: pm2 stop $PM2_NAME"
echo "健康检查: $HEALTH_SCRIPT"
echo ""
echo -e "${YELLOW}⚠️  重要提醒:${NC}"
echo "1. 请编辑 $PROJECT_PATH/.env 文件配置数据库连接"
echo "2. 在宝塔面板中配置域名和SSL证书"
echo "3. 重启Nginx服务使配置生效"
echo "4. 建议设置定时任务运行健康检查脚本"
echo ""
echo -e "${GREEN}🚀 部署脚本执行完成！${NC}" 