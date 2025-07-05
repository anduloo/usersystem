// ========== Admin 消息中心 ==========
if (isAdmin) {
    // 变量定义
    let allUsers = [];
    let allUserOptions = [];
    let selectedUserIds = [];
    let multiSelectInput, multiSelectDropdown;
    let selectedMsgIds = [];
    let messageSearchTerm = '';
    const messagePagination = { currentPage: 1, pageSize: 20, total: 0, messages: [] };
    // DOM
    const messageTableBody = document.querySelector('#message-table tbody');
    const messageCheckAll = document.getElementById('message-check-all');
    const batchDeleteMsg = document.getElementById('batch-delete-msg');
    const batchReadMsg = document.getElementById('batch-read-msg');
    const messageSearch = document.getElementById('message-search');
    const messagePrev = document.getElementById('message-prev');
    const messageNext = document.getElementById('message-next');
    const messagePageNumbers = document.getElementById('message-page-numbers');
    const messageStart = document.getElementById('message-start');
    const messageEnd = document.getElementById('message-end');
    const messageTotal = document.getElementById('message-total');
    const messagePageSize = document.getElementById('message-page-size');
    const messageDetailModal = document.getElementById('message-detail-modal');
    const messageDetailContent = document.getElementById('message-detail-content');
    const closeMessageDetail = document.getElementById('close-message-detail');
    // 多选下拉
    const multiSelectContainer = document.getElementById('message-to-user-multiselect');
    const multiSelectHidden = document.getElementById('message-to-user-hidden');
    const sendMsgModal = document.getElementById('send-message-modal');
    const sendMsgForm = document.getElementById('send-message-form');
    const sendMsgTip = document.getElementById('send-message-tip');
    const sendMsgBtn2 = document.getElementById('send-message-btn2');
    // 回复
    const replyModal = document.getElementById('reply-modal');
    const replyCancel = document.getElementById('reply-cancel');
    const replyForm = document.getElementById('reply-form');
  
    // 加载所有用户
    async function loadAllUsers() {
      allUserOptions = [{id: '', name: '全体用户'}];
      allUsers = await apiFetch('/api/users');
      allUsers.forEach(u => {
        allUserOptions.push({id: String(u.id), name: u.name || u.email, email: u.email});
      });
    }
  
    // 多选下拉渲染
    function renderMultiSelect(selected = [], filter = '') {
      multiSelectContainer.innerHTML = '';
      selected.forEach(id => {
        const user = allUserOptions.find(u => u.id === id);
        if (!user) return;
        const tag = document.createElement('span');
        tag.className = 'multi-select-tag';
        tag.textContent = user.name || user.email || '全体用户';
        const remove = document.createElement('span');
        remove.className = 'multi-select-tag-remove';
        remove.innerHTML = '&times;';
        remove.onclick = (e) => { e.stopPropagation(); removeUserFromMultiSelect(id); };
        tag.appendChild(remove);
        multiSelectContainer.appendChild(tag);
      });
      multiSelectInput = document.createElement('input');
      multiSelectInput.type = 'text';
      multiSelectInput.className = 'multi-select-input';
      multiSelectInput.placeholder = selected.length === 0 ? '选择接收人（可多选）' : '';
      multiSelectInput.autocomplete = 'off';
      multiSelectInput.oninput = () => { 
        if (multiSelectInput.value.trim()) {
          renderDropdown(multiSelectInput.value.trim());
          if (multiSelectDropdown && multiSelectDropdown.style.display === 'block') {
            multiSelectDropdown.style.display = 'block';
          }
        }
      };
      multiSelectInput.onfocus = () => {};
      multiSelectInput.onclick = (e) => { e.stopPropagation(); };
      multiSelectContainer.appendChild(multiSelectInput);
      renderDropdown(filter);
      if (multiSelectDropdown) {
        multiSelectDropdown.style.display = 'none';
      }
    }
    function renderDropdown(filter = '') {
      if (multiSelectDropdown) multiSelectDropdown.remove();
      multiSelectDropdown = document.createElement('div');
      multiSelectDropdown.className = 'multi-select-dropdown';
      let options = allUserOptions;
      if (filter) {
        const f = filter.toLowerCase();
        options = options.filter(u => (u.name && u.name.toLowerCase().includes(f)) || (u.email && u.email.toLowerCase().includes(f)) || (u.id === '' && '全体用户'.includes(f)));
      }
      if (selectedUserIds.includes('')) {
        options = options.filter(u => u.id === '');
      }
      options.forEach(u => {
        const opt = document.createElement('div');
        opt.className = 'multi-select-option';
        opt.textContent = u.id === '' ? '全体用户' : (u.name || u.email);
        if (selectedUserIds.includes(u.id)) opt.classList.add('selected');
        opt.onclick = (e) => {
          e.stopPropagation();
          if (u.id === '') {
            selectedUserIds = [''];
          } else {
            selectedUserIds = selectedUserIds.filter(i => i !== '');
            if (!selectedUserIds.includes(u.id)) selectedUserIds.push(u.id);
          }
          updateMultiSelect();
          renderDropdown('');
        };
        multiSelectDropdown.appendChild(opt);
      });
      if (options.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'multi-select-option';
        empty.style.color = '#a0aec0';
        empty.textContent = '无匹配用户';
        multiSelectDropdown.appendChild(empty);
      }
      multiSelectDropdown.style.display = 'none';
      multiSelectContainer.appendChild(multiSelectDropdown);
    }
    function removeUserFromMultiSelect(id) {
      selectedUserIds = selectedUserIds.filter(i => i !== id);
      updateMultiSelect();
      renderDropdown('');
    }
    function updateMultiSelect() {
      renderMultiSelect(selectedUserIds);
      multiSelectHidden.value = JSON.stringify(selectedUserIds);
    }
    document.body.addEventListener('click', function() {
      if (multiSelectDropdown) multiSelectDropdown.style.display = 'none';
    });
    multiSelectContainer.onclick = function(e) {
      if (multiSelectDropdown) {
        multiSelectDropdown.style.display = 'block';
        multiSelectDropdown.classList.add('open');
      } else {
        renderDropdown('');
      }
      multiSelectInput.focus();
      e.stopPropagation();
    };
    // 打开发送消息弹窗
    sendMsgBtn2.onclick = async function() {
      await loadAllUsers();
      selectedUserIds = [];
      updateMultiSelect();
      sendMsgModal.style.display = 'flex';
      setTimeout(() => { multiSelectInput && multiSelectInput.focus(); }, 100);
    };
    // 发送消息表单
    sendMsgForm.onsubmit = async function(e) {
      e.preventDefault();
      const form = new FormData(sendMsgForm);
      let toUserIds = [];
      try { toUserIds = JSON.parse(multiSelectHidden.value); } catch { toUserIds = []; }
      if (toUserIds && toUserIds.includes('')) toUserIds = [''];
      // 只传有效id
      toUserIds = toUserIds.filter(id => id !== null && id !== undefined && id !== '');
      const data = { title: form.get('title'), content: form.get('content'), toUserIds };
      const res = await apiFetch('/api/users/messages', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
      if (res.success) {
        sendMsgTip.textContent = '发送成功！';
        sendMsgTip.style.display = 'block';
        setTimeout(() => {
          sendMsgModal.style.display = 'none';
          sendMsgForm.reset();
          sendMsgTip.style.display = 'none';
          selectedUserIds = [];
          updateMultiSelect();
          loadMessages();
        }, 1200);
      } else {
        sendMsgTip.textContent = res.message || '发送失败';
        sendMsgTip.style.display = 'block';
      }
    };
    // 消息加载与渲染
    async function loadMessages() {
      await loadAllUsers();
      const res = await apiFetch('/api/users/messages');
      messagePagination.messages = res;
      renderMessages();
    }
    window.loadMessages = loadMessages;
  
    function renderMessages() {
      const startIndex = (messagePagination.currentPage - 1) * messagePagination.pageSize;
      const endIndex = startIndex + messagePagination.pageSize;
      let filtered = messagePagination.messages;
      if (messageSearchTerm) {
        const term = messageSearchTerm.toLowerCase();
        filtered = filtered.filter(msg => {
          const user = allUsers.find(u => String(u.id) === String(msg.fromUserId)) || {};
          return (user.name && user.name.toLowerCase().includes(term)) ||
                 (user.email && user.email.toLowerCase().includes(term)) ||
                 (msg.title && msg.title.toLowerCase().includes(term)) ||
                 (msg.content && msg.content.toLowerCase().includes(term));
        });
      }
      const paginated = filtered.slice(startIndex, endIndex);
      messagePagination.total = filtered.length;
      messageStart.textContent = startIndex + 1;
      messageEnd.textContent = Math.min(endIndex, messagePagination.total);
      messageTotal.textContent = messagePagination.total;
      messageTableBody.innerHTML = paginated.map((msg, idx) => {
        let sender = msg.fromUserName || msg.fromUserEmail || msg.fromUserId;
        let receiver = '全体用户';
        if (Array.isArray(msg.toUserIds) && msg.toUserIds.length > 0) {
          receiver = msg.toUserIds.map(uid => {
            const u = allUsers.find(u => String(u.id) === String(uid));
            return u ? (u.name || u.email) : uid;
          }).join(', ');
        } else if (msg.toUserId != null) {
          const u = allUsers.find(u => String(u.id) === String(msg.toUserId));
          receiver = u ? (u.name || u.email) : msg.toUserId;
        }
        const checked = selectedMsgIds.includes(msg.id) ? 'checked' : '';
        return `<tr>
          <td><input type="checkbox" class="message-check" data-id="${msg.id}" ${checked}></td>
          <td>${startIndex + idx + 1}</td>
          <td>${sender}</td>
          <td>${receiver}</td>
          <td>${msg.title}</td>
          <td>${msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content}</td>
          <td>${new Date(msg.createdAt).toLocaleString()}</td>
          <td>${msg.isRead ? '<span style="color:#48bb78;">已读</span>' : '<span style="color:#ed8936;">未读</span>'}</td>
          <td>
            <button class="btn btn-secondary" onclick="showMessageDetail(${msg.id})">详情</button>
            ${!msg.isRead ? `<button class="btn btn-primary" onclick="markMessageRead(${msg.id})">已读</button>` : ''}
            <button class="btn btn-danger" onclick="deleteMessage(${msg.id})">删除</button>
            <button class="btn btn-secondary" onclick="replyMessage(${msg.id})">回复</button>
          </td>
        </tr>`;
      }).join('');
      updateMessagePagination();
      document.querySelectorAll('.message-check').forEach(cb => {
        cb.onchange = function() {
          const id = Number(this.getAttribute('data-id'));
          if (this.checked) {
            if (!selectedMsgIds.includes(id)) selectedMsgIds.push(id);
          } else {
            selectedMsgIds = selectedMsgIds.filter(i => i !== id);
          }
          updateBatchBtns();
          updateCheckAllBox();
        };
      });
      updateCheckAllBox();
      updateBatchBtns();
    }
    function updateMessagePagination() {
      const totalPages = Math.ceil(messagePagination.total / messagePagination.pageSize);
      messagePrev.disabled = messagePagination.currentPage <= 1;
      messageNext.disabled = messagePagination.currentPage >= totalPages;
      messagePageNumbers.innerHTML = '';
      const maxVisiblePages = 5;
      let startPage = Math.max(1, messagePagination.currentPage - Math.floor(maxVisiblePages / 2));
      let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
      if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
      }
      for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn ${i === messagePagination.currentPage ? 'btn-primary' : 'btn-secondary'}`;
        pageBtn.style.padding = '0.5rem 0.8rem';
        pageBtn.style.fontSize = '0.9rem';
        pageBtn.textContent = i;
        pageBtn.onclick = () => {
          messagePagination.currentPage = i;
          renderMessages();
        };
        messagePageNumbers.appendChild(pageBtn);
      }
    }
    function updateCheckAllBox() {
      const pageIds = Array.from(document.querySelectorAll('.message-check')).map(cb => Number(cb.getAttribute('data-id')));
      messageCheckAll.checked = pageIds.length > 0 && pageIds.every(id => selectedMsgIds.includes(id));
      messageCheckAll.indeterminate = pageIds.some(id => selectedMsgIds.includes(id)) && !messageCheckAll.checked;
    }
    messageCheckAll.onchange = function() {
      const pageIds = Array.from(document.querySelectorAll('.message-check')).map(cb => Number(cb.getAttribute('data-id')));
      if (this.checked) {
        pageIds.forEach(id => { if (!selectedMsgIds.includes(id)) selectedMsgIds.push(id); });
      } else {
        selectedMsgIds = selectedMsgIds.filter(id => !pageIds.includes(id));
      }
      renderMessages();
      updateBatchBtns();
    };
    function updateBatchBtns() {
      batchDeleteMsg.disabled = selectedMsgIds.length === 0;
      batchReadMsg.disabled = selectedMsgIds.length === 0;
    }
    batchDeleteMsg.onclick = async function() {
      if (!selectedMsgIds.length) return;
      if (!confirm('确定要批量删除选中的消息吗？')) return;
      for (const id of selectedMsgIds) {
        await deleteMessage(id, true);
      }
      selectedMsgIds = [];
      await loadMessages();
      updateBatchBtns();
    };
    batchReadMsg.onclick = async function() {
      if (!selectedMsgIds.length) return;
      for (const id of selectedMsgIds) {
        await markMessageRead(id, true);
      }
      selectedMsgIds = [];
      await loadMessages();
      updateBatchBtns();
    };
    window.deleteMessage = async function(id, silent) {
      if (!silent && !confirm('确定要删除这条消息吗？')) return;
      await apiFetch(`/api/users/messages/${id}`, { method: 'DELETE' });
      await loadMessages();
    };
    window.showMessageDetail = function(id) {
      const msg = messagePagination.messages.find(m => m.id === id);
      if (!msg) return;
      let sender = msg.fromUserName || msg.fromUserEmail || msg.fromUserId;
      messageDetailContent.innerHTML = `<div style='margin-bottom:0.5em;'><b>发送人：</b>${sender || '系统'}</div><div style='margin-bottom:0.5em;'><b>标题：</b>${msg.title}</div><div style='margin-bottom:1em;white-space:pre-line;'><b>内容：</b>${msg.content}</div><div style='color:#888;font-size:0.95em;'>${new Date(msg.createdAt).toLocaleString()}</div>`;
      messageDetailModal.style.display = 'flex';
    };
    closeMessageDetail.onclick = function() {
      messageDetailModal.style.display = 'none';
    };
    messageDetailModal.onclick = function(e) {
      if (e.target === messageDetailModal) messageDetailModal.style.display = 'none';
    };
    window.markMessageRead = async function(id) {
      await apiFetch(`/api/users/messages/${id}/read`, { method: 'POST' });
      await loadMessages();
    };
    // 回复
    window.replyMessage = function(id) {
      const msg = messagePagination.messages.find(m => m.id === id);
      if (!msg) return;
      let sender = msg.fromUserName || msg.fromUserEmail || msg.fromUserId;
      let senderName = sender;
      if (msg.fromUserId && allUsers) {
        const u = allUsers.find(u => String(u.id) === String(msg.fromUserId));
        if (u) senderName = u.name || u.email;
      }
      replyModal.style.display = 'flex';
      document.getElementById('reply-to-user').value = senderName || sender || '系统';
      document.getElementById('reply-title').value = '回复：' + msg.title;
      document.getElementById('reply-content').value = '';
      document.getElementById('reply-tip').style.display = 'none';
      window.currentReplyToUserId = msg.fromUserId;
    };
    if (replyCancel) replyCancel.onclick = function() {
      replyModal.style.display = 'none';
    };
    if (replyForm) replyForm.onsubmit = async function(e) {
      e.preventDefault();
      const title = document.getElementById('reply-title').value.trim();
      const content = document.getElementById('reply-content').value.trim();
      const toUserIds = [window.currentReplyToUserId];
      const tip = document.getElementById('reply-tip');
      try {
        const res = await apiFetch('/api/users/messages', {
          method: 'POST',
          body: JSON.stringify({ title, content, toUserIds }),
          headers: { 'Content-Type': 'application/json' }
        });
        if (res.success) {
          tip.textContent = '发送成功！';
          tip.style.display = 'block';
          setTimeout(() => {
            replyModal.style.display = 'none';
            replyForm.reset();
            tip.style.display = 'none';
            loadMessages();
          }, 1200);
        } else {
          tip.textContent = res.message || '发送失败';
          tip.style.display = 'block';
        }
      } catch {
        tip.textContent = '发送失败';
        tip.style.display = 'block';
      }
    };
    // 搜索、分页
    messageSearch.oninput = function() {
      messageSearchTerm = this.value.trim();
      messagePagination.currentPage = 1;
      renderMessages();
    };
    messagePageSize.onchange = function(e) {
      messagePagination.pageSize = parseInt(e.target.value);
      messagePagination.currentPage = 1;
      renderMessages();
    };
    messagePrev.onclick = () => {
      if (messagePagination.currentPage > 1) {
        messagePagination.currentPage--;
        renderMessages();
      }
    };
    messageNext.onclick = () => {
      const totalPages = Math.ceil(messagePagination.total / messagePagination.pageSize);
      if (messagePagination.currentPage < totalPages) {
        messagePagination.currentPage++;
        renderMessages();
      }
    };
    // 初始化
    loadMessages();
  }