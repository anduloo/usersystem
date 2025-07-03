const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// const fetch = require('node-fetch');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const register = async (req, res) => {
  const { email, password, name, redirect_uri } = req.body;
  
  const safeRedirectUri = redirect_uri || 'http://localhost:5173';

  try {
    if (!email || !password) {
      return res.redirect(`/register?error=邮箱和密码不能为空&redirect_uri=${safeRedirectUri}`);
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.redirect(`/register?error=该邮箱已被注册&redirect_uri=${safeRedirectUri}`);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });

    // 注册成功后，重定向到登录页并带上 success 参数
    return res.redirect('/login?success=1');

  } catch (error) {
    console.error('注册失败:', error);
    res.redirect(`/register?error=服务器内部错误&redirect_uri=${safeRedirectUri}`);
  }
};

async function getCityByIp(ip) {
  try {
    // 只保留纯IP，防止有端口或多段
    if (ip && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
    if (!ip || ip === '::1' || ip === '127.0.0.1') {
      console.log('getCityByIp: 本地或无效IP，返回空');
      return '';
    }

    // 1. 淘宝接口
    const tbUrl = `https://ip.taobao.com/outGetIpInfo?ip=${ip}&accessKey=alibaba-inc`;
    console.log('getCityByIp 淘宝请求:', tbUrl);
    try {
      const tbRes = await fetch(tbUrl, { timeout: 1000 });
      const tbData = await tbRes.json();
      console.log('getCityByIp 淘宝返回:', tbData);
      if (tbData.code === 0 && tbData.data) {
        // 淘宝接口返回的城市字段
        return tbData.data.city || tbData.data.region || tbData.data.country || '';
      }
    } catch (e) {
      console.warn('淘宝IP接口失败，尝试备用:', e);
    }

    // 2. 备用 ip-api.com
    const url = `http://ip-api.com/json/${ip}?lang=zh-CN`;
    console.log('getCityByIp 备用请求:', url);
    try {
      const res = await fetch(url, { timeout: 1000 });
      const data = await res.json();
      console.log('getCityByIp 备用返回:', data);
      if (data.status === 'success') {
        return data.city || data.regionName || data.country || '';
      }
    } catch (e) {
      console.warn('ip-api.com 备用接口也失败:', e);
    }

    return '';
  } catch (e) {
    console.error('getCityByIp error:', e);
    return '';
  }
}

const login = async (req, res) => {
  const { email, password, redirect_uri } = req.body;

  // 如果提供了 redirect_uri，则将其作为登录失败后的返回地址
  // 否则，默认一个空的 redirect_uri 查询参数
  const errorRedirect = redirect_uri 
    ? `/login?error=%s&redirect_uri=${encodeURIComponent(redirect_uri)}`
    : '/login?error=%s';

  try {
    if (!email || !password) {
      return res.redirect(errorRedirect.replace('%s', '邮箱和密码不能为空'));
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.redirect(errorRedirect.replace('%s', '无效的邮箱或密码'));
    }
    if (user.isActive === false) {
      return res.redirect(errorRedirect.replace('%s', '账号已被禁用'));
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.redirect(errorRedirect.replace('%s', '无效的邮箱或密码'));
    }

    const ip = req.headers['x-forwarded-for'] || req.ip;
    // 异步写入登录日志，不阻塞主流程
    getCityByIp(ip).then(city => {
      prisma.userLoginLog.create({
        data: {
          userId: user.id,
          ip,
          userAgent: req.headers['user-agent'] || '',
          city
        }
      }).catch(() => {});
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    
    // 登录成功后将token写入cookie
    res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    
    // 决定登录成功后的跳转地址，并拼接 token
    let destinationUrl;
    if (redirect_uri && redirect_uri.trim() !== '') {
      // 判断 redirect_uri 是否已带参数
      if (redirect_uri.includes('?')) {
        destinationUrl = `${redirect_uri}&token=${token}`;
      } else {
        destinationUrl = `${redirect_uri}?token=${token}`;
      }
    } else {
      destinationUrl = `/portal?token=${token}`;
    }
    
    res.redirect(destinationUrl);

  } catch (error) {
    console.error('登录失败:', error);
    res.redirect(errorRedirect.replace('%s', '服务器内部错误'));
  }
};

// 仅渲染门户页面的 EJS 模板
const showPortal = (req, res) => {
  res.render('portal', {
    // 初始不传递数据，数据将由前端脚本获取
  });
};

// 通过受保护的 API 获取门户页面所需的数据
const getPortalData = async (req, res) => {
  try {
    // req.user 是由 authMiddleware 中间件附加的
    const userWithProjects = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        projectAssignments: {
          include: { project: true }
        }
      }
    });

    if (!userWithProjects) {
      return res.status(404).json({ message: '未找到用户数据' });
    }

    const projects = userWithProjects.projectAssignments.map(
      (assignment) => assignment.project
    );

    // 默认应用列表 - 根据用户角色动态添加
    const defaultApps = [];

    // 只有管理员才能看到后台管理系统
    if (req.user.role === 'admin' || req.user.isSuperAdmin) {
      defaultApps.push(
        {
          id: 'admin',
          name: '后台管理系统',
          description: '用户管理、项目管理、数据统计',
          url: '/admin'
        }
      );
    }
    // 普通用户 defaultApps 保持为空

    // 返回用户实际分配的项目和默认应用
    res.json({
      user: {
        id: userWithProjects.id,
        email: userWithProjects.email,
        name: userWithProjects.name,
        role: userWithProjects.role,
        isSuperAdmin: userWithProjects.isSuperAdmin
      },
      projects: projects,
      defaultApps: defaultApps
    });
  } catch (error) {
    console.error('获取门户页面数据失败:', error);
    res.status(500).json({ message: '服务器错误' });
  }
};

module.exports = {
  register,
  login,
  showPortal,
  getPortalData,
  getCityByIp,
};