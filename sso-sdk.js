/**
 * SSO SDK - 单点登录系统客户端SDK
 * 版本: 1.0.0
 * 作者: 318TECH
 * 
 * 功能:
 * - 登录状态检查
 * - 自动跳转到登录页
 * - 获取用户信息
 * - 项目访问权限验证
 * - 登出功能
 * - 事件监听
 */

(function(window, document) {
    'use strict';

    // === SSO SDK 首屏防闪现：立即隐藏 body ===
    (function() {
        function hideBody() {
            if (document.body) {
                document.body.style.display = 'none';
            }
        }
        if (document.body) {
            hideBody();
        } else {
            new MutationObserver(function(mutations, observer) {
                if (document.body) {
                    hideBody();
                    observer.disconnect();
                }
            }).observe(document.documentElement, { childList: true });
        }
    })();

    // === 1. 自动写入token到localStorage ===
    // 注释掉自动处理URL token的逻辑，避免覆盖localStorage中的token
    /*
    (function autoSetToken() {
        var params = new URLSearchParams(window.location.search);
        var token = params.get('token');
        if (token) {
            localStorage.setItem('jwt_token', token);
            params.delete('token');
            var newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
            window.history.replaceState({}, document.title, newUrl);
        }
    })();
    */

    // === SSO SDK 浮窗插入到 <html>，不依赖 body ===
    (function injectFloatBoxToHtml() {
        if (document.getElementById('sso-float-box')) return;
        var box = document.createElement('div');
        box.id = 'sso-float-box';
        box.style.display = 'block';
        box.style.position = 'fixed';
        box.style.top = '32px';
        box.style.right = '32px';
        box.style.minWidth = '240px';
        box.style.maxWidth = '340px';
        box.style.background = 'linear-gradient(135deg, #f3f6fa 60%, #e9e4f0 100%)';
        box.style.boxShadow = '0 8px 32px rgba(102, 126, 234, 0.18)';
        box.style.borderRadius = '16px';
        box.style.zIndex = '9999';
        box.style.fontSize = '15px';
        box.style.color = '#222';
        box.style.userSelect = 'none';
        box.style.transition = 'box-shadow 0.2s';
        box.style.border = '1.5px solid #e2e8f0';
        box.innerHTML = `
  <div class="sso-float-header" id="sso-float-header">
    <i class=\"fa fa-shield-alt\" style=\"color:#667eea;margin-right:8px;font-size:1.2em;\"></i>
    <span id=\"sso-float-title\" style=\"font-weight:700;font-size:1.08em;flex:1;\">正在加载…</span>
    <button id=\"sso-float-logout\" title=\"退出登录\" style=\"display:none;\">退出</button>
  </div>
  <div id=\"sso-float-msg\" class=\"sso-float-msg\" style=\"display:none;\"></div>
`;
        document.documentElement.appendChild(box);
        var style = document.createElement('style');
        style.innerHTML = `
#sso-float-box {
  background: linear-gradient(135deg, #f3f6fa 60%, #e9e4f0 100%);
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.18);
  border-radius: 16px;
  border: 1.5px solid #e2e8f0;
  padding-bottom: 8px;
}
#sso-float-box .sso-float-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 14px 18px 10px 18px;
  background: rgba(245, 247, 255, 0.95);
  border-bottom: 1px solid #e2e8f0;
  border-radius: 16px 16px 0 0;
  font-weight: 700;
  font-size: 1.08em;
  gap: 8px;
}
#sso-float-box .sso-float-header button {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 20px;
  padding: 4px 18px;
  font-size: 15px;
  cursor: pointer;
  margin-left: 10px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.08);
  transition: background 0.2s, transform 0.2s;
}
#sso-float-box .sso-float-header button:hover {
  background: linear-gradient(135deg, #764ba2, #667eea);
  transform: scale(1.07);
}
#sso-float-msg {
  padding: 18px 20px 10px 20px;
  color: #e53e3e;
  font-weight: 500;
  font-size: 1.08em;
  display: none;
  text-align: center;
  letter-spacing: 0.5px;
}
`;
        document.head.appendChild(style);
        // 拖动逻辑
        var header = document.getElementById('sso-float-header');
        var offsetX, offsetY, dragging = false;
        header.onmousedown = function(e) {
            dragging = true;
            offsetX = e.clientX - box.offsetLeft;
            offsetY = e.clientY - box.offsetTop;
            document.onmousemove = function(e) {
                if (dragging) {
                    box.style.left = (e.clientX - offsetX) + 'px';
                    box.style.top = (e.clientY - offsetY) + 'px';
                    box.style.right = 'auto';
                }
            };
            document.onmouseup = function() {
                dragging = false;
                document.onmousemove = null;
                document.onmouseup = null;
            };
        };
        // 事件委托绑定退出登录
        document.addEventListener('click', function(e) {
            if (e.target && e.target.id === 'sso-float-logout') {
                if (window.sso && typeof window.sso.logout === 'function') {
                    window.sso.logout();
                    var refreshed = false;
                    var handler = function() {
                        if (!refreshed) {
                            refreshed = true;
                            location.reload();
                        }
                        document.removeEventListener('sso:logout', handler);
                    };
                    document.addEventListener('sso:logout', handler);
                    setTimeout(handler, 1000);
                } else {
                    location.href = '/login';
                }
            }
        });
    })();

    // 配置默认值
    const DEFAULT_CONFIG = {
        apiBase: '/api',
        loginUrl: '/login',
        portalUrl: '/portal',
        tokenKey: 'jwt_token',
        checkInterval: 10000, // 改为10秒检查一次，让多端互踢更及时
        autoRedirect: true,
        debug: false
    };

    // 事件类型
    const EVENTS = {
        LOGIN_SUCCESS: 'sso:login_success',
        LOGIN_FAILED: 'sso:login_failed',
        LOGOUT: 'sso:logout',
        TOKEN_EXPIRED: 'sso:token_expired',
        USER_INFO_LOADED: 'sso:user_info_loaded',
        PROJECT_ACCESS_GRANTED: 'sso:project_access_granted',
        PROJECT_ACCESS_DENIED: 'sso:project_access_denied'
    };

    // 工具函数
    const utils = {
        log: function(message, type = 'info') {
            // 只在调试模式下输出日志，减少生产环境的输出
            if (this.config.debug && type === 'error') {
                console.log(`[SSO SDK] ${type.toUpperCase()}:`, message);
            }
        },

        getToken: function() {
            return localStorage.getItem(this.config.tokenKey);
        },

        setToken: function(token) {
            if (token) {
                localStorage.setItem(this.config.tokenKey, token);
            } else {
                localStorage.removeItem(this.config.tokenKey);
            }
        },

        isTokenExpired: function(token) {
            if (!token) return true;
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return payload.exp * 1000 < Date.now();
            } catch (e) {
                return true;
            }
        },

        emitEvent: function(eventName, data = {}) {
            const event = new CustomEvent(eventName, {
                detail: {
                    timestamp: Date.now(),
                    ...data
                }
            });
            document.dispatchEvent(event);
        },

        request: async function(url, options = {}) {
            const token = this.getToken();
            const defaultHeaders = {
                'Content-Type': 'application/json'
            };

            if (token) {
                defaultHeaders['Authorization'] = `Bearer ${token}`;
            }

            const config = {
                headers: { ...defaultHeaders, ...options.headers },
                ...options
            };

            try {
                const response = await fetch(url, config);
                
                if (response.status === 401) {
                    this.setToken(null);
                    this.emitEvent(EVENTS.TOKEN_EXPIRED);
                    if (this.config.autoRedirect) {
                        showKickoutTipAndRedirect(this.config.loginUrl || '/login');
                    }
                    throw new Error('认证失败');
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return response.json();
            } catch (error) {
                this.log(`请求失败: ${error.message}`, 'error');
                throw error;
            }
        }
    };

    // SSO SDK 主类
    class SSOSDK {
        constructor(config = {}) {
            this.config = { ...DEFAULT_CONFIG, ...config };
            this.userInfo = null;
            this.isInitialized = false;
            this.checkInterval = null;
            
            // 绑定方法到实例
            this.log = utils.log.bind(this);
            this.getToken = utils.getToken.bind(this);
            this.setToken = utils.setToken.bind(this);
            this.isTokenExpired = utils.isTokenExpired.bind(this);
            this.emitEvent = utils.emitEvent.bind(this);
            this.request = utils.request.bind(this);
            
            this.log('SSO SDK 初始化完成');
        }

        /**
         * 初始化SDK
         */
        async init() {
            if (this.isInitialized) {
                this.log('SDK已经初始化');
                return;
            }

            try {
                // 检查当前登录状态
                const token = this.getToken();
                if (!token || this.isTokenExpired(token)) {
                    this.log('未登录，跳转登录页');
                    this.redirectToLogin();
                    return;
                }
                await this.loadUserInfo();
                this.startTokenCheck();
                // 检查是否有项目访问权限（如页面有data-project-id属性）
                const projectId = this.getProjectIdFromPage();
                if (projectId) {
                    const hasAccess = await this.checkProjectAccess(projectId);
                    if (!hasAccess) {
                        this.showNoAccessAndRedirect();
                        return;
                    }
                }
                // 校验中，浮窗显示"正在校验权限…"
                this.setFloatBoxTitle('正在校验权限…');
                this.setFloatBoxMsg('');
                this.setFloatBoxLogoutVisible(false); // 校验中不显示退出
                // 有权限，显示页面和浮窗
                this.showBody();
                // === 自动上报项目访问日志 ===
                if (projectId) {
                    try {
                        await fetch(`${this.config.apiBase}/users/visit-project`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + this.getToken()
                            },
                            body: JSON.stringify({ projectId })
                        });
                        this.log('已自动上报项目访问日志');
                    } catch (e) {
                        this.log('访问日志上报失败: ' + e.message, 'warn');
                    }
                }
                // === END ===
                this.setFloatBoxTitle('欢迎，' + (this.userInfo?.name || this.userInfo?.email || '用户'));
                this.setFloatBoxMsg('');
                this.setFloatBoxLogoutVisible(true); // 有权限才显示退出
                this.isInitialized = true;
                this.log('SDK初始化成功');
            } catch (error) {
                this.log(`SDK初始化失败: ${error.message}`, 'error');
                this.setFloatBoxTitle('未登录或校验失败');
                this.setFloatBoxMsg('请重新登录或联系管理员');
                this.setFloatBoxLogoutVisible(false); // 校验失败不显示退出
                // body 继续隐藏
                // this.redirectToLogin(); // 如需自动跳转可取消注释
            }
        }

        /**
         * 获取页面上的项目ID（如body或html有data-project-id属性）
         */
        getProjectIdFromPage() {
            var el = document.body || document.documentElement;
            return el.getAttribute('data-project-id');
        }

        /**
         * 无权限时提示并跳转portal
         */
        showNoAccessAndRedirect() {
            this.showBody(false); // body 继续隐藏
            this.setFloatBoxTitle('无访问权限');
            this.setFloatBoxMsg('您没有访问该项目的权限，请联系管理员');
            this.setFloatBoxLogoutVisible(false); // 无权限不显示退出
            setTimeout(() => {
                this.redirectToPortal();
            }, 3000);
        }

        /**
         * 检查登录状态
         */
        async checkLoginStatus() {
            const token = this.getToken();
            if (!token || this.isTokenExpired(token)) {
                this.log('登录状态无效');
                this.emitEvent(EVENTS.TOKEN_EXPIRED);
                if (this.config.autoRedirect) {
                    showKickoutTipAndRedirect(this.config.loginUrl || '/login');
                }
                return false;
            }
            
            // 实际发API请求验证sessionId，确保多端互踢及时生效
            try {
                await this.request(`${this.config.apiBase}/users/me`);
                return true;
            } catch (error) {
                if (error.message === '认证失败') {
                    this.log('Token已失效，可能是多端登录被踢下线');
                    this.emitEvent(EVENTS.TOKEN_EXPIRED);
                    if (this.config.autoRedirect) {
                        showKickoutTipAndRedirect(this.config.loginUrl || '/login');
                    }
                    return false;
                }
                // 其他错误（如网络问题）不影响登录状态判断
                return true;
            }
        }

        /**
         * 加载用户信息
         */
        async loadUserInfo() {
            try {
                const userInfo = await this.request(`${this.config.apiBase}/users/me`);
                this.userInfo = userInfo;
                this.emitEvent(EVENTS.USER_INFO_LOADED, { userInfo });
                this.log('用户信息加载成功');
                return userInfo;
            } catch (error) {
                this.log(`加载用户信息失败: ${error.message}`, 'error');
                throw error;
            }
        }

        /**
         * 获取用户信息
         */
        getUserInfo() {
            return this.userInfo;
        }

        /**
         * 检查项目访问权限
         */
        async checkProjectAccess(projectId) {
            try {
                const response = await this.request(`${this.config.apiBase}/projects/${projectId}/check-access`);
                if (response.hasAccess) {
                    this.emitEvent(EVENTS.PROJECT_ACCESS_GRANTED, { projectId });
                } else {
                    this.emitEvent(EVENTS.PROJECT_ACCESS_DENIED, { projectId });
                }
                return response.hasAccess;
            } catch (error) {
                this.log(`检查项目权限失败: ${error.message}`, 'error');
                this.emitEvent(EVENTS.PROJECT_ACCESS_DENIED, { projectId, error: error.message });
                return false;
            }
        }

        /**
         * 获取用户可访问的项目列表
         */
        async getUserProjects() {
            try {
                const projects = await this.request(`${this.config.apiBase}/users/me/projects`);
                return projects;
            } catch (error) {
                this.log(`获取用户项目失败: ${error.message}`, 'error');
                throw error;
            }
        }

        /**
         * 跳转到登录页
         */
        redirectToLogin() {
            const currentUrl = encodeURIComponent(window.location.href);
            const loginUrl = `${this.config.loginUrl}?redirect_uri=${currentUrl}`;
            this.log(`跳转到登录页: ${loginUrl}`);
            window.location.href = loginUrl;
        }

        /**
         * 跳转到门户页
         */
        redirectToPortal() {
            this.log(`跳转到门户页: ${this.config.portalUrl}`);
            window.location.href = this.config.portalUrl;
        }

        /**
         * 登出
         */
        async logout() {
            try {
                await this.request(`${this.config.apiBase}/auth/logout`, { method: 'POST' });
            } catch (error) {
                this.log(`登出请求失败: ${error.message}`, 'warn');
            } finally {
                this.setToken(null);
                this.userInfo = null;
                this.stopTokenCheck();
                this.emitEvent(EVENTS.LOGOUT);
                this.log('用户已登出');
            }
        }

        /**
         * 开始定期检查token状态
         */
        startTokenCheck() {
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
            }
            
            this.checkInterval = setInterval(async () => {
                await this.checkLoginStatus();
            }, this.config.checkInterval);
            
            this.log('开始定期检查登录状态');
        }

        /**
         * 停止定期检查token状态
         */
        stopTokenCheck() {
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
                this.log('停止定期检查登录状态');
            }
        }

        /**
         * 监听事件
         */
        on(eventName, callback) {
            document.addEventListener(eventName, (event) => {
                callback(event.detail);
            });
        }

        /**
         * 移除事件监听
         */
        off(eventName, callback) {
            document.removeEventListener(eventName, callback);
        }

        /**
         * 销毁SDK实例
         */
        destroy() {
            this.stopTokenCheck();
            this.userInfo = null;
            this.isInitialized = false;
            this.log('SDK已销毁');
        }

        /**
         * 恢复 body 显示，并移除页面内联的 display:none 样式（如有）
         * @param {boolean} show 是否显示body，默认true
         */
        showBody(show = true) {
            if (show) {
                document.body.style.display = '';
                // 移除<head>里可能存在的 body{display:none!important;} style
                var styles = document.querySelectorAll('head style');
                styles.forEach(function(style) {
                    if (style.innerText && /body\s*\{[^}]*display\s*:\s*none/i.test(style.innerText)) {
                        style.parentNode.removeChild(style);
                    }
                });
            } else {
                document.body.style.display = 'none';
            }
        }

        /**
         * 设置浮窗标题
         */
        setFloatBoxTitle(title) {
            var el = document.getElementById('sso-float-title');
            if (el) el.textContent = title;
        }

        /**
         * 设置浮窗消息
         */
        setFloatBoxMsg(msg) {
            var el = document.getElementById('sso-float-msg');
            if (el) {
                el.textContent = msg;
                el.style.display = msg ? 'block' : 'none';
            }
        }

        /**
         * 控制退出登录按钮显示/隐藏
         */
        setFloatBoxLogoutVisible(visible) {
            var btn = document.getElementById('sso-float-logout');
            if (btn) btn.style.display = visible ? '' : 'none';
        }

        /**
         * 通用GET请求
         */
        async get(url, options = {}) {
            return this.request(url, { ...options, method: 'GET' });
        }
        /**
         * 通用POST请求
         */
        async post(url, data, options = {}) {
            return this.request(url, { ...options, method: 'POST', body: JSON.stringify(data) });
        }
        /**
         * 通用PUT请求
         */
        async put(url, data, options = {}) {
            return this.request(url, { ...options, method: 'PUT', body: JSON.stringify(data) });
        }
        /**
         * 通用DELETE请求
         */
        async del(url, options = {}) {
            return this.request(url, { ...options, method: 'DELETE' });
        }
    }

    // 创建全局实例
    const ssoSDK = new SSOSDK();

    // 暴露到全局
    window.SSOSDK = SSOSDK;
    window.sso = ssoSDK;
    window.SSO_EVENTS = EVENTS;

    // 自动初始化（如果配置了自动初始化）
    if (typeof window.SSO_AUTO_INIT !== 'undefined' && window.SSO_AUTO_INIT) {
        ssoSDK.init();
    }

    // 提供便捷的全局函数
    window.checkLogin = () => ssoSDK.checkLoginStatus();
    window.getUserInfo = () => ssoSDK.getUserInfo();
    window.logout = () => ssoSDK.logout();
    window.checkProjectAccess = (projectId) => ssoSDK.checkProjectAccess(projectId);

    // 全局暴露简洁API
    window.ssoGet = (...args) => ssoSDK.get(...args);
    window.ssoPost = (...args) => ssoSDK.post(...args);
    window.ssoPut = (...args) => ssoSDK.put(...args);
    window.ssoDelete = (...args) => ssoSDK.del(...args);

})(window, document); 

function showKickoutTipAndRedirect(loginUrl) {
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