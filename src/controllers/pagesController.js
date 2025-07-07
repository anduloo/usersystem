const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const renderLoginPage = (req, res) => {
  const { error, redirect_uri, success } = req.query;
  res.render('login', {
    error: error || null,
    redirect_uri: redirect_uri || '',
    success: success === '1' || false
  });
};

const renderAdminPage = (req, res) => {
  res.render('admin', { user: req.user });
};

const renderResetPasswordPage = (req, res) => {
  // token 直接由前端JS从URL获取，这里可不传
  res.render('reset-password');
};

const renderWechatConfirmPage = async (req, res) => {
  try {
    const { qrId } = req.query;
    if (!qrId) {
      return res.redirect('/login?error=无效的二维码链接');
    }

    // 查找二维码和用户
    const qrCode = await prisma.wechatQRCode.findUnique({
      where: { id: qrId },
      include: { user: true }
    });

    if (!qrCode || !qrCode.user) {
      return res.redirect('/login?error=二维码已过期或无效');
    }

    res.render('wechat-confirm', {
      name: qrCode.user.name || '',
      email: qrCode.user.email || '',
      qrId,
      userId: qrCode.user.id
    });
  } catch (error) {
    console.error('微信确认页面错误:', error);
    return res.redirect('/login?error=系统错误，请重新登录');
  }
};

module.exports = {
  renderLoginPage,
  renderAdminPage,
  renderResetPasswordPage,
  renderWechatConfirmPage,
};