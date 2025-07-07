const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// const fetch = require('node-fetch');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const { getConfigByKey } = require('./configController');
const crypto = require('crypto');
const cron = require('node-cron');

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
  const { token } = req.params;
  if (!token) return res.status(400).json({ message: '缺少token' });
  
  const user = await prisma.user.findFirst({ 
    where: { 
      resetPasswordToken: token,
      resetPasswordTokenExpires: { gt: new Date() }
    } 
  });
  
  if (!user) return res.status(400).json({ message: '无效或已过期的token' });
  
  res.json({ success: true, message: 'token有效' });
};

// 微信登录相关函数 - 真正的微信网页授权
const generateWechatQR = async (req, res) => {
  try {
    // 获取微信配置
    const wxAppId = await getConfigByKey('wx_appid');
    const wxAppSecret = await getConfigByKey('wx_secret');
    
    if (!wxAppId || !wxAppSecret) {
      return res.status(500).json({ message: '微信配置未设置' });
    }

    // 生成唯一的state参数，用于防止CSRF攻击
    const state = uuidv4();
    const qrId = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟有效期
    
    // 存储二维码信息到数据库
    await prisma.wechatQRCode.create({
      data: {
        id: qrId,
        state,
        expiresAt,
        status: 'pending'
      }
    });
    
    // 构造微信网页授权链接
    const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/api/auth/wechat/callback`);
    const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${wxAppId}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
    
    res.json({
      success: true,
      qrId,
      authUrl,
      state,
      expiresAt
    });
  } catch (error) {
    console.error('生成微信授权链接失败:', error);
    res.status(500).json({ message: '生成授权链接失败' });
  }
};

// 微信授权回调处理
const handleWechatCallback = async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || !state) {
    return res.status(400).send('授权参数不完整');
  }
  
  try {
    // 验证state参数
    const qrCode = await prisma.wechatQRCode.findFirst({
      where: {
        state,
        status: { in: ['pending', 'scanned', 'confirmed'] },
        expiresAt: { gt: new Date() }
      }
    });

    if (!qrCode) {
      return res.status(400).send('授权链接已过期或无效');
    }

    // 获取微信配置
    const wxAppId = await getConfigByKey('wx_appid');
    const wxAppSecret = await getConfigByKey('wx_secret');
    
    if (!wxAppId || !wxAppSecret) {
      return res.status(500).send('微信配置未设置');
    }

    // 通过code获取access_token
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${wxAppId}&secret=${wxAppSecret}&code=${code}&grant_type=authorization_code`;
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode) {
      return res.status(400).send('微信授权失败');
    }

    const { access_token, openid, unionid } = tokenData;

    // 通过access_token获取用户基本信息
    const userInfoUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}&lang=zh_CN`;
    const userInfoResponse = await fetch(userInfoUrl);
    const userInfo = await userInfoResponse.json();

    if (userInfo.errcode) {
      console.error('获取微信用户信息失败:', userInfo);
      return res.status(400).send('获取用户信息失败');
    }

    // 查找或创建用户
    let user = await prisma.user.findFirst({
      where: { wechatOpenId: openid }
    });
    
    if (!user) {
      // 创建新用户
      user = await prisma.user.create({
        data: {
          name: '', // 设置为空，确保被视为信息不完整
          email: `${openid}@wechat.local`, // 临时邮箱
          password: crypto.randomBytes(16).toString('hex'),
          emailConfirmed: false,
          role: 'USER',
          isActive: true,
          wechatOpenId: openid,
          wechatUnionId: unionid || null
        }
      });
    } else {
        }
    
    // 检查用户信息是否完整（临时邮箱或没有姓名都视为不完整）
    if (!user.email || user.email.endsWith('@wechat.local') || !user.name || user.name.trim() === '') {
      // 设置二维码状态为confirmed，让前端弹窗处理
      await prisma.wechatQRCode.update({
        where: { id: qrCode.id },
        data: { 
          status: 'confirmed',
          userId: user.id
        }
      });
      // 渲染确认页面，让前端状态检查处理登录
      return res.render('wechat-confirm', {
        name: user.name || '',
        email: user.email || '',
        qrId: qrCode.id,
        userId: user.id
      });
    }

    // 检查邮箱是否已验证
    if (!user.emailConfirmed) {
      await prisma.wechatQRCode.update({
        where: { id: qrCode.id },
        data: { 
          status: 'confirmed',
          userId: user.id
        }
      });
      // 跳转到确认页面，让用户点击确认按钮时处理邮箱验证
      return res.render('wechat-confirm', {
        name: user.name || '',
        email: user.email || '',
        qrId: qrCode.id,
        userId: user.id
      });
    }

    // 用户信息完整且已验证，直接登录
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

    // 更新二维码状态为已确认，并设置userId
    await prisma.wechatQRCode.update({
      where: { id: qrCode.id },
      data: { 
        status: 'confirmed',
        userId: user.id
      }
    });

    // 渲染确认页面，让前端状态检查处理登录
    return res.render('wechat-confirm', {
      name: user.name || '',
      email: user.email || '',
      qrId: qrCode.id,
      userId: user.id
    });

  } catch (error) {
    console.error('微信授权回调处理失败:', error);
    res.status(500).send('授权处理失败');
  }
};

// 检查微信登录状态
const checkWechatLoginStatus = async (req, res) => {
  const { qrId } = req.params;
  
  try {
    const qrCode = await prisma.wechatQRCode.findUnique({
      where: { id: qrId },
      include: { user: true }
    });
    
    if (!qrCode) {
      return res.status(404).json({ message: '二维码不存在' });
    }
    
    if (qrCode.expiresAt < new Date()) {
      return res.json({ status: 'expired' });
    }
    
    if (qrCode.status === 'confirmed' && qrCode.user) {
      // 检查用户信息是否完整
          
      // 检查用户信息是否完整（临时邮箱或没有姓名都视为不完整）
      if (!qrCode.user.email || qrCode.user.email.endsWith('@wechat.local') || !qrCode.user.name || qrCode.user.name.trim() === '') {
          return res.json({ 
          success: true, 
          status: 'incomplete',
          message: '用户信息不完整，请补全信息',
          needBind: true,
          qrId: qrId,
          nickname: qrCode.user.name || ''
        });
      }
      
      // 检查邮箱是否已验证
      if (!qrCode.user.emailConfirmed) {
        return res.json({ 
          success: true, 
          status: 'unverified',
          message: '请先验证邮箱',
          needBind: true,
          qrId: qrId,
          nickname: qrCode.user.name || ''
        });
      }
      
      // 只有用户信息完整且已验证时才生成JWT token
      const sessionId = uuidv4();
      await prisma.user.update({
        where: { id: qrCode.user.id },
        data: { currentSession: sessionId }
      });
      
      const updatedUser = await prisma.user.findUnique({
        where: { id: qrCode.user.id }
      });
      
      
      const token = jwt.sign(
        {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          tokenVersion: updatedUser.tokenVersion,
          sessionId: updatedUser.currentSession
        },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );
      
      return res.json({ 
        success: true,
        status: qrCode.status,
        token 
      });
    }
    
    res.json({ success: true, status: qrCode.status });
  } catch (error) {
    console.error('检查微信登录状态失败:', error);
    res.status(500).json({ message: '检查状态失败' });
  }
};

// 绑定微信用户信息
const bindWechatUserInfo = async (req, res) => {
  const { qrId, email, name } = req.body;
  
  if (!qrId || !email || !name) {
    return res.status(400).json({ message: '参数不完整' });
  }

  try {
    const qrCode = await prisma.wechatQRCode.findUnique({
      where: { id: qrId },
      include: { user: true }
    });
    
    if (!qrCode || !qrCode.user) {
      return res.status(404).json({ message: '二维码或用户不存在' });
    }

    // 检查邮箱是否已被其他用户使用
    const existingUser = await prisma.user.findUnique({ where: { email } });
    
    if (existingUser && existingUser.id !== qrCode.user.id) {
      // 如果该邮箱已被其他用户使用
      if (existingUser.wechatOpenId) {
        return res.status(400).json({ message: '该邮箱已被其他微信账号绑定' });
      }
      
      // 如果邮箱存在但未绑定微信，则更新该用户
      
      // 生成邮箱验证token
      const emailConfirmToken = uuidv4();
      const emailConfirmTokenExpires = new Date(Date.now() + 24*60*60*1000);

      // 1. 更新二维码关联的用户ID
      await prisma.wechatQRCode.update({
        where: { id: qrId },
        data: { userId: existingUser.id }
      });

      // 2. 删除临时用户（拥有 openid 的那个）
      const tempOpenId = qrCode.user.wechatOpenId;
      const tempUnionId = qrCode.user.wechatUnionId;
      await prisma.user.delete({ where: { id: qrCode.user.id } });

      // 3. 再 update 目标用户，赋值 wechatOpenId
      const updateData = {
        name,
        wechatOpenId: tempOpenId,
        wechatUnionId: tempUnionId
      };
      if (!existingUser.emailConfirmed) {
        updateData.emailConfirmed = false;
        updateData.emailConfirmToken = emailConfirmToken;
        updateData.emailConfirmTokenExpires = emailConfirmTokenExpires;
      }
      await prisma.user.update({
        where: { id: existingUser.id },
        data: updateData
      });
      
      // 只有未验证邮箱才发送邮箱验证邮件
      if (!existingUser.emailConfirmed) {
        try {
          let template = await getConfigByKey('welcome_mail_template');
          if (!template) {
            template = '欢迎注册，{{username}}！请点击以下链接完成邮箱确认：<a href="{{confirmLink}}">{{confirmLink}}</a>。24小时内有效。';
          }
          const confirmLink = `${req.protocol}://${req.get('host')}/api/auth/confirm-email?token=${emailConfirmToken}`;
          const mailContent = template
            .replace(/{{username}}/g, name || email)
            .replace(/{{confirmLink}}/g, confirmLink);

          const mailHost = await getConfigByKey('mail_host');
          const mailPort = await getConfigByKey('mail_port');
          const mailSecure = await getConfigByKey('mail_secure');
          const mailUser = await getConfigByKey('mail_user');
          const mailPass = await getConfigByKey('mail_pass');
          const mailFrom = await getConfigByKey('mail_from');

          const transporter = nodemailer.createTransporter({
            host: mailHost,
            port: Number(mailPort),
            secure: mailSecure === 'ssl',
            auth: { user: mailUser, pass: mailPass },
            tls: mailSecure !== 'ssl' ? { rejectUnauthorized: false } : undefined
          });
          await transporter.sendMail({
            from: mailFrom || mailUser,
            to: email,
            subject: '微信登录邮箱验证',
            html: mailContent
          });
        } catch (e) {
          console.error('发送微信用户邮箱验证邮件失败:', e);
        }
      }

      await prisma.wechatQRCode.update({
        where: { id: qrId },
        data: { status: 'confirmed' }
      });
      res.json({ success: true, message: '信息补全成功，请前往邮箱完成验证' });
      return;
    }

    // 更新用户信息
    const emailConfirmToken = uuidv4();
    const emailConfirmTokenExpires = new Date(Date.now() + 24*60*60*1000);
    
    await prisma.user.update({
      where: { id: qrCode.user.id },
      data: { 
        email, 
        name,
        emailConfirmed: false,
        emailConfirmToken: emailConfirmToken,
        emailConfirmTokenExpires: emailConfirmTokenExpires
      }
    });

    // 发送邮箱验证邮件
    try {
      let template = await getConfigByKey('welcome_mail_template');
      if (!template) {
        template = '欢迎注册，{{username}}！请点击以下链接完成邮箱确认：<a href="{{confirmLink}}">{{confirmLink}}</a>。24小时内有效。';
      }
      const confirmLink = `${req.protocol}://${req.get('host')}/api/auth/confirm-email?token=${emailConfirmToken}`;
      const mailContent = template
        .replace(/{{username}}/g, name || email)
        .replace(/{{confirmLink}}/g, confirmLink);

      const mailHost = await getConfigByKey('mail_host');
      const mailPort = await getConfigByKey('mail_port');
      const mailSecure = await getConfigByKey('mail_secure');
      const mailUser = await getConfigByKey('mail_user');
      const mailPass = await getConfigByKey('mail_pass');
      const mailFrom = await getConfigByKey('mail_from');

      const transporter = nodemailer.createTransporter({
        host: mailHost,
        port: Number(mailPort),
        secure: mailSecure === 'ssl',
        auth: { user: mailUser, pass: mailPass },
        tls: mailSecure !== 'ssl' ? { rejectUnauthorized: false } : undefined
      });
      await transporter.sendMail({
        from: mailFrom || mailUser,
        to: email,
        subject: '微信登录邮箱验证',
        html: mailContent
      });
    } catch (e) {
      console.error('发送微信用户邮箱验证邮件失败:', e);
    }

    await prisma.wechatQRCode.update({
      where: { id: qrId },
      data: { status: 'confirmed' }
    });
    res.json({ success: true, message: '信息补全成功，请前往邮箱完成验证' });
  } catch (error) {
    console.error('绑定用户信息失败:', error);
    if (error.code === 'P2002') {
      res.status(400).json({ message: '该邮箱已被其他用户使用' });
      } else {
      res.status(500).json({ message: `绑定失败: ${error.message}` });
    }
  }
};

// 定期清理未补全信息的临时用户（每30分钟）
function scheduleCleanTempUsers(prisma) {
  setInterval(async () => {
    try {
      const result = await prisma.user.deleteMany({
        where: {
          email: { endsWith: '@temp.local' },
          emailConfirmed: false,
          name: '',
          wechatOpenId: null,
          updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } // 30分钟前创建的
        }
      });
      if (result.count > 0) {
      }
    } catch (e) {
      console.error('[定时清理] 临时用户清理失败:', e);
    }
  }, 30 * 60 * 1000); // 每30分钟执行一次
}

// 定期清理过期二维码（每10分钟）
function scheduleCleanExpiredQRCodes(prisma) {
  cron.schedule('*/10 * * * *', async () => {
    try {
      const result = await prisma.wechatQRCode.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
          status: { in: ['pending', 'scanned', 'confirmed'] }
        }
      });
      if (result.count > 0) {
      }
    } catch (e) {
      console.error('[定时清理] 二维码清理失败:', e);
    }
  });
}

// 启动时调用
scheduleCleanTempUsers(prisma);
scheduleCleanExpiredQRCodes(prisma);

// 微信用户识别函数
const identifyWechatUser = async (openid) => {
  try {
    // 通过openid查找已绑定用户
    const existingUser = await prisma.user.findFirst({
      where: {
        wechatOpenId: openid,
        email: { not: null },
        name: { not: null }
      }
    });
    
    if (existingUser) {
      return existingUser;
    }
    
    return null;
  } catch (error) {
    console.error('微信用户识别失败:', error);
    return null;
  }
};

// 获取微信access_token
const getWechatAccessToken = async () => {
  try {
    const wxAppId = await getConfigByKey('wx_appid');
    const wxAppSecret = await getConfigByKey('wx_secret');
    
    if (!wxAppId || !wxAppSecret) {
      throw new Error('微信配置未设置');
    }
    
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${wxAppId}&secret=${wxAppSecret}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.access_token) {
      return data.access_token;
    } else {
      throw new Error(`微信API错误: ${data.errmsg || '未知错误'}`);
    }
  } catch (error) {
    console.error('获取微信access_token失败:', error);
    throw error;
  }
};

// 重新发送验证邮件
const resendVerificationEmail = async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ message: '邮箱不能为空' });
  }
  
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    if (user.emailConfirmed) {
      return res.status(400).json({ message: '邮箱已验证，无需重新发送' });
    }
    
    // 生成新的验证token
    const emailConfirmToken = uuidv4();
    const emailConfirmTokenExpires = new Date(Date.now() + 24*60*60*1000);
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailConfirmToken: emailConfirmToken,
        emailConfirmTokenExpires: emailConfirmTokenExpires
      }
    });
    
    // 发送验证邮件
    let template = await getConfigByKey('welcome_mail_template');
    if (!template) {
      template = '欢迎注册，{{username}}！请点击以下链接完成邮箱确认：<a href="{{confirmLink}}">{{confirmLink}}</a>。24小时内有效。';
    }
    const confirmLink = `${req.protocol}://${req.get('host')}/api/auth/confirm-email?token=${emailConfirmToken}`;
    const mailContent = template
      .replace(/{{username}}/g, user.name || user.email)
      .replace(/{{confirmLink}}/g, confirmLink);

    const mailHost = await getConfigByKey('mail_host');
    const mailPort = await getConfigByKey('mail_port');
    const mailSecure = await getConfigByKey('mail_secure');
    const mailUser = await getConfigByKey('mail_user');
    const mailPass = await getConfigByKey('mail_pass');
    const mailFrom = await getConfigByKey('mail_from');

    const transporter = nodemailer.createTransporter({
      host: mailHost,
      port: Number(mailPort),
      secure: mailSecure === 'ssl',
      auth: { user: mailUser, pass: mailPass },
      tls: mailSecure !== 'ssl' ? { rejectUnauthorized: false } : undefined
    });
    
    await transporter.sendMail({
      from: mailFrom || mailUser,
      to: email,
      subject: '邮箱验证',
      html: mailContent
    });
    
    res.json({ success: true, message: '验证邮件已重新发送' });
  } catch (error) {
    console.error('重新发送验证邮件失败:', error);
    res.status(500).json({ message: '发送失败，请稍后重试' });
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
  generateWechatQR,
  handleWechatCallback,
  checkWechatLoginStatus,
  bindWechatUserInfo,
  resendVerificationEmail
};