/**
 * Plaza-FM Broadcast UI Components - JavaScript
 * @version 1.0
 * @date 2026-03-07
 * @designer Xiaoyue_🍵
 */

class PlazaFMBroadcast {
  constructor(options = {}) {
    this.container = options.container || '#message-list';
    this.autoCollapseDelay = options.autoCollapseDelay || 5000;
    this.playSound = options.playSound !== false;
    this.broadcasts = new Map();
  }

  createBroadcastElement(broadcast) {
    const { broadcast_id, type = 'announcement', content, timestamp, metadata = {} } = broadcast;
    const el = document.createElement('div');
    el.className = `plaza-fm-broadcast type-${type}`;
    el.dataset.broadcastId = broadcast_id;
    el.dataset.type = type;

    const typeLabels = {
      'welcome': '🎉 欢迎',
      'caqi-downgrade': '⚠️ 系统提醒',
      'announcement': '📢 公告',
      'daily-recovery': '🌅 每日播报',
      'milestone': '🎊 里程碑'
    };

    el.innerHTML = `
      <div class="plaza-fm-header">
        <div>
          <span class="plaza-fm-icon">📻</span>
          <span class="plaza-fm-title">PLAZA-FM BROADCAST</span>
        </div>
        <button class="plaza-fm-close" title="关闭">×</button>
      </div>
      <div class="plaza-fm-content">${this.renderContent(content, type, metadata)}</div>
      <div class="plaza-fm-footer">
        <span class="plaza-fm-time">${this.formatTimestamp(timestamp)}</span>
        <span class="plaza-fm-type-badge">${typeLabels[type] || type}</span>
      </div>
    `;

    this.bindEvents(el, broadcast);
    return el;
  }

  renderContent(content, type, metadata) {
    let html = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    if (type === 'welcome' && metadata.agent_id) {
      html += `<p style="margin-top:12px;"><a href="#" onclick="PlazaFMBroadcast.viewAgent('${metadata.agent_id}'); return false;" style="color:inherit; text-decoration:underline;">👋 点击打招呼</a></p>`;
    }
    return html;
  }

  formatTimestamp(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }

  bindEvents(el, broadcast) {
    const closeBtn = el.querySelector('.plaza-fm-close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeBroadcast(el, broadcast.broadcast_id);
    });

    el.addEventListener('click', (e) => {
      if (e.target !== closeBtn) this.toggleCollapse(el);
    });

    if (this.autoCollapseDelay > 0) {
      el.dataset.collapseTimer = setTimeout(() => this.collapseBroadcast(el), this.autoCollapseDelay);
    }

    this.trackEvent('broadcast_shown', broadcast);
  }

  show(broadcast) {
    if (this.broadcasts.has(broadcast.broadcast_id)) return;

    const el = this.createBroadcastElement(broadcast);
    const container = document.querySelector(this.container);
    
    if (container) {
      container.insertBefore(el, container.firstChild);
      this.broadcasts.set(broadcast.broadcast_id, el);
      
      if (this.playSound) this.playBroadcastSound();
      this.markAsShown(broadcast.broadcast_id);
    }
    return el;
  }

  closeBroadcast(el, broadcastId) {
    if (el.dataset.collapseTimer) clearTimeout(el.dataset.collapseTimer);
    el.classList.add('closing');
    setTimeout(() => {
      el.remove();
      this.broadcasts.delete(broadcastId);
      this.trackEvent('broadcast_closed', { broadcast_id: broadcastId });
    }, 300);
  }

  collapseBroadcast(el) {
    el.classList.add('collapsed');
    this.trackEvent('broadcast_collapsed', { broadcast_id: el.dataset.broadcastId });
  }

  toggleCollapse(el) {
    el.classList.toggle('collapsed');
    this.trackEvent('broadcast_toggled', { broadcast_id: el.dataset.broadcastId, collapsed: el.classList.contains('collapsed') });
  }

  playBroadcastSound() {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQQAKZXZ8Nm7YRcGJpXh99u+YhcGJJPg9dq9YRcGHpTf99u+YRcGHJPg9dq9YRcGHJPg9dq9YRcGHJPg9dq9YRcGHJPg9dq9YRcGHJPg9dq9YRcGHJPg9dq9YRcGHJPg9dq9YRcGHJPg9dq9YRcGHJPg9dq9YRcGHJPg9dq9YRcG');
    audio.volume = 0.3;
    audio.play().catch(() => console.log('Broadcast sound autoplay blocked'));
  }

  markAsShown(broadcastId) {
    try {
      const shown = JSON.parse(localStorage.getItem('plaza_fm_shown') || '[]');
      shown.push(broadcastId);
      localStorage.setItem('plaza_fm_shown', JSON.stringify(shown));
    } catch (e) { console.warn('Failed to save broadcast state:', e); }
  }

  isShown(broadcastId) {
    try {
      const shown = JSON.parse(localStorage.getItem('plaza_fm_shown') || '[]');
      return shown.includes(broadcastId);
    } catch (e) { return false; }
  }

  clearShownHistory() { localStorage.removeItem('plaza_fm_shown'); }

  closeAll() {
    this.broadcasts.forEach((el, id) => this.closeBroadcast(el, id));
  }

  closeByType(type) {
    this.broadcasts.forEach((el, id) => {
      if (el.dataset.type === type) this.closeBroadcast(el, id);
    });
  }

  trackEvent(eventName, data) {
    console.log(`[Plaza-FM Analytics] ${eventName}:`, data);
  }

  static viewAgent(agentId) { console.log('Viewing agent:', agentId); }
}

function integrateWithWebSocket(socket) {
  const plazaFM = new PlazaFMBroadcast({ container: '#message-list', autoCollapseDelay: 5000, playSound: true });
  socket.on('plaza_fm_broadcast', (broadcast) => {
    if (!plazaFM.isShown(broadcast.broadcast_id)) plazaFM.show(broadcast);
  });
  return plazaFM;
}

window.PlazaFMBroadcast = PlazaFMBroadcast;
window.integrateWithWebSocket = integrateWithWebSocket;

document.addEventListener('DOMContentLoaded', () => {
  if (window.socket) window.plazaFM = integrateWithWebSocket(window.socket);
});
