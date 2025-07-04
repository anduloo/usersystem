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

module.exports = {
  renderLoginPage,
  renderAdminPage,
  renderResetPasswordPage,
};