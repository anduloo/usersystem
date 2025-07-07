// 检查URL参数中的token，写入localStorage
const urlParams = new URLSearchParams(window.location.search);
const urlToken = urlParams.get('token');
if (urlToken) {
    localStorage.setItem('jwt_token', urlToken);
    // 可选：清理URL参数，避免token泄露
    window.history.replaceState({}, document.title, window.location.pathname);
}

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwt_token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    const authHeader = { 'Authorization': `Bearer ${token}` };

    let allUsers = [];
    let allProjects = [];
    
    // 分页状态
    let userPagination = { currentPage: 1, pageSize: 20, total: 0, filteredUsers: [] };
    let projectPagination = { currentPage: 1, pageSize: 20, total: 0 };
    let adminLogPagination = { currentPage: 1, pageSize: 20, total: 0 };
    let loginLogPagination = { currentPage: 1, pageSize: 20, total: 0 };
    let accessLogPagination = { currentPage: 1, pageSize: 20, total: 0 };

    const usersTableBody = document.querySelector('#users-table tbody');
    const projectsTableBody = document.querySelector('#projects-table tbody');
    const projectModal = document.getElementById('project-modal');
    const projectForm = document.getElementById('project-form');
    const permissionsModal = document.getElementById('permissions-modal');
    const adminLogTableBody = document.querySelector('#admin-log-table tbody');
    const messageTableBody = document.querySelector('#message-table tbody');

    // 显示当前登录管理员姓名或邮箱
    let isSuperAdmin = false;
    try {
        const me = await fetch('/api/users/me', { headers: authHeader });
        if (me.ok) {
            const user = await me.json();
            document.getElementById('user-info').innerText = user.name || user.email;
            isSuperAdmin = user.isSuperAdmin;
            if (isSuperAdmin) {
                const tabSystemConfig = document.getElementById('tab-system-config');
                const systemConfigSection = document.getElementById('system-config-section');
                if (tabSystemConfig) tabSystemConfig.style.display = '';
                if (systemConfigSection) systemConfigSection.style.display = '';
            }
        } else {
            document.getElementById('user-info').innerText = '';
        }
    } catch (e) {
        document.getElementById('user-info').innerText = '';
    }

    // API请求函数
    const apiFetch = async (url, options = {}) => {
        const response = await fetch(url, {
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            ...options
        });
        if (response.status === 401 || response.status === 403) {
             localStorage.removeItem('jwt_token');
             window.location.href = '/login';
             throw new Error('认证失败');
        }
        if (!response.ok && response.status !== 204) {
             const err = await response.json();
             throw new Error(err.message || '请求失败');
        }
        return response.status === 204 ? null : response.json();
    };

    // 定时检查token状态（多端互踢）
    function startTokenCheck() {
        setInterval(async () => {
            try {
                const response = await fetch('/api/users/me', {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('jwt_token')}` }
                });
                if (response.status === 401) {
                    localStorage.removeItem('jwt_token');
                    showKickoutTipAndRedirect();
                }
            } catch (error) {
                // 静默处理网络错误，避免频繁的console输出
            }
        }, 10000);
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
            window.location.href = '/login';
        }, 1500);
    }

    // 开始定时检查
    startTokenCheck();

    // 渲染函数
    const renderUsers = async () => {
        // 搜索过滤
        const searchTerm = document.getElementById('user-search').value.toLowerCase();
        userPagination.filteredUsers = allUsers.filter(user => 
            user.email.toLowerCase().includes(searchTerm) || 
            (user.name && user.name.toLowerCase().includes(searchTerm))
        );
        
        // 分页计算
        const startIndex = (userPagination.currentPage - 1) * userPagination.pageSize;
        const endIndex = startIndex + userPagination.pageSize;
        const paginatedUsers = userPagination.filteredUsers.slice(startIndex, endIndex);
        
        // 更新分页信息
        userPagination.total = userPagination.filteredUsers.length;
        document.getElementById('user-start').textContent = startIndex + 1;
        document.getElementById('user-end').textContent = Math.min(endIndex, userPagination.total);
        document.getElementById('user-total').textContent = userPagination.total;
        
        // 渲染表格
        usersTableBody.innerHTML = '';
        for (const user of paginatedUsers) {
            // 获取用户项目数量
            let projectCount = 0;
            try {
                const userProjects = await apiFetch(`/api/users/${user.id}/projects`);
                projectCount = userProjects.length;
            } catch (e) {
                projectCount = 0;
            }
            const isSuperAdmin = user.isSuperAdmin;
            const statusHtml = user.isActive
              ? '<span style="color: #059669; font-weight: 500;">正常</span>'
              : '<span style="color: #dc2626; font-weight: 500;">已禁用</span>';
            const row = `
                <tr>
                    <td>${user.id}</td>
                    <td>${user.email}</td>
                    <td>${user.name || ''}</td>
                    <td>${user.role}</td>
                    <td>${statusHtml}</td>
                    <td><span style="color: ${projectCount > 0 ? '#059669' : '#6b7280'}; font-weight: 500;">${projectCount} 个项目</span></td>
                    <td>${new Date(user.createdAt).toLocaleString()}</td>
                    <td class="actions">
                        <button class="btn btn-primary" onclick="editUser(${user.id})">
                            <i class="fa fa-edit" style="margin-right: 0.3em;"></i>编辑
                        </button>
                        <button class="btn btn-secondary" onclick="managePermissions(${user.id})" style="${user.role === 'admin' ? 'background: #dbeafe; color: #1d4ed8; font-weight: 600;' : ''}">
                            <i class="fa fa-key" style="margin-right: 0.3em;"></i>管理权限
                        </button>
                    </td>
                </tr>`;
            usersTableBody.innerHTML += row;
        }
        
        // 更新分页控件
        updateUserPagination();
    };

    const renderProjects = () => {
        // 分页计算
        const startIndex = (projectPagination.currentPage - 1) * projectPagination.pageSize;
        const endIndex = startIndex + projectPagination.pageSize;
        const paginatedProjects = allProjects.slice(startIndex, endIndex);
        
        // 更新分页信息
        projectPagination.total = allProjects.length;
        document.getElementById('project-start').textContent = startIndex + 1;
        document.getElementById('project-end').textContent = Math.min(endIndex, projectPagination.total);
        document.getElementById('project-total').textContent = projectPagination.total;
        
        projectsTableBody.innerHTML = '';
        paginatedProjects.forEach(project => {
            const row = `
                <tr>
                    <td>${project.id}</td>
                    <td>${project.name}</td>
                    <td>${project.description || ''}</td>
                    <td>${project.url || ''}</td>
                    <td class="actions">
                        <button class="btn btn-secondary" onclick="editProject(${project.id})">编辑</button>
                        <button class="btn btn-danger" onclick="deleteProject(${project.id})">删除</button>
                    </td>
                </tr>`;
            projectsTableBody.innerHTML += row;
        });
        
        // 更新分页控件
        updateProjectPagination();
    };
    
    // 分页控件更新函数
    function updateUserPagination() {
        const totalPages = Math.ceil(userPagination.total / userPagination.pageSize);
        const pageNumbers = document.getElementById('user-page-numbers');
        const prevBtn = document.getElementById('user-prev');
        const nextBtn = document.getElementById('user-next');
        
        // 更新按钮状态
        prevBtn.disabled = userPagination.currentPage <= 1;
        nextBtn.disabled = userPagination.currentPage >= totalPages;
        
        // 生成页码按钮
        pageNumbers.innerHTML = '';
        const maxVisiblePages = 5;
        let startPage = Math.max(1, userPagination.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `btn ${i === userPagination.currentPage ? 'btn-primary' : 'btn-secondary'}`;
            pageBtn.style.padding = '0.5rem 0.8rem';
            pageBtn.style.fontSize = '0.9rem';
            pageBtn.textContent = i;
            pageBtn.onclick = () => {
                userPagination.currentPage = i;
                renderUsers();
            };
            pageNumbers.appendChild(pageBtn);
        }
    }
    
    function updateProjectPagination() {
        const totalPages = Math.ceil(projectPagination.total / projectPagination.pageSize);
        const pageNumbers = document.getElementById('project-page-numbers');
        const prevBtn = document.getElementById('project-prev');
        const nextBtn = document.getElementById('project-next');
        
        prevBtn.disabled = projectPagination.currentPage <= 1;
        nextBtn.disabled = projectPagination.currentPage >= totalPages;
        
        pageNumbers.innerHTML = '';
        const maxVisiblePages = 5;
        let startPage = Math.max(1, projectPagination.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `btn ${i === projectPagination.currentPage ? 'btn-primary' : 'btn-secondary'}`;
            pageBtn.style.padding = '0.5rem 0.8rem';
            pageBtn.style.fontSize = '0.9rem';
            pageBtn.textContent = i;
            pageBtn.onclick = () => {
                projectPagination.currentPage = i;
                renderProjects();
            };
            pageNumbers.appendChild(pageBtn);
        }
    }
    
    // 加载初始数据
    const loadInitialData = async () => {
        try {
            const [users, projects] = await Promise.all([
                apiFetch('/api/users'),
                apiFetch('/api/projects')
            ]);
            if (users && users.length > 0) {
                allUsers = users;
                // 设置全局 allUsers，供其他模块使用
                window.allUsers = allUsers;
            } else {
                console.warn('loadInitialData: users 为空，不覆盖 allUsers');
            }
            allProjects = projects;
            renderUsers();
            renderProjects();
        } catch (error) {
            alert(`加载数据失败: ${error.message}`);
        }
    };

    // --- 项目管理 ---
    window.editProject = (id) => {
        const project = allProjects.find(p => p.id === id);
        document.getElementById('project-modal-title').innerText = '编辑项目';
        document.getElementById('project-id').value = project.id;
        document.getElementById('project-name').value = project.name;
        document.getElementById('project-description').value = project.description || '';
        document.getElementById('project-url').value = project.url || '';
        projectModal.style.display = 'flex';
    };

    document.getElementById('add-project-btn').addEventListener('click', () => {
        document.getElementById('project-modal-title').innerText = '添加项目';
        projectForm.reset();
        document.getElementById('project-id').value = '';
        projectModal.style.display = 'flex';
    });
    
    document.getElementById('cancel-project-modal').addEventListener('click', () => {
         projectModal.style.display = 'none';
    });

    projectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('project-id').value;
        const data = {
            name: document.getElementById('project-name').value,
            description: document.getElementById('project-description').value,
            url: document.getElementById('project-url').value,
        };

        try {
            if (id) { // 更新
                await apiFetch(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
            } else { // 创建
                await apiFetch('/api/projects', { method: 'POST', body: JSON.stringify(data) });
            }
            projectModal.style.display = 'none';
            projectPagination.currentPage = 1; // 重置到第一页
            loadInitialData();
        } catch (error) {
            alert(`操作失败: ${error.message}`);
        }
    });

    window.deleteProject = async (id) => {
        if (!confirm('确定要删除这个项目吗？')) return;
        try {
            await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
            projectPagination.currentPage = 1; // 重置到第一页
            loadInitialData();
        } catch (error) {
            alert(`删除失败: ${error.message}`);
        }
    };

    // --- 权限管理 ---
    let currentUserId = null;
    let currentUserProjects = [];
    let pendingPermissions = new Set();
    
    window.managePermissions = async (userId) => {
        currentUserId = userId;
        const user = allUsers.find(u => u.id === userId);
        const isAdminUser = user.role === 'admin' || user.isSuperAdmin;
        
        document.getElementById('permissions-modal-title').innerText = `为 ${user.name || user.email} 分配项目权限`;
        document.getElementById('permissions-modal-subtitle').innerText = isAdminUser 
            ? `管理管理员用户的项目访问权限` 
            : `管理用户的项目访问权限`;
        
        // 获取该用户已有的权限
        try {
            currentUserProjects = await apiFetch(`/api/users/${userId}/projects`);
            pendingPermissions = new Set(currentUserProjects.map(p => p.id));
        } catch (e) {
            alert('获取用户已有权限失败: ' + e.message);
            currentUserProjects = [];
            pendingPermissions = new Set();
        }
        
        renderPermissionsList();
        updatePermissionsStats();
        permissionsModal.style.display = 'flex';
    };
    
    function renderPermissionsList() {
        let contentHtml = '';
        allProjects.forEach(project => {
            const checked = pendingPermissions.has(project.id) ? 'checked' : '';
            contentHtml += `
                <div class="permission-item" data-project-name="${project.name.toLowerCase()}">
                    <input type="checkbox" id="proj-${project.id}" onchange="togglePermission(${project.id}, this.checked)" ${checked}>
                    <label for="proj-${project.id}">
                        <strong>${project.name}</strong>
                        ${project.description ? `<br><small style="color: #6b7280;">${project.description}</small>` : ''}
                    </label>
                </div>
            `;
        });
        document.getElementById('permissions-content').innerHTML = contentHtml;
    }
    
    function updatePermissionsStats() {
        document.getElementById('assigned-count').innerText = pendingPermissions.size;
        document.getElementById('total-count').innerText = allProjects.length;
    }
    
    window.togglePermission = (projectId, assigned) => {
        if (assigned) {
            pendingPermissions.add(projectId);
        } else {
            pendingPermissions.delete(projectId);
        }
        updatePermissionsStats();
    };
    
    window.selectAllPermissions = () => {
        allProjects.forEach(project => {
            pendingPermissions.add(project.id);
            const checkbox = document.getElementById(`proj-${project.id}`);
            if (checkbox) checkbox.checked = true;
        });
        updatePermissionsStats();
    };
    
    window.clearAllPermissions = () => {
        pendingPermissions.clear();
        allProjects.forEach(project => {
            const checkbox = document.getElementById(`proj-${project.id}`);
            if (checkbox) checkbox.checked = false;
        });
        updatePermissionsStats();
    };
    
    window.filterPermissions = () => {
        const searchTerm = document.getElementById('permission-search').value.toLowerCase();
        const items = document.querySelectorAll('.permission-item');
        
        items.forEach(item => {
            const projectName = item.getAttribute('data-project-name');
            if (projectName.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    };
    
    document.getElementById('save-permissions-btn').addEventListener('click', async () => {
        if (!currentUserId) return;
        
        try {
            // 计算需要添加和删除的权限
            const currentProjectIds = new Set(currentUserProjects.map(p => p.id));
            const newProjectIds = pendingPermissions;
            
            const toAdd = Array.from(newProjectIds).filter(id => !currentProjectIds.has(id));
            const toRemove = Array.from(currentProjectIds).filter(id => !newProjectIds.has(id));
            
            // 批量处理权限变更
            const promises = [];
            
            // 添加新权限
            for (const projectId of toAdd) {
                promises.push(
                    apiFetch('/api/projects/assign', {
                method: 'POST',
                        body: JSON.stringify({ userId: currentUserId, projectId })
                    })
                );
            }
            
            // 删除旧权限
            for (const projectId of toRemove) {
                promises.push(
                    apiFetch('/api/projects/revoke', {
                        method: 'POST',
                        body: JSON.stringify({ userId: currentUserId, projectId })
                    })
                );
            }
            
            await Promise.all(promises);
            
            alert(`权限更新成功！添加了 ${toAdd.length} 个权限，删除了 ${toRemove.length} 个权限。`);
            permissionsModal.style.display = 'none';
            userPagination.currentPage = 1; // 重置到第一页
            loadInitialData(); // 重新加载数据以更新权限状态
            
        } catch (error) {
             alert(`权限操作失败: ${error.message}`);
        }
    });
    
    document.getElementById('cancel-permissions-modal').addEventListener('click', () => {
        permissionsModal.style.display = 'none';
        currentUserId = null;
        currentUserProjects = [];
        pendingPermissions.clear();
    });

    window.resetPasswordModal = (userId) => {
        // 隐藏所有其它弹窗
        document.querySelectorAll('.modal').forEach(m => {
          if (m.id !== 'reset-password-modal') m.classList.remove('show');
        });

        // 填充内容
        const user = allUsers.find(u => u.id === userId);
        document.getElementById('reset-password-modal-title').innerText = `重置 ${user.name || user.email} 的密码`;
        document.getElementById('reset-password-modal-subtitle').innerText = `为用户设置新的登录密码`;
        document.getElementById('reset-user-id').value = userId;
        document.getElementById('reset-password-form').reset();
        document.getElementById('reset-password-error').style.display = 'none';

        // 移动到body最后
        const modal = document.getElementById('reset-password-modal');
        if (modal && modal.parentNode !== document.body) {
            document.body.appendChild(modal);
        } else if (modal && document.body.lastChild !== modal) {
            document.body.appendChild(modal);
        }
        modal.classList.add('show');
        document.getElementById('reset-new-password').focus();
    };

    // 重置密码弹窗事件处理
    // 隐藏时移除 .show
        document.getElementById('cancel-reset-password-modal').addEventListener('click', () => {
            const modal = document.getElementById('reset-password-modal');
            modal.classList.remove('show');
            document.getElementById('reset-password-form').reset();
            document.getElementById('reset-password-error').style.display = 'none';
        });

    document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('reset-user-id').value;
        const newPassword = document.getElementById('reset-new-password').value.trim();
        const confirmPassword = document.getElementById('reset-confirm-password').value.trim();
        const errorDiv = document.getElementById('reset-password-error');

        // 表单验证
        if (newPassword.length < 6) {
            errorDiv.textContent = '新密码不能少于6位';
            errorDiv.style.display = 'block';
            return;
        }
        if (newPassword !== confirmPassword) {
            errorDiv.textContent = '两次输入的新密码不一致';
            errorDiv.style.display = 'block';
            return;
        }

        try {
            await apiFetch(`/api/users/${userId}/reset-password`, {
                method: 'POST',
                body: JSON.stringify({ newPassword })
            });
            
            // 成功提示
            alert('密码重置成功！');
            document.getElementById('reset-password-modal').style.display = 'none';
            document.getElementById('reset-password-form').reset();
            errorDiv.style.display = 'none';
            userPagination.currentPage = 1; // 重置到第一页
            loadInitialData(); // 刷新用户列表
            
        } catch (error) {
            errorDiv.textContent = `重置密码失败: ${error.message}`;
            errorDiv.style.display = 'block';
        }
    });

    window.deactivateUser = async (userId) => {
        if (!confirm('确定要禁用该用户吗？')) return;
        try {
            await apiFetch(`/api/users/${userId}/deactivate`, { method: 'PATCH' });
            userPagination.currentPage = 1; // 重置到第一页
            loadInitialData();
        } catch (e) {
            alert('禁用失败: ' + e.message);
        }
    };

    window.activateUser = async (userId) => {
        try {
            await apiFetch(`/api/users/${userId}/activate`, { method: 'PATCH' });
            userPagination.currentPage = 1; // 重置到第一页
            loadInitialData();
        } catch (e) {
            alert('启用失败: ' + e.message);
        }
    };

    window.setAdmin = async (userId) => {
        try {
            await apiFetch(`/api/users/${userId}/set-admin`, { method: 'PATCH' });
            userPagination.currentPage = 1; // 重置到第一页
            loadInitialData();
        } catch (e) {
            alert('设为管理员失败: ' + e.message);
        }
    };

    window.unsetAdmin = async (userId) => {
        try {
            await apiFetch(`/api/users/${userId}/unset-admin`, { method: 'PATCH' });
            userPagination.currentPage = 1; // 重置到第一页
            loadInitialData();
        } catch (e) {
            alert('取消管理员失败: ' + e.message);
        }
    };

    // --- 用户编辑功能 ---
    let currentEditUser = null;
    
    window.editUser = (userId) => {
        currentEditUser = allUsers.find(u => u.id === userId);
        if (!currentEditUser) return;
        
        // 填充表单数据
        document.getElementById('edit-user-id').value = currentEditUser.id;
        document.getElementById('edit-user-email').value = currentEditUser.email;
        document.getElementById('edit-user-name').value = currentEditUser.name || '';
        
        // 更新弹窗标题
        document.getElementById('user-edit-modal-title').innerText = `编辑用户 - ${currentEditUser.name || currentEditUser.email}`;
        
        // 更新按钮状态
        updateEditButtons();
        
        // 显示弹窗
        document.getElementById('user-edit-modal').style.display = 'flex';
        document.getElementById('user-edit-error').style.display = 'none';
    };
    
    function updateEditButtons() {
        if (!currentEditUser) return;
        
        const isSuperAdmin = currentEditUser.isSuperAdmin;
        const statusBtn = document.getElementById('edit-toggle-status-btn');
        const adminBtn = document.getElementById('edit-toggle-admin-btn');
        const resetBtn = document.getElementById('edit-reset-password-btn');
        
        // 重置密码按钮
        if (isSuperAdmin) {
            resetBtn.disabled = true;
            resetBtn.style.opacity = '0.5';
            resetBtn.innerHTML = '<i class="fa fa-key" style="margin-right: 0.5rem;"></i>主管理员不可重置';
        } else {
            resetBtn.disabled = false;
            resetBtn.style.opacity = '1';
            resetBtn.innerHTML = '<i class="fa fa-key" style="margin-right: 0.5rem;"></i>重置密码';
        }
        
        // 状态切换按钮
        if (isSuperAdmin) {
            statusBtn.disabled = true;
            statusBtn.style.opacity = '0.5';
            document.getElementById('edit-status-text').innerText = '主管理员不可禁用';
        } else {
            statusBtn.disabled = false;
            statusBtn.style.opacity = '1';
            document.getElementById('edit-status-text').innerText = currentEditUser.isActive ? '禁用用户' : '启用用户';
        }
        
        // 管理员切换按钮
        if (isSuperAdmin) {
            adminBtn.disabled = true;
            adminBtn.style.opacity = '0.5';
            document.getElementById('edit-admin-text').innerText = '主管理员';
        } else {
            adminBtn.disabled = false;
            adminBtn.style.opacity = '1';
            document.getElementById('edit-admin-text').innerText = currentEditUser.role === 'admin' ? '取消管理员' : '设为管理员';
        }
    }
    
    // 用户编辑弹窗事件绑定
    document.getElementById('cancel-user-edit-modal').onclick = function() {
        document.getElementById('user-edit-modal').style.display = 'none';
        currentEditUser = null;
    };
    
    // 重置密码按钮
    document.getElementById('edit-reset-password-btn').onclick = function() {
        if (!currentEditUser || currentEditUser.isSuperAdmin) return;
        resetPasswordModal(currentEditUser.id);
    };
    
    // 状态切换按钮
    document.getElementById('edit-toggle-status-btn').onclick = async function() {
        if (!currentEditUser || currentEditUser.isSuperAdmin) return;
        
        try {
            if (currentEditUser.isActive) {
                await apiFetch(`/api/users/${currentEditUser.id}/deactivate`, { method: 'PATCH' });
                currentEditUser.isActive = false;
            } else {
                await apiFetch(`/api/users/${currentEditUser.id}/activate`, { method: 'PATCH' });
                currentEditUser.isActive = true;
            }
            updateEditButtons();
            userPagination.currentPage = 1; // 重置到第一页
            loadInitialData(); // 刷新用户列表
        } catch (e) {
            alert('操作失败: ' + e.message);
        }
    };
    
    // 管理员切换按钮
    document.getElementById('edit-toggle-admin-btn').onclick = async function() {
        if (!currentEditUser || currentEditUser.isSuperAdmin) return;
        
        try {
            if (currentEditUser.role === 'admin') {
                await apiFetch(`/api/users/${currentEditUser.id}/unset-admin`, { method: 'PATCH' });
                currentEditUser.role = 'user';
            } else {
                await apiFetch(`/api/users/${currentEditUser.id}/set-admin`, { method: 'PATCH' });
                currentEditUser.role = 'admin';
            }
            updateEditButtons();
            userPagination.currentPage = 1; // 重置到第一页
            loadInitialData(); // 刷新用户列表
        } catch (e) {
            alert('操作失败: ' + e.message);
        }
    };
    
    // 保存用户信息
    document.getElementById('user-edit-form').onsubmit = async function(e) {
        e.preventDefault();
        if (!currentEditUser) return;
        
        const newName = document.getElementById('edit-user-name').value.trim();
        const errorDiv = document.getElementById('user-edit-error');
        
        try {
            await apiFetch(`/api/users/${currentEditUser.id}`, {
                method: 'PUT',
                body: JSON.stringify({ name: newName })
            });
            
            alert('用户信息更新成功！');
            document.getElementById('user-edit-modal').style.display = 'none';
            currentEditUser = null;
            userPagination.currentPage = 1; // 重置到第一页
            loadInitialData(); // 刷新用户列表
            
        } catch (error) {
            errorDiv.textContent = `更新失败: ${error.message}`;
            errorDiv.style.display = 'block';
        }
    };

    document.getElementById('edit-delete-user-btn').onclick = async function() {
        if (!currentEditUser || currentEditUser.isSuperAdmin) return;
        if (!confirm('确定要删除该用户吗？此操作不可恢复！')) return;
        try {
            await apiFetch(`/api/users/${currentEditUser.id}`, { method: 'DELETE' });
            alert('用户已删除！');
            document.getElementById('user-edit-modal').style.display = 'none';
            currentEditUser = null;
            userPagination.currentPage = 1; // 重置到第一页
            loadInitialData(); // 刷新用户列表
        } catch (e) {
            alert('删除失败: ' + e.message);
        }
    };

    // Tab 按钮
    const tabDashboard = document.getElementById('tab-dashboard');
    const tabUsers = document.getElementById('tab-users');
    const tabProjects = document.getElementById('tab-projects');
    const tabMessages = document.getElementById('tab-messages');
    const tabLogs = document.getElementById('tab-logs');
    const tabLoginLogs = document.getElementById('tab-login-logs');
    const tabAccessLogs = document.getElementById('tab-access-logs');
    const tabSystemConfig = document.getElementById('tab-system-config');
    const dashboardSection = document.getElementById('dashboard-section');
    const userSection = document.getElementById('user-management');
    const projectSection = document.getElementById('project-management');
    const messageSection = document.getElementById('message-center-section');
    const adminLogSection = document.getElementById('admin-log-section');
    const loginLogSection = document.getElementById('login-log-section');
    const accessLogSection = document.getElementById('access-log-section');
    const systemConfigSection = document.getElementById('system-config-section');

    // 登录日志和访问日志渲染
    const loginLogUserSelect = document.getElementById('login-log-user-select');
    const accessLogUserSelect = document.getElementById('access-log-user-select');
    const loginLogTableBody = document.querySelector('#login-log-table tbody');
    const accessLogTableBody = document.querySelector('#access-log-table tbody');
    let allUsersForLogs = [];
    let allProjectsForLogs = [];
    // 加载用户和项目下拉
    async function loadUsersForLogs() {
        allUsersForLogs = await apiFetch('/api/users');
        allProjectsForLogs = await apiFetch('/api/projects');
        [loginLogUserSelect, accessLogUserSelect].forEach(select => {
            select.innerHTML = '<option value="">全部</option>' + allUsersForLogs.map(u => `<option value="${u.id}">${u.name || u.email}</option>`).join('');
        });
    }
    // 渲染登录日志
    async function renderLoginLogs() {
        const userId = loginLogUserSelect.value;
        const url = userId ? `/api/users/admin/user-login-logs?userId=${userId}` : '/api/users/admin/user-login-logs';
        const logs = await apiFetch(url);
        
        // 分页计算
        const startIndex = (loginLogPagination.currentPage - 1) * loginLogPagination.pageSize;
        const endIndex = startIndex + loginLogPagination.pageSize;
        const paginatedLogs = logs.slice(startIndex, endIndex);
        
        // 更新分页信息
        loginLogPagination.total = logs.length;
        document.getElementById('login-log-start').textContent = startIndex + 1;
        document.getElementById('login-log-end').textContent = Math.min(endIndex, loginLogPagination.total);
        document.getElementById('login-log-total').textContent = loginLogPagination.total;
        
        loginLogTableBody.innerHTML = paginatedLogs.map(log => {
            const user = allUsersForLogs.find(u => u.id === log.userId);
            return `<tr><td>${user ? (user.name || user.email) : log.userId}</td><td>${new Date(log.createdAt).toLocaleString()}</td><td>${log.city || ''}</td><td>${log.ip || ''}</td></tr>`;
        }).join('');
        
        // 更新分页控件
        updateLoginLogPagination();
    }
    // 渲染访问日志
    async function renderAccessLogs() {
        const userId = accessLogUserSelect.value;
        const url = userId ? `/api/users/admin/user-project-access-logs?userId=${userId}` : '/api/users/admin/user-project-access-logs';
        const logs = await apiFetch(url);
        const filteredLogs = logs.filter(log => log.projectId !== 0);
        
        // 分页计算
        const startIndex = (accessLogPagination.currentPage - 1) * accessLogPagination.pageSize;
        const endIndex = startIndex + accessLogPagination.pageSize;
        const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
        
        // 更新分页信息
        accessLogPagination.total = filteredLogs.length;
        document.getElementById('access-log-start').textContent = startIndex + 1;
        document.getElementById('access-log-end').textContent = Math.min(endIndex, accessLogPagination.total);
        document.getElementById('access-log-total').textContent = accessLogPagination.total;
        
        accessLogTableBody.innerHTML = paginatedLogs.map(log => {
                const user = allUsersForLogs.find(u => u.id === log.userId);
                return `<tr><td>${user ? (user.name || user.email) : log.userId}</td><td>${new Date(log.createdAt).toLocaleString()}</td><td>${log.projectName || log.projectId}</td><td>${log.ip || ''}</td><td>${log.city || ''}</td></tr>`;
            }).join('');
        
        // 更新分页控件
        updateAccessLogPagination();
    }
    // 下拉和Tab事件绑定
    loginLogUserSelect.onchange = () => {
        loginLogPagination.currentPage = 1; // 重置到第一页
        renderLoginLogs();
    };
    accessLogUserSelect.onchange = () => {
        accessLogPagination.currentPage = 1; // 重置到第一页
        renderAccessLogs();
    };
    
    // 日志分页控件更新函数
    function updateLoginLogPagination() {
        const totalPages = Math.ceil(loginLogPagination.total / loginLogPagination.pageSize);
        const pageNumbers = document.getElementById('login-log-page-numbers');
        const prevBtn = document.getElementById('login-log-prev');
        const nextBtn = document.getElementById('login-log-next');
        
        prevBtn.disabled = loginLogPagination.currentPage <= 1;
        nextBtn.disabled = loginLogPagination.currentPage >= totalPages;
        
        pageNumbers.innerHTML = '';
        const maxVisiblePages = 5;
        let startPage = Math.max(1, loginLogPagination.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `btn ${i === loginLogPagination.currentPage ? 'btn-primary' : 'btn-secondary'}`;
            pageBtn.style.padding = '0.5rem 0.8rem';
            pageBtn.style.fontSize = '0.9rem';
            pageBtn.textContent = i;
            pageBtn.onclick = () => {
                loginLogPagination.currentPage = i;
                renderLoginLogs();
            };
            pageNumbers.appendChild(pageBtn);
        }
    }
    
    function updateAccessLogPagination() {
        const totalPages = Math.ceil(accessLogPagination.total / accessLogPagination.pageSize);
        const pageNumbers = document.getElementById('access-log-page-numbers');
        const prevBtn = document.getElementById('access-log-prev');
        const nextBtn = document.getElementById('access-log-next');
        
        prevBtn.disabled = accessLogPagination.currentPage <= 1;
        nextBtn.disabled = accessLogPagination.currentPage >= totalPages;
        
        pageNumbers.innerHTML = '';
        const maxVisiblePages = 5;
        let startPage = Math.max(1, accessLogPagination.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `btn ${i === accessLogPagination.currentPage ? 'btn-primary' : 'btn-secondary'}`;
            pageBtn.style.padding = '0.5rem 0.8rem';
            pageBtn.style.fontSize = '0.9rem';
            pageBtn.textContent = i;
            pageBtn.onclick = () => {
                accessLogPagination.currentPage = i;
                renderAccessLogs();
            };
            pageNumbers.appendChild(pageBtn);
        }
    }
    
    // 日志分页事件绑定
    document.getElementById('login-log-page-size').addEventListener('change', (e) => {
        loginLogPagination.pageSize = parseInt(e.target.value);
        loginLogPagination.currentPage = 1;
        renderLoginLogs();
    });
    
    document.getElementById('login-log-prev').addEventListener('click', () => {
        if (loginLogPagination.currentPage > 1) {
            loginLogPagination.currentPage--;
            renderLoginLogs();
        }
    });
    
    document.getElementById('login-log-next').addEventListener('click', () => {
        const totalPages = Math.ceil(loginLogPagination.total / loginLogPagination.pageSize);
        if (loginLogPagination.currentPage < totalPages) {
            loginLogPagination.currentPage++;
            renderLoginLogs();
        }
    });
    
    document.getElementById('access-log-page-size').addEventListener('change', (e) => {
        accessLogPagination.pageSize = parseInt(e.target.value);
        accessLogPagination.currentPage = 1;
        renderAccessLogs();
    });
    
    document.getElementById('access-log-prev').addEventListener('click', () => {
        if (accessLogPagination.currentPage > 1) {
            accessLogPagination.currentPage--;
            renderAccessLogs();
        }
    });
    
    document.getElementById('access-log-next').addEventListener('click', () => {
        const totalPages = Math.ceil(accessLogPagination.total / accessLogPagination.pageSize);
        if (accessLogPagination.currentPage < totalPages) {
            accessLogPagination.currentPage++;
            renderAccessLogs();
        }
    });

    // Dashboard数据渲染
    let projectAccessChart = null;
    let userLoginChart = null;
    let cityLoginChart = null;
    
    async function loadDashboardStats() {
        const startDate = document.getElementById('dashboard-start-date').value;
        const endDate = document.getElementById('dashboard-end-date').value;
        
        let url = '/api/users/admin/dashboard-stats';
        const params = new URLSearchParams();
        if (startDate && endDate) {
            params.append('startDate', startDate);
            params.append('endDate', endDate);
        }
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const stats = await apiFetch(url);
        document.getElementById('stat-user-count').innerText = stats.userCount;
        document.getElementById('stat-project-count').innerText = stats.projectCount;
        
        // 项目访问次数柱状图
        const projectMap = {};
        stats.projects.forEach(p => { projectMap[p.id] = p.name; });
        const projectAccessData = stats.projectAccess
            .filter(pa => pa.projectId !== 0)
            .slice(0, 10) // 只显示前10个
            .map(pa => ({
                label: projectMap[pa.projectId] || `项目${pa.projectId}`,
                value: pa._count.projectId
            }));
        renderBarChart('project-access-chart', projectAccessData, '项目访问次数', '访问次数');
        
        // 用户登录次数柱状图
        const userMap = {};
        stats.users.forEach(u => { userMap[u.id] = u.name || u.email; });
        const userLoginData = stats.userLogin
            .slice(0, 10) // 只显示前10个
            .map(ul => ({
                label: userMap[ul.userId] || `用户${ul.userId}`,
                value: ul._count.userId
            }));
        renderBarChart('user-login-chart', userLoginData, '用户登录次数', '登录次数');
        
        // 城市登录次数柱状图
        const cityLoginData = stats.cityLogin
            .filter(cl => cl.city && cl.city !== '')
            .slice(0, 10) // 只显示前10个
            .map(cl => ({
                label: cl.city,
                value: cl._count.city
            }));
        renderBarChart('city-login-chart', cityLoginData, '城市登录次数', '登录次数');
    }
    
    // 渲染柱状图函数
    function renderBarChart(canvasId, data, title, yAxisLabel) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        // 销毁现有图表
        const existingChart = window[canvasId.replace('-', '') + 'Chart'];
        if (existingChart) {
            existingChart.destroy();
        }
        
        // 生成渐变色
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(102, 126, 234, 0.8)');
        gradient.addColorStop(1, 'rgba(118, 75, 162, 0.6)');
        
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(item => item.label),
                datasets: [{
                    label: yAxisLabel,
                    data: data.map(item => item.value),
                    backgroundColor: gradient,
                    borderColor: 'rgba(102, 126, 234, 0.8)',
                    borderWidth: 1,
                    borderRadius: 4,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: false
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(102, 126, 234, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: 'var(--muted)',
                            font: {
                                size: 11
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: 'var(--muted)',
                            font: {
                                size: 10
                            },
                            maxRotation: 45,
                            minRotation: 0
                        }
                    }
                },
                elements: {
                    bar: {
                        borderSkipped: false,
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeInOutQuart'
                }
            }
        });
        
        // 保存图表实例
        window[canvasId.replace('-', '') + 'Chart'] = chart;
    }

    // 渲染操作日志
    async function renderAdminLogs() {
        const logs = await apiFetch('/api/users/admin-logs');
        
        // 分页计算
        const startIndex = (adminLogPagination.currentPage - 1) * adminLogPagination.pageSize;
        const endIndex = startIndex + adminLogPagination.pageSize;
        const paginatedLogs = logs.slice(startIndex, endIndex);
        
        // 更新分页信息
        adminLogPagination.total = logs.length;
        document.getElementById('admin-log-start').textContent = startIndex + 1;
        document.getElementById('admin-log-end').textContent = Math.min(endIndex, adminLogPagination.total);
        document.getElementById('admin-log-total').textContent = adminLogPagination.total;
        
        adminLogTableBody.innerHTML = paginatedLogs.map(log => `
            <tr>
                <td>${new Date(log.createdAt).toLocaleString()}</td>
                <td>${log.adminName || log.adminId}</td>
                <td>${log.action}</td>
                <td>${log.objectType || ''}</td>
                <td>${log.objectName || log.objectId || ''}</td>
                <td>${log.details || ''}</td>
            </tr>
        `).join('');
        
        // 更新分页控件
        updateAdminLogPagination();
    }
    
    // 操作日志分页控件更新函数
    function updateAdminLogPagination() {
        const totalPages = Math.ceil(adminLogPagination.total / adminLogPagination.pageSize);
        const pageNumbers = document.getElementById('admin-log-page-numbers');
        const prevBtn = document.getElementById('admin-log-prev');
        const nextBtn = document.getElementById('admin-log-next');
        
        prevBtn.disabled = adminLogPagination.currentPage <= 1;
        nextBtn.disabled = adminLogPagination.currentPage >= totalPages;
        
        pageNumbers.innerHTML = '';
        const maxVisiblePages = 5;
        let startPage = Math.max(1, adminLogPagination.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `btn ${i === adminLogPagination.currentPage ? 'btn-primary' : 'btn-secondary'}`;
            pageBtn.style.padding = '0.5rem 0.8rem';
            pageBtn.style.fontSize = '0.9rem';
            pageBtn.textContent = i;
            pageBtn.onclick = () => {
                adminLogPagination.currentPage = i;
                renderAdminLogs();
            };
            pageNumbers.appendChild(pageBtn);
        }
    }
    
    // 操作日志分页事件绑定
    document.getElementById('admin-log-page-size').addEventListener('change', (e) => {
        adminLogPagination.pageSize = parseInt(e.target.value);
        adminLogPagination.currentPage = 1;
        renderAdminLogs();
    });
    
    document.getElementById('admin-log-prev').addEventListener('click', () => {
        if (adminLogPagination.currentPage > 1) {
            adminLogPagination.currentPage--;
            renderAdminLogs();
        }
    });
    
    document.getElementById('admin-log-next').addEventListener('click', () => {
        const totalPages = Math.ceil(adminLogPagination.total / adminLogPagination.pageSize);
        if (adminLogPagination.currentPage < totalPages) {
            adminLogPagination.currentPage++;
            renderAdminLogs();
        }
    });

    // --- 初始化 ---
    loadInitialData();
    loadDashboardStats();

    // Dashboard筛选按钮事件绑定
    document.getElementById('dashboard-filter-btn').addEventListener('click', () => {
        loadDashboardStats();
    });
    
    document.getElementById('dashboard-reset-btn').addEventListener('click', () => {
        document.getElementById('dashboard-start-date').value = '';
        document.getElementById('dashboard-end-date').value = '';
        loadDashboardStats();
    });

    // 用户搜索和分页事件绑定
    document.getElementById('user-search').addEventListener('input', () => {
        userPagination.currentPage = 1; // 重置到第一页
        renderUsers();
    });
    
    document.getElementById('user-page-size').addEventListener('change', (e) => {
        userPagination.pageSize = parseInt(e.target.value);
        userPagination.currentPage = 1;
        renderUsers();
    });
    
    document.getElementById('user-prev').addEventListener('click', () => {
        if (userPagination.currentPage > 1) {
            userPagination.currentPage--;
            renderUsers();
        }
    });
    
    document.getElementById('user-next').addEventListener('click', () => {
        const totalPages = Math.ceil(userPagination.total / userPagination.pageSize);
        if (userPagination.currentPage < totalPages) {
            userPagination.currentPage++;
            renderUsers();
        }
    });
    
    // 项目分页事件绑定
    document.getElementById('project-page-size').addEventListener('change', (e) => {
        projectPagination.pageSize = parseInt(e.target.value);
        projectPagination.currentPage = 1;
        renderProjects();
    });
    
    document.getElementById('project-prev').addEventListener('click', () => {
        if (projectPagination.currentPage > 1) {
            projectPagination.currentPage--;
            renderProjects();
        }
    });
    
    document.getElementById('project-next').addEventListener('click', () => {
        const totalPages = Math.ceil(projectPagination.total / projectPagination.pageSize);
        if (projectPagination.currentPage < totalPages) {
            projectPagination.currentPage++;
            renderProjects();
        }
    });

    // 顶部栏下拉菜单逻辑
    const dropdownToggle = document.getElementById('admin-dropdown').querySelector('.dropdown-toggle');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const dropdown = document.getElementById('admin-dropdown');
    
    dropdownToggle.onclick = function(e) {
        e.stopPropagation();
        dropdown.classList.toggle('active');
        dropdownMenu.classList.toggle('show');
    };
    
    document.body.addEventListener('click', function() {
        dropdown.classList.remove('active');
        dropdownMenu.classList.remove('show');
    });

     // Tab切换逻辑扩展
    const tabMapExt = [
      {tab: tabDashboard, section: dashboardSection, title: 'Dashboard', async: false},
      {tab: tabUsers, section: userSection, title: '用户管理', async: false},
      {tab: tabProjects, section: projectSection, title: '项目管理', async: false},
      {tab: tabMessages, section: messageSection, title: '消息管理', async: true},
      {tab: tabLogs, section: adminLogSection, title: '操作日志', async: false},
      {tab: tabLoginLogs, section: loginLogSection, title: '登录日志', async: true},
      {tab: tabAccessLogs, section: accessLogSection, title: '访问日志', async: true}
    ];
    function switchTabExt(idx) {
      if (systemConfigSection) systemConfigSection.style.display = 'none';
      tabMapExt.forEach((item, i) => {
        if (item.tab) item.tab.classList.remove('nav-item-active');
        if (item.section) item.section.style.display = 'none';
      });
      if (tabMapExt[idx].tab) tabMapExt[idx].tab.classList.add('nav-item-active');
      if (tabMapExt[idx].section) tabMapExt[idx].section.style.display = 'block';
      document.getElementById('pageTitle').innerText = tabMapExt[idx].title;
      if (tabMapExt[idx].async && idx === 3) {
        // 消息管理由 message.js 处理，这里不需要调用 loadMessages
        // loadMessages();
      } else if (tabMapExt[idx].async && idx === 5) {
        loadUsersForLogs().then(renderLoginLogs);
      } else if (tabMapExt[idx].async && idx === 6) {
        loadUsersForLogs().then(renderAccessLogs);
      } else if (idx === 4) {
        renderAdminLogs();
      }
    }
    tabMapExt.forEach((item, idx) => {
      if (item.tab) {
        item.tab.onclick = (e) => {
          e.preventDefault();
          if (idx === 0) loadDashboardStats();
          switchTabExt(idx);
        };
      }
    });
    switchTabExt(0);

    // 系统配置管理逻辑
    const allSections = document.querySelectorAll('main > section');
    if (tabSystemConfig && systemConfigSection) {
      tabSystemConfig.onclick = function(e) {
        e.preventDefault();
        allSections.forEach(s => s.style.display = 'none');
        systemConfigSection.style.display = '';
        document.getElementById('pageTitle').innerText = '系统配置';
        loadSystemConfigs();
        // 取消其他tab高亮
        document.querySelectorAll('.sidebar-menu-item').forEach(item => item.classList.remove('nav-item-active'));
        tabSystemConfig.classList.add('nav-item-active');
      };
    }
    // 加载系统配置（只回显表单字段）
    async function loadSystemConfigs() {
        try {
            const configs = await apiFetch('/api/configs');
            const configMap = {};
            configs.forEach(cfg => configMap[cfg.key] = cfg.value);
            
            // 邮件配置元素
            const mailHost = document.getElementById('mail-host');
            const mailPort = document.getElementById('mail-port');
            const mailSecure = document.getElementById('mail-secure');
            const mailUser = document.getElementById('mail-user');
            const mailPass = document.getElementById('mail-pass');
            const mailFrom = document.getElementById('mail-from');
            
            // 微信配置元素
            const wxAppid = document.getElementById('wx-appid');
            const wxSecret = document.getElementById('wx-secret');
            const wxToken = document.getElementById('wx-token');
            const wxAeskey = document.getElementById('wx-aeskey');
            
            // 模板元素
            const welcomeTemplate = document.getElementById('welcome-mail-template');
            const resetPasswordTemplate = document.getElementById('reset-password-mail-template');
            
            // 邮件配置赋值
            if (mailHost) mailHost.value = configMap['mail_host'] || '';
            if (mailPort) mailPort.value = configMap['mail_port'] || '';
            if (mailSecure) mailSecure.value = configMap['mail_secure'] || '';
            if (mailUser) mailUser.value = configMap['mail_user'] || '';
            if (mailPass) mailPass.value = configMap['mail_pass'] || '';
            if (mailFrom) mailFrom.value = configMap['mail_from'] || '';
            
            // 微信配置赋值
            if (wxAppid) wxAppid.value = configMap['wx_appid'] || '';
            if (wxSecret) wxSecret.value = configMap['wx_secret'] || '';
            if (wxToken) wxToken.value = configMap['wx_token'] || '';
            if (wxAeskey) wxAeskey.value = configMap['wx_aeskey'] || '';
            
            // 模板赋值
            if (welcomeTemplate) welcomeTemplate.value = configMap['welcome_mail_template'] || getDefaultWelcomeTemplate();
            if (resetPasswordTemplate) resetPasswordTemplate.value = configMap['reset_password_mail_template'] || getDefaultResetPasswordTemplate();
        } catch (e) {
            alert('加载系统配置失败: ' + e.message);
        }
    }
        // 微信公众号配置测试逻辑
    const wechatTestBtn = document.getElementById('wechat-test-btn');
    if (wechatTestBtn) {
      wechatTestBtn.onclick = async () => {
        const appid = document.getElementById('wx-appid')?.value?.trim() || '';
        const secret = document.getElementById('wx-secret')?.value?.trim() || '';
        const token = document.getElementById('wx-token')?.value?.trim() || '';
        const aeskey = document.getElementById('wx-aeskey')?.value?.trim() || '';
        const resultDiv = document.getElementById('wechat-test-result');
        
        if (!resultDiv) {
          alert('找不到测试结果元素');
          return;
        }
        
        if (!appid || !secret) {
          resultDiv.style.display = 'block';
          resultDiv.style.color = '#e53e3e';
          resultDiv.textContent = '请先填写AppID和AppSecret';
          return;
        }
        
        resultDiv.style.display = 'block';
        resultDiv.style.color = '#888';
        resultDiv.textContent = '正在测试连接...';
        
        const wechatSaveBtn = document.getElementById('wechat-save-btn');
        if (wechatSaveBtn) wechatSaveBtn.disabled = true;
        
        try {
          const res = await apiFetch('/api/configs/test-wechat', {
            method: 'POST',
            body: JSON.stringify({ appid, secret, token, aeskey })
          });
          
          if (res && res.success) {
            resultDiv.style.color = '#059669';
            resultDiv.textContent = res.message || '测试连接成功！';
            if (wechatSaveBtn) wechatSaveBtn.disabled = false;
          } else {
            resultDiv.style.color = '#e53e3e';
            resultDiv.textContent = (res && res.message) ? ('测试连接失败：' + res.message) : '测试连接失败';
            if (wechatSaveBtn) wechatSaveBtn.disabled = true;
          }
        } catch (e) {
          resultDiv.style.color = '#e53e3e';
          resultDiv.textContent = '测试连接失败：' + e.message;
          if (wechatSaveBtn) wechatSaveBtn.disabled = true;
        }
      };
    }
    const wechatConfigForm = document.getElementById('wechat-config-form');
    if (wechatConfigForm) {
      wechatConfigForm.onsubmit = async function(e) {
        e.preventDefault();
        const wechatSaveBtn = document.getElementById('wechat-save-btn');
        if (wechatSaveBtn && wechatSaveBtn.disabled) return;
        
        // 保存到系统配置
        const data = [
          { key: 'wx_appid', value: document.getElementById('wx-appid')?.value?.trim() || '' },
          { key: 'wx_secret', value: document.getElementById('wx-secret')?.value?.trim() || '' },
          { key: 'wx_token', value: document.getElementById('wx-token')?.value?.trim() || '' },
          { key: 'wx_aeskey', value: document.getElementById('wx-aeskey')?.value?.trim() || '' }
        ];
        try {
          for (const item of data) {
            await apiFetch('/api/configs', { method: 'POST', body: JSON.stringify(item) });
          }
          alert('保存成功！');
          loadSystemConfigs();
        } catch (e) {
          alert('保存失败：' + e.message);
        }
      };
    }

    const mailConfigForm = document.getElementById('mail-config-form');
    if (mailConfigForm) {
      mailConfigForm.onsubmit = async function(e) {
        e.preventDefault();
        const mailSaveBtn = document.getElementById('mail-save-btn');
        if (mailSaveBtn && mailSaveBtn.disabled) return;
        
        const host = document.getElementById('mail-host')?.value?.trim() || '';
        const port = document.getElementById('mail-port')?.value?.trim() || '';
        const secure = document.getElementById('mail-secure')?.value?.trim() || '';
        const user = document.getElementById('mail-user')?.value?.trim() || '';
        const pass = document.getElementById('mail-pass')?.value?.trim() || '';
        const from = document.getElementById('mail-from')?.value?.trim() || '';
        const resultDiv = document.getElementById('mail-test-result');
        
        if (resultDiv) {
          resultDiv.style.display = 'block';
          resultDiv.style.color = '#888';
          resultDiv.textContent = '正在保存...';
        }
        
        try {
          // 你可以按需调整接口和参数
          await apiFetch('/api/configs', { method: 'POST', body: JSON.stringify({ key: 'mail_host', value: host }) });
          await apiFetch('/api/configs', { method: 'POST', body: JSON.stringify({ key: 'mail_port', value: port }) });
          await apiFetch('/api/configs', { method: 'POST', body: JSON.stringify({ key: 'mail_secure', value: secure }) });
          await apiFetch('/api/configs', { method: 'POST', body: JSON.stringify({ key: 'mail_user', value: user }) });
          await apiFetch('/api/configs', { method: 'POST', body: JSON.stringify({ key: 'mail_pass', value: pass }) });
          await apiFetch('/api/configs', { method: 'POST', body: JSON.stringify({ key: 'mail_from', value: from }) });
          
          if (resultDiv) {
            resultDiv.style.color = '#059669';
            resultDiv.textContent = '保存成功！';
          }
        } catch (e) {
          if (resultDiv) {
            resultDiv.style.color = '#e53e3e';
            resultDiv.textContent = '保存失败：' + e.message;
          }
        }
      };
    }

    document.getElementById('mail-test-btn').onclick = async function() {
      const resultDiv = document.getElementById('mail-test-result');
      if (!resultDiv) {
        alert('找不到 mail-test-result 元素');
        return;
      }
      resultDiv.style.display = 'block';
      resultDiv.style.color = '#888';
      resultDiv.textContent = '正在测试发送...';
      try {
        let secure = document.getElementById('mail-secure')?.value?.trim() || '';
        // 只允许 'ssl' 或 'none'
        if (secure !== 'ssl' && secure !== 'none') secure = 'none';
        const res = await apiFetch('/api/configs/test-mail', {
          method: 'POST',
          body: JSON.stringify({
            host: document.getElementById('mail-host')?.value?.trim() || '',
            port: document.getElementById('mail-port')?.value?.trim() || '',
            secure: secure,
            user: document.getElementById('mail-user')?.value?.trim() || '',
            pass: document.getElementById('mail-pass')?.value?.trim() || '',
            from: document.getElementById('mail-from')?.value?.trim() || '',
            to: document.getElementById('mail-test-to')?.value?.trim() || ''
          })
        });
        if (res && res.success) {
          resultDiv.style.color = '#059669';
          resultDiv.textContent = res.message || '测试发送成功！';
        } else {
          resultDiv.style.color = '#e53e3e';
          resultDiv.textContent = (res && res.message) ? ('测试发送失败：' + res.message) : '测试发送失败';
        }
      } catch (e) {
        resultDiv.style.color = '#e53e3e';
        resultDiv.textContent = '测试发送失败：' + e.message;
      }
    };

    // 邮件配置编辑/保存/取消逻辑
    function setMailFormReadonly(readonly) {
      ['mail-host', 'mail-port', 'mail-user', 'mail-pass', 'mail-secure'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.tagName === 'SELECT') {
          el.disabled = readonly;
        } else if (el) {
          el.readOnly = readonly;
        }
      });
    }
    function showMailTestFields(show) {
      const mailTestFields = document.getElementById('mail-test-fields');
      if (mailTestFields) {
        mailTestFields.style.display = show ? '' : 'none';
      }
    }
    
    const mailEditBtn = document.getElementById('mail-edit-btn');
    if (mailEditBtn) {
      mailEditBtn.onclick = function() {
        setMailFormReadonly(false);
        this.style.display = 'none';
        const mailSaveBtn = document.getElementById('mail-save-btn');
        const mailCancelBtn = document.getElementById('mail-cancel-btn');
        if (mailSaveBtn) mailSaveBtn.style.display = '';
        if (mailCancelBtn) mailCancelBtn.style.display = '';
        showMailTestFields(true);
      };
    }
    
    const mailCancelBtn = document.getElementById('mail-cancel-btn');
    if (mailCancelBtn) {
      mailCancelBtn.onclick = function() {
        setMailFormReadonly(true);
        this.style.display = 'none';
        const mailSaveBtn = document.getElementById('mail-save-btn');
        const mailEditBtn = document.getElementById('mail-edit-btn');
        if (mailSaveBtn) mailSaveBtn.style.display = 'none';
        if (mailEditBtn) mailEditBtn.style.display = '';
        showMailTestFields(false);
        // 重新加载配置
        if (typeof loadSystemConfigs === 'function') loadSystemConfigs();
      };
    }
    
    const mailSaveBtn = document.getElementById('mail-save-btn');
    if (mailSaveBtn) {
      mailSaveBtn.onclick = function() {
        const mailConfigForm = document.getElementById('mail-config-form');
        if (mailConfigForm) {
          mailConfigForm.dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
        }
      };
    }
    
    setMailFormReadonly(true);
    showMailTestFields(false);

    // 微信配置编辑/保存/取消逻辑
    function setWechatFormReadonly(readonly) {
      ['wx-appid', 'wx-secret', 'wx-token', 'wx-aeskey'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.readOnly = readonly;
        }
      });
    }
    
    const wechatEditBtn = document.getElementById('wechat-edit-btn');
    if (wechatEditBtn) {
      wechatEditBtn.onclick = function() {
        setWechatFormReadonly(false);
        this.style.display = 'none';
        const wechatSaveBtn = document.getElementById('wechat-save-btn');
        const wechatCancelBtn = document.getElementById('wechat-cancel-btn');
        if (wechatSaveBtn) wechatSaveBtn.style.display = '';
        if (wechatCancelBtn) wechatCancelBtn.style.display = '';
      };
    }
    
    const wechatCancelBtn = document.getElementById('wechat-cancel-btn');
    if (wechatCancelBtn) {
      wechatCancelBtn.onclick = function() {
        setWechatFormReadonly(true);
        this.style.display = 'none';
        const wechatSaveBtn = document.getElementById('wechat-save-btn');
        const wechatEditBtn = document.getElementById('wechat-edit-btn');
        if (wechatSaveBtn) wechatSaveBtn.style.display = 'none';
        if (wechatEditBtn) wechatEditBtn.style.display = '';
        // 重新加载配置
        if (typeof loadSystemConfigs === 'function') loadSystemConfigs();
      };
    }
    
    const wechatSaveBtn = document.getElementById('wechat-save-btn');
    if (wechatSaveBtn) {
      wechatSaveBtn.onclick = function() {
        const wechatConfigForm = document.getElementById('wechat-config-form');
        if (wechatConfigForm) {
          wechatConfigForm.dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
        }
      };
    }
    
    setWechatFormReadonly(true);

    // 保存后自动只读、按钮切换
    if (mailConfigForm) {
      mailConfigForm.addEventListener('submit', function() {
        setMailFormReadonly(true);
        const mailSaveBtn = document.getElementById('mail-save-btn');
        const mailCancelBtn = document.getElementById('mail-cancel-btn');
        const mailEditBtn = document.getElementById('mail-edit-btn');
        if (mailSaveBtn) mailSaveBtn.style.display = 'none';
        if (mailCancelBtn) mailCancelBtn.style.display = 'none';
        if (mailEditBtn) mailEditBtn.style.display = '';
        showMailTestFields(false);
      });
    }
    
    if (wechatConfigForm) {
      wechatConfigForm.addEventListener('submit', function() {
        setWechatFormReadonly(true);
        const wechatSaveBtn = document.getElementById('wechat-save-btn');
        const wechatCancelBtn = document.getElementById('wechat-cancel-btn');
        const wechatEditBtn = document.getElementById('wechat-edit-btn');
        if (wechatSaveBtn) wechatSaveBtn.style.display = 'none';
        if (wechatCancelBtn) wechatCancelBtn.style.display = 'none';
        if (wechatEditBtn) wechatEditBtn.style.display = '';
      });
    }

    // 欢迎邮件模板保存按钮逻辑
    if (document.getElementById('save-welcome-mail-template')) {
      document.getElementById('save-welcome-mail-template').onclick = async function() {
        const val = document.getElementById('welcome-mail-template').value;
        try {
          await apiFetch('/api/configs', { method: 'POST', body: JSON.stringify({ key: 'welcome_mail_template', value: val }) });
          document.getElementById('welcome-mail-template-tip').style.display = '';
          setTimeout(() => { document.getElementById('welcome-mail-template-tip').style.display = 'none'; }, 1500);
        } catch (e) {
          alert('保存失败：' + e.message);
        }
      };
    }

    // 重置密码邮件模板保存按钮逻辑
    if (document.getElementById('save-reset-password-mail-template')) {
      document.getElementById('save-reset-password-mail-template').onclick = async function() {
        const val = document.getElementById('reset-password-mail-template').value;
        try {
          await apiFetch('/api/configs', { method: 'POST', body: JSON.stringify({ key: 'reset_password_mail_template', value: val }) });
          document.getElementById('reset-password-mail-template-tip').style.display = '';
          setTimeout(() => { document.getElementById('reset-password-mail-template-tip').style.display = 'none'; }, 1500);
        } catch (e) {
          alert('保存失败：' + e.message);
        }
      };
    }

    // 欢迎邮件模板预览功能
    if (document.getElementById('preview-welcome-mail-template')) {
      document.getElementById('preview-welcome-mail-template').onclick = function() {
        const template = document.getElementById('welcome-mail-template').value;
        const previewHtml = template
          .replace(/\{\{username\}\}/g, 'test@example.com')
          .replace(/\{\{confirmLink\}\}/g, 'https://example.com/confirm?token=test123');
        showTemplatePreview('欢迎邮件模板预览', previewHtml);
      };
    }

    // 欢迎邮件模板重置功能
    if (document.getElementById('reset-welcome-mail-template')) {
      document.getElementById('reset-welcome-mail-template').onclick = function() {
        if (confirm('确定要重置为默认模板吗？当前内容将丢失。')) {
          document.getElementById('welcome-mail-template').value = getDefaultWelcomeTemplate();
        }
      };
    }

    // 重置密码邮件模板预览功能
    if (document.getElementById('preview-reset-password-mail-template')) {
      document.getElementById('preview-reset-password-mail-template').onclick = function() {
        const template = document.getElementById('reset-password-mail-template').value;
        const previewHtml = template
          .replace(/\{\{username\}\}/g, 'test@example.com')
          .replace(/\{\{resetLink\}\}/g, 'https://example.com/reset?token=test123')
          .replace(/\{\{expireTime\}\}/g, '1小时后');
        showTemplatePreview('重置密码邮件模板预览', previewHtml);
      };
    }

    // 重置密码邮件模板重置功能
    if (document.getElementById('reset-reset-password-mail-template')) {
      document.getElementById('reset-reset-password-mail-template').onclick = function() {
        if (confirm('确定要重置为默认模板吗？当前内容将丢失。')) {
          document.getElementById('reset-password-mail-template').value = getDefaultResetPasswordTemplate();
        }
      };
    }

    // 模板预览弹窗
    function showTemplatePreview(title, html) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.display = 'flex';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;">
          <div class="modal-title">${title}</div>
          <div style="flex: 1; overflow: auto; border: 1px solid #e5e7eb; border-radius: 8px; margin: 1rem 0;">
            <iframe srcdoc="${html.replace(/"/g, '&quot;')}" style="width: 100%; height: 500px; border: none;"></iframe>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">关闭</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      // 点击遮罩关闭
      modal.addEventListener('click', function(e) {
        if (e.target === modal) {
          modal.remove();
        }
      });
    }

    // 变量代码点击复制功能
    function setupVariableCopy() {
      const variableCodes = document.querySelectorAll('.variable-item code');
      variableCodes.forEach(code => {
        code.addEventListener('click', function() {
          const text = this.textContent;
          navigator.clipboard.writeText(text).then(() => {
            // 显示复制成功提示
            const originalText = this.textContent;
            this.textContent = '已复制!';
            this.style.background = 'linear-gradient(135deg, #48bb78, #38a169)';
            setTimeout(() => {
              this.textContent = originalText;
              this.style.background = 'linear-gradient(135deg, var(--accent), var(--accent2))';
            }, 1000);
          }).catch(err => {

            alert('复制失败，请手动复制');
          });
        });
      });
    }

    // 初始化变量复制功能
    setupVariableCopy();

    // 默认欢迎邮件模板
    function getDefaultWelcomeTemplate() {
      return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>欢迎注册</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .btn { display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>欢迎加入 318TECH</h1>
            <p>连接未来，从这里开始</p>
        </div>
        <div class="content">
            <h2>亲爱的 {{username}}，</h2>
            <p>感谢您注册我们的平台！我们很高兴您选择加入我们。</p>
            <p>为了完成注册，请点击下面的按钮确认您的邮箱地址：</p>
            <div style="text-align: center;">
                <a href="{{confirmLink}}" class="btn">确认邮箱地址</a>
            </div>
            <p>如果您无法点击按钮，请复制以下链接到浏览器地址栏：</p>
            <p style="word-break: break-all; background: #e9ecef; padding: 10px; border-radius: 5px; font-size: 14px;">{{confirmLink}}</p>
            <p>此链接将在24小时后失效。</p>
            <p>如果您没有注册我们的服务，请忽略此邮件。</p>
        </div>
        <div class="footer">
            <p>此邮件由系统自动发送，请勿回复</p>
            <p>&copy; 2024 318TECH. 保留所有权利。</p>
        </div>
    </div>
</body>
</html>`;
    }

    // 默认重置密码邮件模板
    function getDefaultResetPasswordTemplate() {
      return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>重置密码</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .btn { display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>重置密码</h1>
            <p>318TECH 账户安全</p>
        </div>
        <div class="content">
            <h2>亲爱的 {{username}}，</h2>
            <p>我们收到了您的密码重置请求。如果这是您本人的操作，请点击下面的按钮重置您的密码：</p>
            <div style="text-align: center;">
                <a href="{{resetLink}}" class="btn">重置密码</a>
            </div>
            <p>如果您无法点击按钮，请复制以下链接到浏览器地址栏：</p>
            <p style="word-break: break-all; background: #e9ecef; padding: 10px; border-radius: 5px; font-size: 14px;">{{resetLink}}</p>
            <div class="warning">
                <strong>重要提醒：</strong>
                <ul>
                    <li>此链接将在 {{expireTime}} 后失效</li>
                    <li>如果您没有请求重置密码，请忽略此邮件</li>
                    <li>为了账户安全，请勿将此链接分享给他人</li>
                </ul>
            </div>
            <p>如果您没有请求重置密码，请忽略此邮件，您的密码将保持不变。</p>
        </div>
        <div class="footer">
            <p>此邮件由系统自动发送，请勿回复</p>
            <p>&copy; 2024 318TECH. 保留所有权利。</p>
        </div>
    </div>
</body>
</html>`;
    }

    // flatpickr 日期选择器美化
    function formatDate(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 6);

    flatpickr('#dashboard-start-date', {
        dateFormat: 'Y-m-d',
        locale: 'zh',
        allowInput: true,
        maxDate: 'today',
        defaultDate: formatDate(lastWeek)
    });
    flatpickr('#dashboard-end-date', {
        dateFormat: 'Y-m-d',
        locale: 'zh',
        allowInput: true,
        maxDate: 'today',
        defaultDate: formatDate(today)
    });

    function showResetPasswordModal() {
      const modal = document.getElementById('reset-password-modal');
      // 将弹窗节点移到 body 最后，确保在最上层
      if (modal && modal.parentNode !== document.body) {
        document.body.appendChild(modal);
      } else if (modal && document.body.lastChild !== modal) {
        document.body.appendChild(modal);
      }
      modal.style.display = 'block';
      // 其它显示逻辑（如重置表单、清空错误提示等）可在这里补充
    }

    // 隐藏弹窗
    function hideResetPasswordModal() {
      const modal = document.getElementById('reset-password-modal');
      if (modal) {
        modal.style.display = 'none';
      }
    }

    // 绑定按钮事件（示例）
    document.getElementById('edit-reset-password-btn').onclick = showResetPasswordModal;
    document.getElementById('cancel-reset-password-modal').onclick = hideResetPasswordModal;

});

