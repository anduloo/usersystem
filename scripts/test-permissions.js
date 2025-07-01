#!/usr/bin/env node

/**
 * 权限控制测试脚本
 * 用于验证普通用户和管理员的权限是否正确
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001';

// 测试用户数据
const testUsers = {
  admin: {
    email: 'admin@example.com',
    password: '123456'
  },
  user: {
    email: 'user@example.com', 
    password: '123456'
  }
};

async function login(email, password) {
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.token;
    } else {
      console.error(`登录失败: ${email}`);
      return null;
    }
  } catch (error) {
    console.error(`登录错误: ${error.message}`);
    return null;
  }
}

async function testEndpoint(url, token, description) {
  try {
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const response = await fetch(`${BASE_URL}${url}`, { headers });
    
    console.log(`${description}: ${response.status} ${response.statusText}`);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`  数据: ${JSON.stringify(data).substring(0, 100)}...`);
    }
    
    return response.status;
  } catch (error) {
    console.log(`${description}: 错误 - ${error.message}`);
    return 0;
  }
}

async function runTests() {
  console.log('🔍 开始权限控制测试...\n');
  
  // 1. 测试管理员登录
  console.log('1. 测试管理员登录');
  const adminToken = await login(testUsers.admin.email, testUsers.admin.password);
  if (adminToken) {
    console.log('   ✅ 管理员登录成功');
  } else {
    console.log('   ❌ 管理员登录失败');
    return;
  }
  
  // 2. 测试普通用户登录
  console.log('\n2. 测试普通用户登录');
  const userToken = await login(testUsers.user.email, testUsers.user.password);
  if (userToken) {
    console.log('   ✅ 普通用户登录成功');
  } else {
    console.log('   ❌ 普通用户登录失败');
    return;
  }
  
  // 3. 测试门户页面数据访问
  console.log('\n3. 测试门户页面数据访问');
  await testEndpoint('/api/portal', adminToken, '   管理员访问门户数据');
  await testEndpoint('/api/portal', userToken, '   普通用户访问门户数据');
  
  // 4. 测试管理后台页面访问
  console.log('\n4. 测试管理后台页面访问');
  await testEndpoint('/admin', adminToken, '   管理员访问管理后台');
  await testEndpoint('/admin', userToken, '   普通用户访问管理后台');
  
  // 5. 测试用户管理API
  console.log('\n5. 测试用户管理API');
  await testEndpoint('/api/users', adminToken, '   管理员获取用户列表');
  await testEndpoint('/api/users', userToken, '   普通用户获取用户列表');
  
  // 6. 测试项目管理API
  console.log('\n6. 测试项目管理API');
  await testEndpoint('/api/projects', adminToken, '   管理员获取项目列表');
  await testEndpoint('/api/projects', userToken, '   普通用户获取项目列表');
  
  // 7. 测试仪表盘API
  console.log('\n7. 测试仪表盘API');
  await testEndpoint('/api/users/admin/dashboard-stats', adminToken, '   管理员访问仪表盘');
  await testEndpoint('/api/users/admin/dashboard-stats', userToken, '   普通用户访问仪表盘');
  
  console.log('\n✅ 权限控制测试完成！');
  console.log('\n📋 测试结果说明:');
  console.log('   - 200: 访问成功');
  console.log('   - 401: 未认证');
  console.log('   - 403: 权限不足');
  console.log('   - 404: 资源不存在');
}

// 运行测试
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests }; 