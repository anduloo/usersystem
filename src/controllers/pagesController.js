const renderLoginPage = (req, res) => {
  const { error, redirect_uri } = req.query;
  res.render('login', {
    error: error || null,
    redirect_uri: redirect_uri || '',
  });
};

const renderRegisterPage = (req, res) => {
  const { error, redirect_uri } = req.query;
  res.render('register', {
    error: error || null,
    redirect_uri: redirect_uri || '',
  });
};

const renderAdminPage = (req, res) => {
  res.render('admin');
};

module.exports = {
  renderLoginPage,
  renderRegisterPage,
  renderAdminPage,
};
