(function () {
  // If running inside Electron, preload.cjs already exposes window.myNotes
  if (window.myNotes) return;

  const updateListeners = new Set();
  const commandListeners = new Set();
  const noteActionListeners = new Set();

  // Connect to SSE for real-time updates
  let eventSource = null;
  function connectSSE() {
    eventSource = new EventSource('/api/events');
    eventSource.onmessage = function (event) {
      try {
        const data = JSON.parse(event.data);
        for (const listener of updateListeners) {
          listener(data);
        }
      } catch (err) {
        console.error('[WebAdapter] SSE parse error:', err);
      }
    };
    eventSource.onerror = function () {
      // EventSource auto-reconnects by default
    };
  }
  connectSSE();

  // Track context menu coordinates for right-click on cards
  let lastContextMenuPos = { x: 100, y: 100 };
  window.addEventListener('contextmenu', function (e) {
    lastContextMenuPos = { x: e.clientX, y: e.clientY };
  }, true);

  function emitCommand(cmd) {
    for (const listener of commandListeners) {
      listener(cmd);
    }
  }

  // Global browser keyboard shortcuts
  window.addEventListener('keydown', function (e) {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;

    const key = e.key.toLowerCase();
    if (!e.shiftKey && !e.altKey && key === 'n') {
      e.preventDefault();
      emitCommand('new');
    } else if (e.shiftKey && !e.altKey && key === 'n') {
      e.preventDefault();
      emitCommand('new-topic');
    } else if (!e.shiftKey && key === 'p') {
      e.preventDefault();
      emitCommand('canvas');
    } else if (!e.shiftKey && (key === 'o' || key === '2')) {
      e.preventDefault();
      emitCommand('timeline');
    } else if (!e.shiftKey && key === 'k') {
      e.preventDefault();
      emitCommand('master');
    } else if (!e.shiftKey && key === 't') {
      e.preventDefault();
      emitCommand('todos');
    } else if (!e.shiftKey && e.key === '\\') {
      e.preventDefault();
      emitCommand('split');
    } else if (!e.shiftKey && key === 'f') {
      e.preventDefault();
      emitCommand('search');
    } else if (!e.shiftKey && key === 'r') {
      e.preventDefault();
      emitCommand('collapse');
    }
  });

  // Web in-page context menu
  let activeMenu = null;
  function showWebContextMenu(id, x, y) {
    if (activeMenu) {
      activeMenu.remove();
      activeMenu = null;
    }

    const menu = document.createElement('div');
    menu.className = 'web-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = Math.min(x, window.innerWidth - 160) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 150) + 'px';
    menu.style.zIndex = '99999';

    const items = [
      { label: '收合／展開', action: 'collapse' },
      { label: '筆記底色…', action: 'color' },
      { label: '刪除便利貼', action: 'delete' }
    ];

    items.forEach(function (item) {
      const btn = document.createElement('div');
      btn.className = 'web-context-menu-item';
      btn.textContent = item.label;
      btn.onclick = function (e) {
        e.stopPropagation();
        menu.remove();
        activeMenu = null;
        for (const listener of noteActionListeners) {
          listener({ id, action: item.action });
        }
      };
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    activeMenu = menu;

    const closeHandler = function () {
      if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
      }
      document.removeEventListener('click', closeHandler);
    };
    setTimeout(function () {
      document.addEventListener('click', closeHandler);
    }, 10);
  }

  // Expose window.myNotes matching Electron preload interface
  window.myNotes = {
    snapshot: async function () {
      const res = await fetch('/api/snapshot');
      if (!res.ok) throw new Error('無法讀取筆記資料');
      return res.json();
    },
    mutate: async function (action, payload, digest) {
      const res = await fetch('/api/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, digest })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');
      return data;
    },
    openFloating: function (id) {
      // In web browser: open floating note in a small popup window
      const w = 340, h = 380;
      const left = (window.screen.width - w) / 2;
      const top = (window.screen.height - h) / 4;
      window.open(
        '/?floating=' + encodeURIComponent(id),
        'tessera_floating_' + id,
        'width=' + w + ',height=' + h + ',top=' + top + ',left=' + left + ',resizable=yes,scrollbars=no'
      );
    },
    showNoteMenu: function (id) {
      showWebContextMenu(id, lastContextMenuPos.x, lastContextMenuPos.y);
    },
    closeFloating: function () {
      if (window.opener) {
        window.close();
      } else {
        const floating = document.getElementById('floating');
        if (floating) floating.classList.add('hidden');
        const app = document.getElementById('app');
        if (app) app.classList.remove('hidden');
      }
    },
    moveFloating: function () {},
    collapseFloating: async function () {},
    mainCommand: function (command) {
      emitCommand(command);
    },
    onUpdate: function (callback) {
      updateListeners.add(callback);
      return function () { updateListeners.delete(callback); };
    },
    onCommand: function (callback) {
      commandListeners.add(callback);
      return function () { commandListeners.delete(callback); };
    },
    onFloatingFocus: function (callback) {
      window.addEventListener('focus', function () { callback(true); });
      window.addEventListener('blur', function () { callback(false); });
      return function () {};
    },
    onNoteAction: function (callback) {
      noteActionListeners.add(callback);
      return function () { noteActionListeners.delete(callback); };
    }
  };
})();
