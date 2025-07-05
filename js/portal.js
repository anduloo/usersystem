document.addEventListener('DOMContentLoaded', async () => {
    const tokenKey = 'jwt_token';
    const userInfoContainer = document.getElementById('user-info');
    const appContainer = document.getElementById('app-container');
    const loginUrl = `/login`;
    
    let token = null;
    let allUsers = [];
    
    // 从URL获取token
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');
    
    if (tokenFromUrl) {
        localStorage.setItem(tokenKey, tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
        token = tokenFromUrl;
    } else {
        token = localStorage.getItem(tokenKey);
    }
    
    if (!token) {
        window.location.href = loginUrl;
        return;
    }
    
    // 获取门户数据 - 使用SSO SDK的request方法
    try {
        const data = await (window.sso ? window.sso.request('/api/portal') : fetch('/api/portal', {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => {
            if (res.status === 401) {
                localStorage.removeItem(tokenKey);
                window.location.href = loginUrl;
                throw new Error('认证失败');
            }
            if (!res.ok) throw new Error('获取数据失败');
            return res.json();
        }));
        
        renderUserInfo(data.user);
        renderApps(data.projects, data.defaultApps, data.user);
        appContainer.style.display = '';
    } catch (error) {
        appContainer.innerHTML = `
            <div class="error-message">
                <i class="fa fa-exclamation-triangle"></i>
                加载应用失败，请尝试刷新或重新登录
            </div>
        `;
        appContainer.style.display = '';
    }
    
    // 开始定时检查token状态（多端互踢）
    startTokenCheck();
    
    // 定时检查token状态函数
    function startTokenCheck() {
        // 每10秒检查一次token状态
        setInterval(async () => {
            try {
                const response = await fetch('/api/users/me', {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem(tokenKey)}` }
                });
                if (response.status === 401) {
                    console.log('Token已失效，可能是多端登录被踢下线');
                    localStorage.removeItem(tokenKey);
                    showKickoutTipAndRedirect();
                }
            } catch (error) {
                // 网络错误不影响登录状态判断
                console.log('检查token状态时网络错误:', error);
            }
        }, 10000); // 10秒检查一次
    }
    // 踢下线提示并跳转
    function showKickoutTipAndRedirect() {
        const tip = document.createElement('div');
        tip.innerHTML = '您已在其他位置登录，本页面已自动下线。即将跳转到登录页...';
        tip.style.position = 'fixed';
        tip.style.top = '40%';
        tip.style.left = '50%';
        tip.style.transform = 'translate(-50%, -50%)';
        tip.style.background = '#fff';
        tip.style.color = '#e53e3e';
        tip.style.fontSize = '1.2em';
        tip.style.padding = '2em 2.5em';
        tip.style.borderRadius = '12px';
        tip.style.boxShadow = '0 4px 24px #8882';
        tip.style.zIndex = 99999;
        document.body.appendChild(tip);
        setTimeout(() => {
            window.location.href = loginUrl;
        }, 1500);
    }
    
    function renderUserInfo(user) {
        if (!user) return;
        userInfoContainer.innerHTML = `<span>欢迎，${user.name ? user.name : user.email}</span>`;
    }
    
    function renderApps(projects = [], defaultApps = [], user = {}) {
        // 合并管理员的后台管理卡片
        let appsToShow = [...projects];
        if (defaultApps && defaultApps.length > 0) {
            appsToShow = appsToShow.concat(defaultApps);
        }
        if (appsToShow.length === 0) {
            appContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa fa-folder-open"></i>
                    <h3>暂无应用</h3>
                    <p>您目前没有被分配到任何应用</p>
                </div>
            `;
            return;
        }
        let html = '<div class="apps-grid">';
        appsToShow.forEach(app => {
            const icon = getAppIcon(app.name);
            html += `
                <a href="#" class="app-card" data-url="${app.url}" data-id="${app.id || ''}">
                    <h3>
                        <i class="fa ${icon}"></i>
                        ${app.name}
                    </h3>
                    <p>${app.description || '点击访问此应用'}</p>
                    <div class="app-meta">
                        <i class="fa fa-external-link"></i>
                        <span>点击访问</span>
                    </div>
                </a>
            `;
        });
        html += '</div>';
        appContainer.innerHTML = html;
        // 绑定点击事件
        document.querySelectorAll('.app-card').forEach(card => {
            card.onclick = (e) => {
                e.preventDefault();
                const url = card.getAttribute('data-url');
                const projectId = card.getAttribute('data-id');
                if (projectId && projectId !== 'admin') {
                    // 异步发送日志，不阻塞跳转
                    fetch('/api/users/visit-project', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'Authorization': `Bearer ${token}` 
                        },
                        body: JSON.stringify({ projectId: Number(projectId) })
                    }).catch(() => {});
                }
                if (url) {
                    window.location.href = url;
                }
            };
        });
    }
    
    function getAppIcon(appName) {
        const name = appName.toLowerCase();
        if (name.includes('管理') || name.includes('admin')) return 'fa-cogs';
        if (name.includes('数据') || name.includes('data')) return 'fa-database';
        if (name.includes('报表') || name.includes('report')) return 'fa-bar-chart';
        if (name.includes('用户') || name.includes('user')) return 'fa-users';
        if (name.includes('系统') || name.includes('system')) return 'fa-desktop';
        if (name.includes('设置') || name.includes('setting')) return 'fa-cog';
        if (name.includes('文件') || name.includes('file')) return 'fa-folder';
        if (name.includes('消息') || name.includes('message')) return 'fa-envelope';
        return 'fa-cube'; // 默认图标
    }

    // 顶部栏下拉菜单逻辑
    const dropdownToggle = document.getElementById('portal-dropdown').querySelector('.dropdown-toggle');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const dropdown = document.getElementById('portal-dropdown');

    // 让下拉菜单弹出到body层，避免被遮挡
    function showDropdownMenu() {
        const rect = dropdownToggle.getBoundingClientRect();
        const headerRect = document.querySelector('.header').getBoundingClientRect();
        
        // 确保下拉菜单有正确的样式
        dropdownMenu.style.position = 'absolute';
        dropdownMenu.style.zIndex = '99999';
        dropdownMenu.style.background = 'var(--card-bg)';
        dropdownMenu.style.backdropFilter = 'blur(20px)';
        dropdownMenu.style.webkitBackdropFilter = 'blur(20px)';
        dropdownMenu.style.border = '1px solid rgba(255,255,255,0.2)';
        dropdownMenu.style.borderRadius = 'var(--radius)';
        dropdownMenu.style.boxShadow = '0 8px 32px rgba(102, 126, 234, 0.2)';
        dropdownMenu.style.minWidth = '200px';
        dropdownMenu.style.overflow = 'visible';
        
        // 右对齐 header
        const right = window.innerWidth - headerRect.right + 24; // 24为header右侧padding，可根据实际情况调整
        dropdownMenu.style.right = right + 'px';
        dropdownMenu.style.left = 'auto';
        dropdownMenu.style.top = (rect.bottom + window.scrollY) + 'px';
        dropdownMenu.style.minWidth = rect.width + 'px';
        
        // 先添加到body，再显示
        document.body.appendChild(dropdownMenu);
        
        // 使用CSS class显示
        dropdownMenu.classList.add('show');
    }
    function hideDropdownMenu() {
        // 使用CSS class隐藏
        dropdownMenu.classList.remove('show');
        // 延迟还原到原位，避免DOM混乱
        setTimeout(() => {
            if (dropdownMenu.parentNode === document.body) {
        dropdown.appendChild(dropdownMenu);
            }
        }, 300);
    }
    dropdownToggle.onclick = function(e) {
        e.stopPropagation();
        showDropdownMenu();
    };
    document.body.addEventListener('click', function() {
        hideDropdownMenu();
    });

    // 消息中心功能已在 message.js 中实现，这里不需要重复代码

});

