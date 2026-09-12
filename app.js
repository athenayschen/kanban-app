/**
 * 待辦清單 (Minimalist To-Do List)
 * 風格：北歐莫蘭迪色系 (Nordic Morandi)
 * 版面：三欄式看板 (Kanban Board - To-do, Process, Done)
 * 功能：
 *   - 三欄看板佈局與跨欄原生拖曳 (HTML5 Drag & Drop)
 *   - 優先順序切換 (點擊任務標籤循環切換：高 ➔ 中 ➔ 低)
 *   - 欄內排序 (高 ➔ 中 ➔ 低，同級依時限與建立時間排序)
 *   - 時間軸視圖 (Timeline View 依時間排程)
 *   - 工作/生活分類過濾
 *   - 本地儲存 (localStorage) 持久化與向下相容
 */

(() => {
  'use strict';

  // 本地儲存 Key
  const STORAGE_KEY = 'morandi_todo_items_v1';

  // 取得相對目前時間的格式化日期時間 (YYYY-MM-DDTHH:mm)
  function getSampleDateTime(offsetHours = 0) {
    const d = new Date(Date.now() + offsetHours * 3600000);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // 預設示範資料 (若首次開啟使用)
  const INITIAL_TASKS = [
    {
      id: 'demo-1',
      text: '整理本週專案進度與會議紀錄',
      category: 'work',
      priority: 'high',
      status: 'todo',
      dueDate: getSampleDateTime(4), // 今天稍後
      completed: false,
      createdAt: Date.now() - 3600000
    },
    {
      id: 'demo-2',
      text: '享受一杯手沖咖啡，閱讀 30 分鐘',
      category: 'life',
      priority: 'medium',
      status: 'process',
      dueDate: getSampleDateTime(24), // 明天
      completed: false,
      createdAt: Date.now() - 7200000
    },
    {
      id: 'demo-3',
      text: '規劃下半年個人成長閱讀書單',
      category: 'life',
      priority: 'low',
      status: 'done',
      dueDate: '',
      completed: true,
      createdAt: Date.now() - 10800000
    }
  ];

  // 優先順序配置
  const PRIORITY_CONFIG = {
    high: { label: '高', className: 'high', title: '點擊切換優先級 (目前：高 ➔ 中)', score: 3 },
    medium: { label: '中', className: 'medium', title: '點擊切換優先級 (目前：中 ➔ 低)', score: 2 },
    low: { label: '低', className: 'low', title: '點擊切換優先級 (目前：低 ➔ 高)', score: 1 }
  };

  // 狀態管理
  let tasks = [];
  let currentFilter = 'all'; // 'all' | 'work' | 'life'
  let currentView = 'board';  // 'board' | 'timeline'
  let draggedTaskId = null;   // 記錄目前被拖曳的任務 ID

  // DOM 元素引用
  const todoForm = document.getElementById('todoForm');
  const taskInput = document.getElementById('taskInput');
  const taskDueDate = document.getElementById('taskDueDate');
  const clearDateBtn = document.getElementById('clearDateBtn');

  // 看板欄位
  const kanbanBoard = document.getElementById('kanbanBoard');
  const colTodo = document.getElementById('colTodo');
  const colProcess = document.getElementById('colProcess');
  const colDone = document.getElementById('colDone');
  const countTodo = document.getElementById('countTodo');
  const countProcess = document.getElementById('countProcess');
  const countDone = document.getElementById('countDone');

  // 時間軸與空狀態
  const timelineView = document.getElementById('timelineView');
  const emptyState = document.getElementById('emptyState');
  const emptyDesc = document.getElementById('emptyDesc');

  // 統計與篩選
  const currentDateEl = document.getElementById('currentDate');
  const statsCountEl = document.getElementById('statsCount');
  const clearCompletedBtn = document.getElementById('clearCompletedBtn');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const badgeAll = document.getElementById('badgeAll');
  const badgeWork = document.getElementById('badgeWork');
  const badgeLife = document.getElementById('badgeLife');
  const viewBoardBtn = document.getElementById('viewBoardBtn');
  const viewTimelineBtn = document.getElementById('viewTimelineBtn');

  // 安全跳脫 HTML 防止 XSS
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // 產生唯一 ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  }

  // 載入本地儲存資料 (包含舊資料自動向下相容升級)
  function loadTasks() {
    // 支援網址 demo 測試快照資料
    const urlParams = new URLSearchParams(window.location.search);
    const demoData = urlParams.get('demo');
    if (demoData) {
      try {
        tasks = JSON.parse(decodeURIComponent(demoData));
        return;
      } catch (e) {}
    }

    const rawData = localStorage.getItem(STORAGE_KEY);
    if (rawData) {
      try {
        const parsed = JSON.parse(rawData);
        tasks = parsed.map(task => {
          // 向下相容：若無 status 欄位，由 completed 推導
          let status = task.status;
          if (!status) {
            status = task.completed ? 'done' : 'todo';
          }
          return {
            ...task,
            status,
            completed: status === 'done',
            priority: task.priority || 'medium',
            dueDate: task.dueDate || ''
          };
        });
      } catch (err) {
        console.error('無法解析本地儲存待辦事項，使用預設資料:', err);
        tasks = [...INITIAL_TASKS];
      }
    } else {
      tasks = [...INITIAL_TASKS];
      saveTasks();
    }
  }

  // 儲存資料至 localStorage
  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (err) {
      console.error('無法儲存待辦事項至本地儲存:', err);
    }
  }

  // 渲染當前頂部日期
  function renderDate() {
    const now = new Date();
    const options = { month: 'long', day: 'numeric', weekday: 'long' };
    const dateString = now.toLocaleDateString('zh-TW', options);
    currentDateEl.textContent = dateString;
  }

  // 時限解析與格式化
  function parseDueDate(dueDateStr) {
    if (!dueDateStr) return null;
    const due = new Date(dueDateStr);
    if (isNaN(due.getTime())) return null;

    const now = new Date();
    const isOverdue = due < now;

    // 是否為今天 / 明天
    const isToday = due.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = due.toDateString() === tomorrow.toDateString();

    const hours = String(due.getHours()).padStart(2, '0');
    const minutes = String(due.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    let dateBadgeText = '';
    if (isToday) {
      dateBadgeText = `今天 ${timeStr}`;
    } else if (isTomorrow) {
      dateBadgeText = `明天 ${timeStr}`;
    } else {
      const month = due.getMonth() + 1;
      const day = due.getDate();
      dateBadgeText = `${month}/${day} ${timeStr}`;
    }

    const dateKey = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    let groupTitle = '';
    if (isToday) {
      groupTitle = `今天 · ${due.getMonth() + 1}月${due.getDate()}日`;
    } else if (isTomorrow) {
      groupTitle = `明天 · ${due.getMonth() + 1}月${due.getDate()}日`;
    } else {
      const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
      groupTitle = `${due.getMonth() + 1}月${due.getDate()}日 · 星期${weekdayNames[due.getDay()]}`;
    }

    return {
      due,
      timeStr,
      dateKey,
      groupTitle,
      dateBadgeText,
      isOverdue,
      isToday,
      isTomorrow
    };
  }

  // 排序核心：高 (3) ➔ 中 (2) ➔ 低 (1)，同優先度時限先到者排前
  function sortColumnTasks(taskListArray) {
    return [...taskListArray].sort((a, b) => {
      // 1. 依優先級 高 ➔ 中 ➔ 低 排序
      const scoreA = PRIORITY_CONFIG[a.priority]?.score || 2;
      const scoreB = PRIORITY_CONFIG[b.priority]?.score || 2;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      // 2. 優先度相同時，有時限者排前，且較早截止排前
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      // 3. 最後依建立時間新至舊排序
      return b.createdAt - a.createdAt;
    });
  }

  // 建立單張看板卡片 HTML (支援拖曳 draggable="true")
  function createCardHtml(task) {
    const isWork = task.category === 'work';
    const categoryLabel = isWork ? '工作' : '生活';
    const categoryClass = isWork ? 'work' : 'life';
    const priorityData = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
    const dueInfo = parseDueDate(task.dueDate);
    const statusClass = `status-${task.status}`;

    // 時限標籤
    let deadlineHtml = '';
    if (dueInfo) {
      const isOverdue = dueInfo.isOverdue && task.status !== 'done';
      const badgeClass = isOverdue ? 'overdue' : (dueInfo.isToday ? 'today' : '');
      deadlineHtml = `
        <span class="badge-deadline ${badgeClass}" title="截止時限：${task.dueDate.replace('T', ' ')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>${dueInfo.dateBadgeText}${isOverdue ? ' (逾期)' : ''}</span>
        </span>
      `;
    }

    return `
      <div 
        class="kanban-card ${statusClass}" 
        draggable="true" 
        data-id="${task.id}" 
        data-status="${task.status}"
        aria-grabbed="false"
      >
        <div class="card-header-row">
          <span class="card-title">${escapeHtml(task.text)}</span>
          <button class="btn-delete" data-action="delete" aria-label="刪除任務" title="刪除任務">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
        <div class="card-footer-row">
          <div class="card-badges">
            <button 
              type="button"
              class="badge-priority ${priorityData.className} interactive" 
              data-action="cycle-priority" 
              title="${priorityData.title}"
            >
              ${priorityData.label}
            </button>
            <span class="badge-category ${categoryClass}">${categoryLabel}</span>
          </div>
          ${deadlineHtml}
        </div>
      </div>
    `;
  }

  // 渲染三欄式看板 (Kanban Board)
  function renderKanbanBoard(filteredTasks) {
    const todoTasks = sortColumnTasks(filteredTasks.filter(t => t.status === 'todo'));
    const processTasks = sortColumnTasks(filteredTasks.filter(t => t.status === 'process'));
    const doneTasks = sortColumnTasks(filteredTasks.filter(t => t.status === 'done'));

    // 更新各欄位徽章數字
    countTodo.textContent = todoTasks.length;
    countProcess.textContent = processTasks.length;
    countDone.textContent = doneTasks.length;

    // 渲染 To-do 欄
    colTodo.innerHTML = todoTasks.length > 0 
      ? todoTasks.map(createCardHtml).join('') 
      : '<div class="kanban-empty-placeholder">暫無待辦事項</div>';

    // 渲染 Process 欄
    colProcess.innerHTML = processTasks.length > 0 
      ? processTasks.map(createCardHtml).join('') 
      : '<div class="kanban-empty-placeholder">拖曳卡片至此開始處理</div>';

    // 渲染 Done 欄
    colDone.innerHTML = doneTasks.length > 0 
      ? doneTasks.map(createCardHtml).join('') 
      : '<div class="kanban-empty-placeholder">拖曳卡片至此標記完成</div>';
  }

  // 渲染時間軸視圖 (Timeline View)
  function renderTimelineView(filteredTasks) {
    const withDueDate = [];
    const withoutDueDate = [];

    filteredTasks.forEach(task => {
      if (task.dueDate && !isNaN(new Date(task.dueDate).getTime())) {
        withDueDate.push(task);
      } else {
        withoutDueDate.push(task);
      }
    });

    withDueDate.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    const groups = new Map();
    withDueDate.forEach(task => {
      const dueInfo = parseDueDate(task.dueDate);
      const key = dueInfo.dateKey;
      if (!groups.has(key)) {
        groups.set(key, {
          title: dueInfo.groupTitle,
          tasks: []
        });
      }
      groups.get(key).tasks.push({ task, dueInfo });
    });

    let timelineHtml = '';

    // 輸出有時限的分組時間軸
    groups.forEach(group => {
      const taskCards = group.tasks.map(({ task, dueInfo }) => {
        const isWork = task.category === 'work';
        const categoryLabel = isWork ? '工作' : '生活';
        const categoryClass = isWork ? 'work' : 'life';
        const isDone = task.status === 'done';
        const completedClass = isDone ? 'completed' : '';
        const isOverdue = dueInfo.isOverdue && !isDone;
        const overdueClass = isOverdue ? 'overdue' : '';
        const priorityData = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

        return `
          <div class="timeline-item ${overdueClass} ${completedClass}" data-id="${task.id}">
            <div class="timeline-card ${completedClass} ${overdueClass}">
              <div class="task-left">
                <div class="timeline-task-content">
                  <span class="task-text">${escapeHtml(task.text)}</span>
                  <span class="timeline-time-tag">
                    ${dueInfo.timeStr}${isOverdue ? ' · 已逾期' : ''}
                  </span>
                </div>
              </div>
              <div class="task-right">
                <button 
                  type="button"
                  class="badge-priority ${priorityData.className} interactive" 
                  data-action="cycle-priority" 
                  title="${priorityData.title}"
                >
                  ${priorityData.label}
                </button>
                <span class="badge-category ${categoryClass}">${categoryLabel}</span>
                <button class="btn-delete" data-action="delete" aria-label="刪除任務" title="刪除">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      timelineHtml += `
        <div class="timeline-group">
          <div class="timeline-group-header">
            <span class="timeline-date-title">${group.title}</span>
            <span class="timeline-header-badge">${group.tasks.length} 項</span>
          </div>
          <div class="timeline-track-container">
            ${taskCards}
          </div>
        </div>
      `;
    });

    // 輸出無特定時限的待辦事項
    if (withoutDueDate.length > 0) {
      const sortedWithout = sortColumnTasks(withoutDueDate);
      const noDateCards = sortedWithout.map(task => {
        const isWork = task.category === 'work';
        const categoryLabel = isWork ? '工作' : '生活';
        const categoryClass = isWork ? 'work' : 'life';
        const isDone = task.status === 'done';
        const completedClass = isDone ? 'completed' : '';
        const priorityData = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

        return `
          <div class="timeline-item ${completedClass}" data-id="${task.id}">
            <div class="timeline-card ${completedClass}">
              <div class="task-left">
                <div class="timeline-task-content">
                  <span class="task-text">${escapeHtml(task.text)}</span>
                  <span class="timeline-time-tag" style="background:#ECEFF1;color:#78909C;">無特定時限</span>
                </div>
              </div>
              <div class="task-right">
                <button 
                  type="button"
                  class="badge-priority ${priorityData.className} interactive" 
                  data-action="cycle-priority" 
                  title="${priorityData.title}"
                >
                  ${priorityData.label}
                </button>
                <span class="badge-category ${categoryClass}">${categoryLabel}</span>
                <button class="btn-delete" data-action="delete" aria-label="刪除任務" title="刪除">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      timelineHtml += `
        <div class="timeline-group">
          <div class="timeline-group-header">
            <span class="timeline-date-title">無特定時限</span>
            <span class="timeline-header-badge">${withoutDueDate.length} 項</span>
          </div>
          <div class="timeline-track-container">
            ${noDateCards}
          </div>
        </div>
      `;
    }

    timelineView.innerHTML = timelineHtml;
  }

  // 主渲染函數
  function render() {
    const totalCount = tasks.length;
    const workCount = tasks.filter(t => t.category === 'work').length;
    const lifeCount = tasks.filter(t => t.category === 'life').length;
    const doneCount = tasks.filter(t => t.status === 'done').length;
    const activeCount = totalCount - doneCount;

    // 更新篩選徽章數字
    badgeAll.textContent = totalCount;
    badgeWork.textContent = workCount;
    badgeLife.textContent = lifeCount;

    // 更新頂部待辦數量
    statsCountEl.textContent = `${activeCount} 項待處理`;

    // 判斷是否顯示「清除已完成」按鈕
    clearCompletedBtn.style.display = doneCount > 0 ? 'inline-block' : 'none';

    // 依分類過濾任務
    const filteredTasks = tasks.filter(task => {
      if (currentFilter === 'work') return task.category === 'work';
      if (currentFilter === 'life') return task.category === 'life';
      return true;
    });

    // 處理空狀態
    if (filteredTasks.length === 0) {
      kanbanBoard.style.display = 'none';
      timelineView.style.display = 'none';
      emptyState.classList.add('show');

      if (currentFilter === 'work') {
        emptyDesc.textContent = '目前沒有工作分類的任務，工作告一段落囉！';
      } else if (currentFilter === 'life') {
        emptyDesc.textContent = '目前沒有生活分類的任務，記錄點生活小確幸吧！';
      } else {
        emptyDesc.textContent = '目前沒有任何待辦事項，享受輕鬆片刻吧！';
      }
      return;
    }

    emptyState.classList.remove('show');

    // 根據檢視模式切換顯示與渲染
    if (currentView === 'timeline') {
      kanbanBoard.style.display = 'none';
      timelineView.style.display = 'flex';
      renderTimelineView(filteredTasks);
    } else {
      kanbanBoard.style.display = 'grid';
      timelineView.style.display = 'none';
      renderKanbanBoard(filteredTasks);
    }
  }

  // 跨欄移動任務狀態
  function moveTaskToStatus(taskId, newStatus) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    if (task.status === newStatus) return;

    task.status = newStatus;
    task.completed = (newStatus === 'done');
    saveTasks();
    render();
  }

  // 新增任務 (預設進入 To-do 欄)
  function handleAddTask(event) {
    event.preventDefault();
    const text = taskInput.value.trim();
    if (!text) return;

    // 取得分類、優先順序與時限
    const categoryRadios = todoForm.elements['category'];
    const category = categoryRadios ? (categoryRadios.value || 'work') : 'work';

    const priorityRadios = todoForm.elements['priority'];
    const priority = priorityRadios ? (priorityRadios.value || 'medium') : 'medium';

    const dueDate = taskDueDate ? taskDueDate.value : '';

    const newTask = {
      id: generateId(),
      text: text,
      category: category,
      priority: priority,
      status: 'todo', // 預設為待辦
      dueDate: dueDate,
      completed: false,
      createdAt: Date.now()
    };

    tasks.unshift(newTask);
    saveTasks();
    render();

    // 清空輸入框
    taskInput.value = '';
    if (taskDueDate) {
      taskDueDate.value = '';
      clearDateBtn.style.display = 'none';
    }
    taskInput.focus();
  }

  // 循環切換優先級 (高 ➔ 中 ➔ 低 ➔ 高)
  function cyclePriority(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const nextPriority = {
      high: 'medium',
      medium: 'low',
      low: 'high'
    };
    task.priority = nextPriority[task.priority || 'medium'] || 'medium';
    saveTasks();
    render();
  }

  // 刪除特定任務
  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    render();
  }

  // 清除所有已完成任務
  function clearCompleted() {
    tasks = tasks.filter(t => t.status !== 'done');
    saveTasks();
    render();
  }

  // 切換分類篩選
  function handleFilterChange(event) {
    const btn = event.target.closest('.filter-tab');
    if (!btn) return;

    const filter = btn.dataset.filter;
    if (!filter || filter === currentFilter) return;

    currentFilter = filter;

    filterTabs.forEach(tab => {
      const isActive = tab.dataset.filter === currentFilter;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    render();
  }

  // 切換檢視模式 (看板 / 時間軸)
  function setView(view) {
    if (currentView === view) return;
    currentView = view;

    viewBoardBtn.classList.toggle('active', currentView === 'board');
    viewTimelineBtn.classList.toggle('active', currentView === 'timeline');

    render();
  }

  // 點擊事件委派 (切換優先級 / 刪除)
  function handleActionClick(event) {
    const target = event.target;
    const cardEl = target.closest('[data-id]');
    if (!cardEl) return;

    const taskId = cardEl.dataset.id;
    const actionEl = target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;

    if (action === 'cycle-priority') {
      event.preventDefault();
      event.stopPropagation();
      cyclePriority(taskId);
    } else if (action === 'delete') {
      event.preventDefault();
      event.stopPropagation();
      deleteTask(taskId);
    }
  }

  // 設置原生拖曳監聽器 (Drag and Drop)
  function setupDragAndDrop() {
    // 監聽拖曳開始 (dragstart)
    document.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.kanban-card');
      if (!card) return;

      draggedTaskId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedTaskId);
    });

    // 監聽拖曳結束 (dragend)
    document.addEventListener('dragend', (e) => {
      const card = e.target.closest('.kanban-card');
      if (card) {
        card.classList.remove('dragging');
      }
      draggedTaskId = null;
      document.querySelectorAll('.kanban-column-body.drag-over').forEach(col => {
        col.classList.remove('drag-over');
      });
    });

    // 針對三個欄位本體監聽拖曳事件
    const columns = [colTodo, colProcess, colDone];

    columns.forEach(col => {
      if (!col) return;

      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      col.addEventListener('dragenter', (e) => {
        e.preventDefault();
        col.classList.add('drag-over');
      });

      col.addEventListener('dragleave', (e) => {
        // 當游標離開該欄位元素時移除高亮
        if (!col.contains(e.relatedTarget)) {
          col.classList.remove('drag-over');
        }
      });

      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
        const targetStatus = col.dataset.status;

        if (taskId && targetStatus) {
          moveTaskToStatus(taskId, targetStatus);
        }
      });
    });
  }

  // 初始化
  function init() {
    renderDate();
    loadTasks();
    render();

    // 設置拖曳
    setupDragAndDrop();

    // 表單送出
    todoForm.addEventListener('submit', handleAddTask);

    // 時限清除按鈕連動
    if (taskDueDate && clearDateBtn) {
      taskDueDate.addEventListener('input', () => {
        clearDateBtn.style.display = taskDueDate.value ? 'inline-block' : 'none';
      });
      clearDateBtn.addEventListener('click', () => {
        taskDueDate.value = '';
        clearDateBtn.style.display = 'none';
      });
    }

    // 看板與時間軸事件委派
    kanbanBoard.addEventListener('click', handleActionClick);
    timelineView.addEventListener('click', handleActionClick);

    // 工具列按鈕
    clearCompletedBtn.addEventListener('click', clearCompleted);

    filterTabs.forEach(tab => {
      tab.addEventListener('click', handleFilterChange);
    });

    viewBoardBtn.addEventListener('click', () => setView('board'));
    viewTimelineBtn.addEventListener('click', () => setView('timeline'));

    // 支援網址參數預設檢視 (?view=timeline)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'timeline') {
      setView('timeline');
    }
  }

  // 頁面就緒後執行
  document.addEventListener('DOMContentLoaded', init);
})();
