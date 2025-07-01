const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

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

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    
    const destination = new URL(safeRedirectUri);
    destination.searchParams.set('token', token);
    res.redirect(destination.toString());

  } catch (error) {
    console.error('注册失败:', error);
    res.redirect(`/register?error=服务器内部错误&redirect_uri=${safeRedirectUri}`);
  }
};

async function getCityByIp(ip) {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`);
    const data = await res.json();
    if (data.status === 'success') {
      return data.city || data.regionName || data.country || '';
    }
    return '';
  } catch (e) {
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
    const city = await getCityByIp(ip);
    // 记录登录日志
    await prisma.userLoginLog.create({
      data: {
        userId: user.id,
        ip,
        userAgent: req.headers['user-agent'] || '',
        city
      }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    
    // 决定登录成功后的跳转地址
    // 如果有 redirect_uri 且不为空，就跳回原应用；否则，跳到门户页面
    const destinationUrl = (redirect_uri && redirect_uri.trim() !== '') 
      ? redirect_uri 
      : 'http://localhost:3001/portal';
      
    const destination = new URL(destinationUrl);
    destination.searchParams.set('token', token);

    res.redirect(destination.toString());

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

    // 默认应用列表
    const defaultApps = [
      {
        id: 'admin',
        name: '后台管理系统',
        description: '用户管理、项目管理、数据统计',
        url: '/admin'
      }
    ];

    // 如果是管理员，添加更多默认应用
    if (req.user.role === 'admin' || req.user.isSuperAdmin) {
      defaultApps.push(
        {
          id: 'portal',
          name: '应用门户',
          description: '统一的应用访问入口',
          url: '/portal'
        }
      );
    }

    // 返回用户实际分配的项目和默认应用
    res.json({
      user: req.user,
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
};