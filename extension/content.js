(() => {
  const PANEL_ID = "kulms-panel";
  const TOGGLE_ID = "kulms-header-toggle";
  const OVERLAY_ID = "kulms-overlay";

  // ── Utility ──

  function getUrgencyClass(dueDate) {
    const remaining = dueDate - Date.now();
    if (remaining <= 0) return "kulms-urgency-overdue";
    if (remaining <= 24 * 60 * 60 * 1000) return "kulms-urgency-red";
    if (remaining <= 3 * 24 * 60 * 60 * 1000) return "kulms-urgency-orange";
    if (remaining <= 7 * 24 * 60 * 60 * 1000) return "kulms-urgency-yellow";
    if (remaining <= 14 * 24 * 60 * 60 * 1000) return "kulms-urgency-green";
    return "kulms-urgency-default";
  }

  function getUrgencyGroup(dueDate) {
    const remaining = dueDate - Date.now();
    if (remaining <= 0) return "締切超過";
    if (remaining <= 24 * 60 * 60 * 1000) return "締め切り24時間以内";
    if (remaining <= 3 * 24 * 60 * 60 * 1000) return "締め切り3日以内";
    if (remaining <= 7 * 24 * 60 * 60 * 1000) return "締め切り7日以内";
    if (remaining <= 14 * 24 * 60 * 60 * 1000) return "締め切り14日以内";
    return "締め切りまで14日以上";
  }

  function getGroupColor(group) {
    const map = {
      "締切超過": "#6b7280",
      "締め切り24時間以内": "#ef4444",
      "締め切り3日以内": "#f97316",
      "締め切り7日以内": "#eab308",
      "締め切り14日以内": "#22c55e",
      "締め切りまで14日以上": "#3b82f6",
    };
    return map[group] || "#71717a";
  }

  function formatRemaining(dueDate) {
    const diff = dueDate - Date.now();
    if (diff <= 0) return "締切超過";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) {
      const mins = Math.floor(diff / (1000 * 60));
      return `あと${mins}分`;
    }
    if (hours < 24) return `あと${hours}時間`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `あと${days}日${remHours}時間`;
  }

  function formatDateTime(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const mo = d.getMonth() + 1;
    const da = d.getDate();
    const h = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${mo}/${da} ${h}:${mi}`;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Header toggle button ──

  function injectToggle(urgentCount) {
    if (document.getElementById(TOGGLE_ID)) {
      updateToggleBadge(urgentCount);
      return;
    }

    // Wrap in <li> to match Sakai header structure
    const li = document.createElement("li");
    li.className = "d-none d-md-inline";
    li.appendChild(createToggleButton(urgentCount));

    // Strategy 1: insert before the notification bell <li> in #sakai-system-indicators
    const indicators = document.getElementById("sakai-system-indicators");
    if (indicators) {
      const bellLi = indicators.querySelector(".portal-notifications-button")?.closest("li");
      if (bellLi) {
        indicators.insertBefore(li, bellLi);
        return;
      }
      // Before the account button <li> (last child)
      const accountLi = indicators.querySelector(".sak-sysInd-account")?.closest("li");
      if (accountLi) {
        indicators.insertBefore(li, accountLi);
        return;
      }
      indicators.appendChild(li);
      return;
    }

    // Fallback: fixed button at top-right corner
    const btn = li.querySelector("button");
    li.removeChild(btn);
    btn.style.position = "fixed";
    btn.style.top = "8px";
    btn.style.right = "80px";
    btn.style.zIndex = "99998";
    document.body.appendChild(btn);
  }

  function createToggleButton(urgentCount) {
    const btn = document.createElement("button");
    btn.id = TOGGLE_ID;
    btn.title = "KULMS Deadline";
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="13" r="8"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="13" x2="15" y2="13"/>
        <line x1="8" y1="4" x2="10" y2="6"/>
        <line x1="16" y1="4" x2="14" y2="6"/>
      </svg>
      <span class="kulms-toggle-badge" ${urgentCount > 0 ? "" : 'style="display:none"'}>${urgentCount}</span>
    `;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePanel();
    });
    return btn;
  }

  function updateToggleBadge(count) {
    const badge = document.querySelector(`#${TOGGLE_ID} .kulms-toggle-badge`);
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? "" : "none";
  }

  // ── Panel ──

  function togglePanel() {
    const panel = document.getElementById(PANEL_ID);
    const overlay = document.getElementById(OVERLAY_ID);
    if (panel) {
      panel.classList.toggle("kulms-panel-open");
      if (overlay) overlay.classList.toggle("kulms-overlay-visible");
      chrome.storage.local.set({ panelOpen: panel.classList.contains("kulms-panel-open") });
    }
  }

  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    const overlay = document.getElementById(OVERLAY_ID);
    if (panel) panel.classList.remove("kulms-panel-open");
    if (overlay) overlay.classList.remove("kulms-overlay-visible");
    chrome.storage.local.set({ panelOpen: false });
  }

  function buildPanel(items, lastFetched, fetchError) {
    let panel = document.getElementById(PANEL_ID);
    const wasOpen = panel && panel.classList.contains("kulms-panel-open");

    if (panel) panel.remove();
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.addEventListener("click", closePanel);
      document.body.appendChild(overlay);
    }

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    if (wasOpen) panel.classList.add("kulms-panel-open");

    // Header
    const header = document.createElement("div");
    header.className = "kulms-panel-header";
    header.innerHTML = `
      <div class="kulms-panel-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="13" r="8"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="13" x2="15" y2="13"/>
          <line x1="8" y1="4" x2="10" y2="6"/>
          <line x1="16" y1="4" x2="14" y2="6"/>
        </svg>
        <span>KULMS Deadline</span>
      </div>
      <button class="kulms-panel-close">&times;</button>
    `;
    header.querySelector(".kulms-panel-close").addEventListener("click", closePanel);
    panel.appendChild(header);

    // Fetch info
    const meta = document.createElement("div");
    meta.className = "kulms-panel-meta";
    if (fetchError) {
      meta.innerHTML = `<div class="kulms-panel-error">${escapeHtml(fetchError)}</div>`;
    }
    const assignmentItems = items.filter((i) => i.type === "assignment");
    const quizItems = items.filter((i) => i.type === "quiz");
    meta.innerHTML += `
      <div class="kulms-meta-row">
        <span>課題取得日時:</span>
        <span>${lastFetched ? formatDateTime(lastFetched) : "未取得"}</span>
      </div>
      <div class="kulms-meta-row">
        <span>課題 ${assignmentItems.length}件 / 小テスト ${quizItems.length}件</span>
      </div>
    `;
    panel.appendChild(meta);

    // Button row (refresh + export)
    const btnRow = document.createElement("div");
    btnRow.className = "kulms-panel-btn-row";

    const refreshBtn = document.createElement("button");
    refreshBtn.className = "kulms-panel-refresh";
    refreshBtn.textContent = "今すぐ更新";
    refreshBtn.addEventListener("click", () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "更新中...";
      chrome.runtime.sendMessage({ action: "forceRefresh" }, () => {
        refreshBtn.disabled = false;
        refreshBtn.textContent = "今すぐ更新";
      });
    });

    const exportBtn = document.createElement("button");
    exportBtn.className = "kulms-panel-export";
    exportBtn.textContent = "エクスポート";
    exportBtn.addEventListener("click", () => {
      exportBtn.disabled = true;
      exportBtn.textContent = "取得中...";
      chrome.runtime.sendMessage({ action: "exportData" }, (result) => {
        exportBtn.disabled = false;
        if (result?.success) {
          exportBtn.textContent = `完了 (${result.siteCount}件)`;
          setTimeout(() => { exportBtn.textContent = "エクスポート"; }, 3000);
        } else {
          exportBtn.textContent = "エラー";
          setTimeout(() => { exportBtn.textContent = "エクスポート"; }, 3000);
        }
      });
    });

    btnRow.appendChild(refreshBtn);
    btnRow.appendChild(exportBtn);
    panel.appendChild(btnRow);

    // Items grouped by urgency
    const sorted = [...items].sort((a, b) => a.dueDate - b.dueDate);
    const groups = new Map();
    for (const item of sorted) {
      const group = getUrgencyGroup(item.dueDate);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    }

    if (sorted.length === 0) {
      const empty = document.createElement("div");
      empty.className = "kulms-panel-empty";
      empty.textContent = "締切のある課題はありません";
      panel.appendChild(empty);
    }

    for (const [groupName, groupItems] of groups) {
      const section = document.createElement("div");
      section.className = "kulms-panel-section";

      const groupHeader = document.createElement("div");
      groupHeader.className = "kulms-panel-group-header";
      groupHeader.style.borderLeftColor = getGroupColor(groupName);
      groupHeader.textContent = groupName;
      section.appendChild(groupHeader);

      for (const item of groupItems) {
        const card = document.createElement("a");
        card.className = `kulms-panel-card ${getUrgencyClass(item.dueDate)}`;
        card.href = item.url;

        const typeTag = item.type === "quiz"
          ? `<span class="kulms-tag kulms-tag-quiz">クイズ</span>`
          : `<span class="kulms-tag kulms-tag-assignment">課題</span>`;

        card.innerHTML = `
          <div class="kulms-card-site">${escapeHtml(item.siteTitle)}</div>
          <div class="kulms-card-due">
            <span>${formatDateTime(item.dueDate)}</span>
            <span class="kulms-card-remaining">${formatRemaining(item.dueDate)}</span>
          </div>
          <div class="kulms-card-title">
            ${typeTag} ${escapeHtml(item.title)}
          </div>
        `;
        section.appendChild(card);
      }
      panel.appendChild(section);
    }

    document.body.appendChild(panel);

    // Badge count (24h以内)
    const now = Date.now();
    const urgentCount = items.filter(
      (i) => i.dueDate > now && i.dueDate - now < 24 * 60 * 60 * 1000
    ).length;
    injectToggle(urgentCount);
  }

  // ── Load & Render ──

  function loadAndRender() {
    chrome.runtime.sendMessage({ action: "getDeadlines" }, (data) => {
      if (chrome.runtime.lastError || !data) {
        injectToggle(0);
        return;
      }
      const all = [...(data.assignments || []), ...(data.quizzes || [])].sort(
        (a, b) => a.dueDate - b.dueDate
      );
      buildPanel(all, data.lastFetched, data.fetchError);
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.assignments || changes.quizzes) {
      loadAndRender();
    }
  });

  loadAndRender();

  // 1分ごとに残り時間を更新
  setInterval(() => {
    if (document.getElementById(PANEL_ID)) loadAndRender();
  }, 60 * 1000);
})();
