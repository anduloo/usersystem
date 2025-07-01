# 权限控制系统说明

## 🔒 权限控制概述

本系统实现了基于角色的访问控制（RBAC），确保不同用户只能访问其权限范围内的功能和数据。

## 👥 用户角色

### 1. 超级管理员 (Super Admin)
- **标识**: `isSuperAdmin: true`
- **权限**: 系统最高权限，可以执行所有操作
- **功能**: 
  - 访问管理后台
  - 管理所有用户
  - 管理所有项目
  - 查看所有日志
  - 系统配置

### 2. 管理员 (Admin)
- **标识**: `role: 'admin'`
- **权限**: 管理权限，可以执行大部分管理操作
- **功能**:
  - 访问管理后台
  - 管理用户（除超级管理员外）
  - 管理项目
  - 查看日志
  - 数据统计

### 3. 普通用户 (User)
- **标识**: `role: 'user'`
- **权限**: 基本用户权限
- **功能**:
  - 访问应用门户
  - 查看分配的项目
  - 查看个人日志
  - 修改个人信息

## 🛡️ 权限控制实现

### 1. 中间件控制

#### authMiddleware
- **功能**: 验证用户登录状态
- **检查**: JWT Token 有效性
- **失败处理**: 返回 401 未授权

#### adminMiddleware
- **功能**: 验证管理员权限
- **检查**: 用户角色是否为 admin 或 isSuperAdmin
- **失败处理**: 
  - API请求: 返回 403 禁止访问
  - 页面请求: 重定向到登录页面

### 2. 路由权限控制

#### 公开路由
```
GET  /login          - 登录页面
GET  /register       - 注册页面
POST /api/auth/login - 登录接口
POST /api/auth/register - 注册接口
```

#### 需要登录的路由
```
GET  /portal                    - 应用门户页面
GET  /api/portal               - 门户数据接口
GET  /api/users/me             - 获取当前用户信息
GET  /api/projects             - 获取项目列表
GET  /api/users/login-logs     - 个人登录日志
GET  /api/users/project-access-logs - 个人项目访问日志
POST /api/users/visit-project  - 记录项目访问
POST /api/users/me/change-password - 修改密码
```

#### 需要管理员权限的路由
```
GET  /admin                           - 管理后台页面
GET  /api/users                       - 获取所有用户列表
GET  /api/users/:id/projects          - 获取用户项目
PUT  /api/users/:id                   - 更新用户信息
POST /api/users/:id/reset-password    - 重置用户密码
PATCH /api/users/:id/activate         - 启用用户
PATCH /api/users/:id/deactivate       - 禁用用户
PATCH /api/users/:id/set-admin        - 设为管理员
PATCH /api/users/:id/unset-admin      - 取消管理员
GET  /api/users/admin-logs            - 管理员操作日志
GET  /api/users/admin/user-login-logs - 所有用户登录日志
GET  /api/users/admin/user-project-access-logs - 所有用户项目访问日志
GET  /api/users/admin/dashboard-stats - 仪表盘统计
POST /api/projects                    - 创建项目
PUT  /api/projects/:id                - 更新项目
DELETE /api/projects/:id              - 删除项目
POST /api/projects/assign             - 分配项目
POST /api/projects/revoke             - 撤销项目
```

## 🎯 前端权限控制

### 1. 门户页面权限控制

#### 管理员用户
- 显示"后台管理系统"应用卡片
- 显示"应用门户"应用卡片
- 显示分配的项目

#### 普通用户
- 只显示"应用门户"应用卡片
- 显示分配的项目
- 不显示管理功能

### 2. 管理后台权限控制

- 只有管理员可以访问 `/admin` 页面
- 普通用户访问会被重定向到登录页面
- 所有管理功能都需要管理员权限

## 🔍 权限测试

### 运行权限测试
```bash
cd /www/wwwroot/usersystem
node scripts/test-permissions.js
```

### 测试内容
1. 管理员登录测试
2. 普通用户登录测试
3. 门户页面数据访问测试
4. 管理后台页面访问测试
5. 用户管理API测试
6. 项目管理API测试
7. 仪表盘API测试

### 预期结果
- 管理员: 可以访问所有功能
- 普通用户: 只能访问基本功能，管理功能返回403

## 🚨 安全注意事项

### 1. 前端安全
- 前端显示基于后端返回的数据
- 重要操作必须通过API验证权限
- 不要在前端存储敏感权限信息

### 2. 后端安全
- 所有敏感操作都经过中间件验证
- API接口严格检查用户权限
- 页面访问也需要权限验证

### 3. 数据安全
- 用户只能查看自己的数据
- 管理员可以查看所有数据
- 敏感操作记录日志

## 🔧 权限配置

### 修改用户权限
```javascript
// 设为管理员
await prisma.user.update({
  where: { id: userId },
  data: { role: 'admin' }
});

// 取消管理员
await prisma.user.update({
  where: { id: userId },
  data: { role: 'user' }
});

// 设为超级管理员
await prisma.user.update({
  where: { id: userId },
  data: { isSuperAdmin: true }
});
```

### 添加新的权限检查
```javascript
// 在路由中添加权限中间件
router.get('/api/sensitive-data', authMiddleware, adminMiddleware, handler);

// 在控制器中检查权限
if (req.user.role !== 'admin' && !req.user.isSuperAdmin) {
  return res.status(403).json({ message: '权限不足' });
}
```

## 📝 日志记录

### 权限相关日志
- 用户登录/登出
- 权限验证失败
- 敏感操作执行
- 管理员权限变更

### 日志查看
```bash
# 查看管理员操作日志
curl -H "Authorization: Bearer <admin_token>" \
  http://localhost:3001/api/users/admin-logs

# 查看用户登录日志
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/users/login-logs
```

---

通过以上权限控制机制，确保系统的安全性和数据的完整性。 