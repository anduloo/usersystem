const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// const fetch = require('node-fetch');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const { getConfigByKey } = require('./configController');

// IP 地理位置缓存（内存缓存，重启后清空）
const ipLocationCache = new Map();
const CACHE_EXPIRE_TIME = 24 * 60 * 60 * 1000; // 24小时缓存

const register = async (req, res) => {
  const { email, password, name, redirect_uri } = req.body;
  
  const safeRedirectUri = redirect_uri || 'http://localhost:5173';

  try {
    if (!email || !password) {
      return res.redirect(`/register?error=邮箱和密码不能为空&redirect_uri=${safeRedirectUri}`);
    }

    // 注册前清理同邮箱未确认用户，防止token混淆
    await prisma.user.deleteMany({
      where: {
        email,
        emailConfirmed: false
      }
    });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.redirect(`/register?error=该邮箱已被注册&redirect_uri=${safeRedirectUri}`);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const token = uuidv4();
    const tokenExpires = new Date(Date.now() + 24*60*60*1000); // 24小时
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        emailConfirmed: false,
        emailConfirmToken: token,
        emailConfirmTokenExpires: tokenExpires
      },
    });

    // 发送确认邮件（支持模板）
    let template = await getConfigByKey('welcome_mail_template');
    if (!template) {
      template = '欢迎注册，{{username}}！请点击以下链接完成邮箱确认：<a href="{{confirmLink}}">{{confirmLink}}</a>。24小时内有效。';
    }
    const confirmLink = `${req.protocol}://${req.get('host')}/api/auth/confirm-email?token=${token}`;
    const mailContent = template
      .replace(/{{username}}/g, name || email)
      .replace(/{{confirmLink}}/g, confirmLink);

    // 读取系统配置表的邮件参数
    const mailHost = await getConfigByKey('mail_host');
    const mailPort = await getConfigByKey('mail_port');
    const mailSecure = await getConfigByKey('mail_secure');
    const mailUser = await getConfigByKey('mail_user');
    const mailPass = await getConfigByKey('mail_pass');
    const mailFrom = await getConfigByKey('mail_from');

    try {
      const transporter = nodemailer.createTransport({
        host: mailHost,
        port: Number(mailPort),
        secure: mailSecure === 'ssl',
        auth: { user: mailUser, pass: mailPass },
        tls: mailSecure !== 'ssl' ? { rejectUnauthorized: false } : undefined
      });
      await transporter.sendMail({
        from: mailFrom || mailUser,
        to: email,
        subject: '邮箱确认',
        html: mailContent
      });
    } catch (e) {
      console.error('发送确认邮件失败:', e);
    }

    // 注册成功后，重定向到登录页并带上 success 参数
    return res.redirect('/login?success=1');

  } catch (error) {
    console.error('注册失败:', error);
    res.redirect(`/register?error=服务器内部错误&redirect_uri=${safeRedirectUri}`);
  }
};

// 新增邮箱确认接口
const confirmEmail = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('无效的确认链接');
  const user = await prisma.user.findFirst({ where: { emailConfirmToken: token } });
  if (!user) return res.status(400).send('无效的确认链接');
  if (user.emailConfirmTokenExpires && user.emailConfirmTokenExpires < new Date()) {
    return res.status(400).send('确认链接已过期');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { emailConfirmed: true, emailConfirmToken: null, emailConfirmTokenExpires: null }
  });
  res.redirect('/portal');
};

async function getCityByIp(ip) {
  try {
    // 只保留纯IP，防止有端口或多段
    if (ip && ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
    if (!ip || ip === '::1' || ip === '127.0.0.1') {
      return '';
    }

    // 检查缓存
    const cached = ipLocationCache.get(ip);
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRE_TIME) {
      return cached.city;
    }

    // 使用 Promise.race 同时请求两个接口，取最快的结果
    const promises = [
      // 1. 淘宝接口
      (async () => {
        try {
          const tbUrl = `https://ip.taobao.com/outGetIpInfo?ip=${ip}&accessKey=alibaba-inc`;
          const tbRes = await fetch(tbUrl, { timeout: 500 }); // 减少超时时间
          const tbData = await tbRes.json();
          if (tbData.code === 0 && tbData.data) {
            return tbData.data.city || tbData.data.region || tbData.data.country || '';
          }
        } catch (e) {
          console.warn('淘宝IP接口失败:', e.message);
        }
        return null;
      })(),
      
      // 2. 备用 ip-api.com
      (async () => {
        try {
          const url = `http://ip-api.com/json/${ip}?lang=zh-CN`;
          const res = await fetch(url, { timeout: 500 }); // 减少超时时间
          const data = await res.json();
          if (data.status === 'success') {
            return data.city || data.regionName || data.country || '';
          }
        } catch (e) {
          console.warn('ip-api.com 备用接口失败:', e.message);
        }
        return null;
      })()
    ];

    // 等待第一个成功的结果，最多等待 800ms
    const result = await Promise.race([
      Promise.any(promises),
      new Promise(resolve => setTimeout(() => resolve(''), 800))
    ]);

    const city = result || '';
    
    // 缓存结果
    ipLocationCache.set(ip, {
      city,
      timestamp: Date.now()
    });

    // 清理过期缓存（每100次查询清理一次）
    if (ipLocationCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of ipLocationCache.entries()) {
        if (now - value.timestamp > CACHE_EXPIRE_TIME) {
          ipLocationCache.delete(key);
        }
      }
    }

    return city;
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
    if (!user.emailConfirmed) {
      return res.redirect(errorRedirect.replace('%s', '请先完成邮箱确认'));
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.redirect(errorRedirect.replace('%s', '无效的邮箱或密码'));
    }

    const ip = req.headers['x-forwarded-for'] || req.ip;
    
    // 异步写入登录日志，但不阻塞主流程
    // 使用 setImmediate 确保在当前事件循环结束后执行
    setImmediate(async () => {
      try {
        // 检查是否启用 IP 地理位置查询（可以通过环境变量控制）
        const enableIpLocation = process.env.ENABLE_IP_LOCATION !== 'false';
        const city = enableIpLocation ? await getCityByIp(ip) : '';
        
        await prisma.userLoginLog.create({
          data: {
            userId: user.id,
            ip,
            userAgent: req.headers['user-agent'] || '',
            city
          }
        });
      } catch (error) {
        console.error('写入登录日志失败:', error);
        // 即使日志写入失败，也不影响登录流程
      }
    });

    // 生成新的sessionId
    const sessionId = uuidv4();
    await prisma.user.update({
      where: { id: user.id },
      data: { currentSession: sessionId }
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion,
        sessionId: sessionId
      },
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

// 请求重置密码
const requestResetPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: '邮箱不能为空' });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ message: '用户不存在' });

  // 生成token和过期时间
  const token = uuidv4();
  const tokenExpires = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2小时有效
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetPasswordToken: token,
      resetPasswordTokenExpires: tokenExpires
    }
  });

  // 邮件模板
  let template = await getConfigByKey('reset_password_mail_template');
  if (!template) {
    template = '您好 {{username}}，您正在重置密码。请点击以下链接重置密码：<a href="{{resetLink}}">{{resetLink}}</a>。{{expireTime}}内有效。';
  }
  const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;
  const expireTime = '2小时';
  const mailContent = template
    .replace(/{{username}}/g, user.name || user.email)
    .replace(/{{resetLink}}/g, resetLink)
    .replace(/{{expireTime}}/g, expireTime);

  // 邮件参数
  const mailHost = await getConfigByKey('mail_host');
  const mailPort = await getConfigByKey('mail_port');
  const mailSecure = await getConfigByKey('mail_secure');
  const mailUser = await getConfigByKey('mail_user');
  const mailPass = await getConfigByKey('mail_pass');
  const mailFrom = await getConfigByKey('mail_from');

  try {
    const transporter = nodemailer.createTransport({
      host: mailHost,
      port: Number(mailPort),
      secure: mailSecure === 'ssl',
      auth: { user: mailUser, pass: mailPass },
      tls: mailSecure !== 'ssl' ? { rejectUnauthorized: false } : undefined
    });
    await transporter.sendMail({
      from: mailFrom || mailUser,
      to: email,
      subject: '重置密码',
      html: mailContent
    });
    return res.json({ success: true, message: '重置密码邮件已发送，请查收邮箱' });
  } catch (e) {
    console.error('发送重置密码邮件失败:', e);
    return res.status(500).json({ message: '邮件发送失败' });
  }
};

// 重置密码
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ message: '参数不完整' });
  const user = await prisma.user.findFirst({
    where: {
      resetPasswordToken: token,
      resetPasswordTokenExpires: { gte: new Date() }
    }
  });
  if (!user) return res.status(400).json({ message: '重置链接无效或已过期' });

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      resetPasswordToken: null,
      resetPasswordTokenExpires: null
    }
  });
  return res.json({ success: true, message: '密码重置成功，请重新登录' });
};

// 验证重置密码token
const verifyResetToken = async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ message: 'Token不能为空' });
  }
  
  try {
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordTokenExpires: { gte: new Date() }
      }
    });
    
    if (!user) {
      // 检查是否有token但已过期
      const expiredUser = await prisma.user.findFirst({
        where: {
          resetPasswordToken: token
        }
      });
      
      if (expiredUser) {
        return res.status(400).json({ message: '重置链接已过期' });
      } else {
        return res.status(400).json({ message: '重置链接无效' });
      }
    }
    
    return res.json({ success: true, message: 'Token有效' });
  } catch (error) {
    console.error('验证token时出错:', error);
    return res.status(500).json({ message: '服务器内部错误' });
  }
};

module.exports = {
  register,
  login,
  showPortal,
  getPortalData,
  getCityByIp,
  confirmEmail,
  requestResetPassword,
  resetPassword,
  verifyResetToken,
};