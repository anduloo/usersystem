const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

const confirmWechatLogin = async (req, res) => {
  try {
    const { qrId } = req.body;
    
    if (!qrId) {
      return res.status(200).json({ 
        success: false, 
        message: '缺少二维码ID' 
      });
    }

    // 查找二维码
    const qrCode = await prisma.wechatQRCode.findUnique({
      where: { id: qrId },
      include: { user: true }
    });

    if (!qrCode) {
      return res.status(200).json({ 
        success: false, 
        message: '二维码已过期或无效' 
      });
    }

    if (!qrCode.user) {
      return res.status(200).json({ 
        success: false, 
        status: 'incomplete',
        message: '用户信息不完整，请先补全信息',
        needBind: true,
        qrId: qrId
      });
    }

    // 检查邮箱是否已验证
    if (!qrCode.user.emailConfirmed) {
      return res.status(200).json({
        success: false,
        status: 'unverified',
        message: '请先验证邮箱'
      });
    }

    // 更新二维码状态为已确认
    await prisma.wechatQRCode.update({
      where: { id: qrId },
      data: { status: 'confirmed' }
    });

    // 生成登录token
    const sessionId = uuidv4();
    const token = jwt.sign(
      { 
        userId: qrCode.user.id, 
        sessionId,
        loginType: 'wechat'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 更新用户session
    await prisma.user.update({
      where: { id: qrCode.user.id },
      data: { 
        currentSession: sessionId
      }
    });

    // 写入登录日志
    await prisma.userLoginLog.create({
      data: {
        userId: qrCode.user.id,
        ip: req.headers['x-forwarded-for'] || req.ip,
        userAgent: req.headers['user-agent'] || ''
      }
    });

    res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: qrCode.user.id,
        name: qrCode.user.name,
        email: qrCode.user.email
      }
    });

  } catch (error) {
    return res.status(200).json({ 
      success: false, 
      message: '系统错误，请重新尝试' 
    });
  }
};

// 生成微信二维码
const generateWechatQRCode = async (req, res) => {
  try {
    const qrId = uuidv4();
    const qrCodeUrl = `${process.env.BASE_URL}/wechat-confirm?qrId=${qrId}`;
    
    // 创建临时用户
    const tempUser = await prisma.user.create({
      data: {
        name: null,
        email: null,
        password: null,
        currentSession: null,
        tokenVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // 创建二维码记录
    await prisma.wechatQRCode.create({
      data: {
        id: qrId,
        userId: tempUser.id,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 1 * 60 * 1000) // 1分钟过期
      }
    });

    res.json({
      success: true,
      qrId,
      qrCodeUrl
    });

  } catch (error) {
    return res.status(400).json({ 
      success: false, 
      message: '二维码生成失败' 
    });
  }
};

// 检查二维码状态
const checkQRCodeStatus = async (req, res) => {
  try {
    const { qrId } = req.params;
    
    if (!qrId) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少二维码ID' 
      });
    }

    const qrCode = await prisma.wechatQRCode.findUnique({
      where: { id: qrId },
      include: { user: true }
    });

    if (!qrCode) {
      return res.status(400).json({ 
        success: false, 
        message: '二维码不存在' 
      });
    }

    // 检查是否过期
    if (qrCode.expiresAt < new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: '二维码已过期' 
      });
    }

    res.json({
      success: true,
      status: qrCode.status,
      user: qrCode.user ? {
        id: qrCode.user.id,
        name: qrCode.user.name,
        email: qrCode.user.email
      } : null
    });

  } catch (error) {
    return res.status(400).json({ 
      success: false, 
      message: '状态检查失败' 
    });
  }
};

// 扫码处理
const handleWechatScan = async (req, res) => {
  try {
    const { qrId } = req.params;
    
    if (!qrId) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少二维码ID' 
      });
    }

    const qrCode = await prisma.wechatQRCode.findUnique({
      where: { id: qrId },
      include: { user: true }
    });

    if (!qrCode) {
      return res.status(400).json({ 
        success: false, 
        message: '二维码不存在' 
      });
    }

    if (qrCode.expiresAt < new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: '二维码已过期' 
      });
    }

    // 更新状态为已扫码
    await prisma.wechatQRCode.update({
      where: { id: qrId },
      data: { status: 'scanned' }
    });

    res.json({
      success: true,
      message: '扫码成功'
    });

  } catch (error) {
    return res.status(400).json({ 
      success: false, 
      message: '扫码失败' 
    });
  }
};

// 补全用户信息
const completeUserInfo = async (req, res) => {
  try {
    const { qrId, email, name } = req.body;
    
    if (!qrId || !email || !name) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少必要参数' 
      });
    }

    // 查找二维码
    const qrCode = await prisma.wechatQRCode.findUnique({
      where: { id: qrId },
      include: { user: true }
    });

    if (!qrCode) {
      return res.status(400).json({ 
        success: false, 
        message: '二维码已过期或无效' 
      });
    }

    if (qrCode.expiresAt < new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: '二维码已过期' 
      });
    }

    // 查找是否已存在该邮箱的用户
    const existingUser = await prisma.user.findUnique({
      where: { email: email }
    });

    if (existingUser && existingUser.id !== qrCode.userId) {
      // 如果邮箱已存在
      if (existingUser.wechatOpenId) {
        // 已被其他微信账号绑定
        return res.status(400).json({ 
          success: false, 
          message: '该邮箱已被其他微信账号绑定' 
        });
      }

      // 1. 更新二维码关联的用户ID
      await prisma.wechatQRCode.update({
        where: { id: qrId },
        data: { userId: existingUser.id }
      });

      // 2. 删除临时用户（拥有 openid 的那个）
      const tempOpenId = qrCode.user.wechatOpenId;
      await prisma.user.delete({
        where: { id: qrCode.userId }
      });

      // 3. 再 update 目标用户，赋值 wechatOpenId
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: name,
          wechatOpenId: tempOpenId // 绑定 openid
        }
      });

      return res.json({
        success: true,
        message: '信息补全成功'
      });
    } else {
      // 更新临时用户信息
      await prisma.user.update({
        where: { id: qrCode.userId },
        data: {
          name: name,
          email: email,
          updatedAt: new Date()
        }
      });
    }

    res.json({
      success: true,
      message: '信息补全成功'
    });

  } catch (error) {
    return res.status(400).json({ 
      success: false, 
      message: '信息补全失败' 
    });
  }
};

module.exports = {
  generateWechatQRCode,
  checkQRCodeStatus,
  handleWechatScan,
  confirmWechatLogin,
  completeUserInfo
}; 