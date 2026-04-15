const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const errorEl = document.getElementById("error");
const lastFetchedEl = document.getElementById("lastFetched");
const refreshBtn = document.getElementById("refreshBtn");
const exportBtn = document.getElementById("exportBtn");

function getUrgencyClass(dueDate) {
  const remaining = dueDate - Date.now();
  if (remaining <= 0) return "urgency-overdue";
  if (remaining <= 24 * 60 * 60 * 1000) return "urgency-red";
  if (remaining <= 3 * 24 * 60 * 60 * 1000) return "urgency-orange";
  if (remaining <= 7 * 24 * 60 * 60 * 1000) return "urgency-yellow";
  if (remaining <= 14 * 24 * 60 * 60 * 1000) return "urgency-green";
  return "urgency-default";
}

function formatRemaining(dueDate) {
  const diff = dueDate - Date.now();
  if (diff <= 0) return "締切超過";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) {
    const mins = Math.floor(diff / (1000 * 60));
    return `残り${mins}分`;
  }
  if (hours < 24) return `残り${hours}時間`;
  const days = Math.floor(hours / 24);
  return `残り${days}日`;
}

function formatDate(ts) {
  const d = new Date(ts);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${mins}`;
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  return `${hours}時間前`;
}

function render(data) {
  listEl.innerHTML = "";

  if (data.fetchError) {
    errorEl.textContent = data.fetchError;
    errorEl.hidden = false;
  } else {
    errorEl.hidden = true;
  }

  if (data.lastFetched) {
    lastFetchedEl.textContent = `更新: ${relativeTime(data.lastFetched)}`;
  }

  const items = [
    ...(data.assignments || []),
    ...(data.quizzes || []),
  ].sort((a, b) => a.dueDate - b.dueDate);

  if (items.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  for (const item of items) {
    const row = document.createElement("a");
    row.className = `popup-item ${getUrgencyClass(item.dueDate)}`;
    row.href = item.url;
    row.target = "_blank";
    row.rel = "noopener";

    const typeLabel = item.type === "quiz" ? "小テスト" : "課題";

    row.innerHTML = `
      <div class="popup-item-top">
        <span class="popup-item-course">${escapeHtml(item.siteTitle)}</span>
        <span class="popup-item-remaining">${formatRemaining(item.dueDate)}</span>
      </div>
      <div class="popup-item-bottom">
        <span class="popup-item-type">${typeLabel}</span>
        <span class="popup-item-name">${escapeHtml(item.title)}</span>
        <span class="popup-item-date">${formatDate(item.dueDate)}</span>
      </div>
    `;
    listEl.appendChild(row);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function load() {
  chrome.storage.local.get(
    ["assignments", "quizzes", "lastFetched", "fetchError"],
    render
  );
}

refreshBtn.addEventListener("click", () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "更新中...";
  chrome.runtime.sendMessage({ action: "forceRefresh" }, () => {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "今すぐ更新";
    load();
  });
});

exportBtn.addEventListener("click", () => {
  exportBtn.disabled = true;
  exportBtn.textContent = "取得中...";
  chrome.runtime.sendMessage({ action: "exportData" }, (result) => {
    exportBtn.disabled = false;
    if (result?.success) {
      exportBtn.textContent = `完了 (${result.siteCount}件)`;
      setTimeout(() => {
        exportBtn.textContent = "エクスポート";
      }, 3000);
    } else {
      exportBtn.textContent = "エラー";
      exportBtn.title = result?.error || "";
      setTimeout(() => {
        exportBtn.textContent = "エクスポート";
        exportBtn.title = "";
      }, 5000);
    }
  });
});

load();
