const renderLoginPage = (req, res) => {
  const { error, redirect_uri, success } = req.query;
  res.render('login', {
    error: error || null,
    redirect_uri: redirect_uri || '',
    success: success === '1' || false
  });
};

const renderAdminPage = (req, res) => {
  res.render('admin');
};

module.exports = {
  renderLoginPage,
  renderAdminPage,
};