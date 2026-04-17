const BASE_URL = "https://lms.gakusei.kyoto-u.ac.jp";
const FETCH_INTERVAL_MIN = 5;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("fetchDeadlines", { periodInMinutes: FETCH_INTERVAL_MIN });
  fetchAllDeadlines();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "fetchDeadlines") {
    fetchAllDeadlines();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "getDeadlines") {
    chrome.storage.local.get(["assignments", "quizzes", "lastFetched", "fetchError"], (data) => {
      sendResponse(data);
    });
    return true;
  }
  if (msg.action === "forceRefresh") {
    fetchAllDeadlines().then((data) => sendResponse(data));
    return true;
  }
  if (msg.action === "exportData") {
    exportCourseData()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function fetchAllDeadlines() {
  try {
    const [assignments, quizzes] = await Promise.all([
      fetchAssignments(),
      fetchQuizzes(),
    ]);

    const now = Date.now();
    const data = {
      assignments,
      quizzes,
      lastFetched: now,
      fetchError: null,
    };
    await chrome.storage.local.set(data);
    updateBadge([...assignments, ...quizzes]);
    return data;
  } catch (err) {
    const errorData = { fetchError: err.message, lastFetched: Date.now() };
    await chrome.storage.local.set(errorData);
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
    return errorData;
  }
}

async function fetchAssignments() {
  const res = await fetch(`${BASE_URL}/direct/assignment/my.json`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`課題取得失敗 (${res.status})`);

  const json = await res.json();
  const collection = json.assignment_collection || [];
  const now = Date.now();

  return collection
    .filter((a) => {
      const due = a.dueTime?.epochSecond
        ? a.dueTime.epochSecond * 1000
        : a.dueDate;
      return due && due > now - 24 * 60 * 60 * 1000;
    })
    .map((a) => ({
      id: a.id || a.assignmentId,
      title: a.title || a.assignmentTitle,
      siteTitle: a.siteTitle || a.context || "",
      dueDate: a.dueTime?.epochSecond
        ? a.dueTime.epochSecond * 1000
        : a.dueDate,
      url: a.entityURL || `${BASE_URL}/direct/assignment/${a.id || a.assignmentId}`,
      type: "assignment",
    }))
    .sort((a, b) => a.dueDate - b.dueDate);
}

async function fetchQuizzes() {
  let sites;
  try {
    const res = await fetch(`${BASE_URL}/direct/site.json?_limit=100`, {
      credentials: "include",
    });
    if (!res.ok) return [];
    const json = await res.json();
    sites = json.site_collection || [];
  } catch {
    return [];
  }

  const now = Date.now();
  const allQuizzes = [];

  const fetches = sites.map(async (site) => {
    try {
      const res = await fetch(
        `${BASE_URL}/direct/sam_pub/context/${site.id}.json`,
        { credentials: "include" }
      );
      if (!res.ok) return;
      const json = await res.json();
      const pubs = json.sam_pub_collection || [];

      for (const q of pubs) {
        const due = q.dueDate || q.retractDate;
        if (!due || due < now - 24 * 60 * 60 * 1000) continue;
        allQuizzes.push({
          id: q.id || q.publishedAssessmentId,
          title: q.title,
          siteTitle: site.title || site.id,
          dueDate: due,
          url: q.entityURL || `${BASE_URL}/portal/site/${site.id}/tool-reset/sakai.samigo`,
          type: "quiz",
        });
      }
    } catch {
      // skip failed sites
    }
  });

  await Promise.all(fetches);
  return allQuizzes.sort((a, b) => a.dueDate - b.dueDate);
}

function updateBadge(items) {
  const now = Date.now();
  const urgent = items.filter(
    (item) => item.dueDate > now && item.dueDate - now < 24 * 60 * 60 * 1000
  );
  if (urgent.length > 0) {
    chrome.action.setBadgeText({ text: String(urgent.length) });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// ── Export Feature ──

async function fetchSitesForExport() {
  const res = await fetch(`${BASE_URL}/direct/site.json?_limit=100`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`サイト取得失敗 (${res.status})`);
  const json = await res.json();
  return (json.site_collection || []).map((s) => ({
    id: s.id,
    title: s.title || "",
    description: s.description || "",
    type: s.type || "",
    createdDate: s.createdDate || null,
    modifiedDate: s.modifiedDate || null,
  }));
}

async function fetchDetailedAssignments() {
  const res = await fetch(`${BASE_URL}/direct/assignment/my.json`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.assignment_collection || []).map((a) => ({
    id: a.id || a.assignmentId,
    title: a.title || a.assignmentTitle || "",
    siteId: a.context || "",
    siteTitle: a.siteTitle || "",
    instructions: a.instructions || "",
    dueDate: a.dueTime?.epochSecond
      ? a.dueTime.epochSecond * 1000
      : a.dueDate,
    openDate: a.openTime?.epochSecond
      ? a.openTime.epochSecond * 1000
      : a.openDate || null,
    closeDate: a.closeTime?.epochSecond
      ? a.closeTime.epochSecond * 1000
      : a.closeDate || null,
    status: a.status || "",
    submissionType: a.submissionType || "",
    maxGradePoint: a.maxGradePoint || "",
    url:
      a.entityURL ||
      `${BASE_URL}/direct/assignment/${a.id || a.assignmentId}`,
    attachments: (a.attachments || []).map((att) => ({
      name: att.name || att.title || "",
      url: att.url || "",
      type: att.type || "",
      size: att.size || 0,
    })),
  }));
}

async function fetchSiteResources(siteId) {
  try {
    const res = await fetch(
      `${BASE_URL}/direct/content/site/${siteId}.json`,
      { credentials: "include" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const collection = json.content_collection || [];
    return collection
      .filter((item) => item.type !== "collection")
      .map((item) => ({
        id: item.entityId || item.resourceId || item.id || "",
        name: item.name || item.title || "",
        path: item.resourceId || item.container || "",
        type: item.type || "",
        size: item.size || 0,
        url: item.url
          ? item.url.startsWith("http")
            ? item.url
            : `${BASE_URL}${item.url}`
          : "",
        modifiedDate: item.modifiedDate || item.modifiedTime || null,
      }));
  } catch {
    return [];
  }
}

async function fetchSiteQuizzes(siteId) {
  try {
    const res = await fetch(
      `${BASE_URL}/direct/sam_pub/context/${siteId}.json`,
      { credentials: "include" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.sam_pub_collection || []).map((q) => ({
      id: q.id || q.publishedAssessmentId || "",
      title: q.title || "",
      dueDate: q.dueDate || q.retractDate || null,
      url:
        q.entityURL ||
        `${BASE_URL}/portal/site/${siteId}/tool-reset/sakai.samigo`,
    }));
  } catch {
    return [];
  }
}

async function getSessionCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ url: BASE_URL });
    if (!cookies.length) return null;
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch {
    return null;
  }
}

async function exportCourseData() {
  // Fetch sites, assignments, and session cookies in parallel
  const [sites, allAssignments, cookieStr] = await Promise.all([
    fetchSitesForExport(),
    fetchDetailedAssignments(),
    getSessionCookies(),
  ]);

  // Group assignments by site
  const assignmentsBySite = {};
  for (const a of allAssignments) {
    if (!assignmentsBySite[a.siteId]) assignmentsBySite[a.siteId] = [];
    assignmentsBySite[a.siteId].push(a);
  }

  // Fetch resources and quizzes for each site in parallel
  const siteDetails = await Promise.all(
    sites.map(async (site) => {
      const [resources, quizzes] = await Promise.all([
        fetchSiteResources(site.id),
        fetchSiteQuizzes(site.id),
      ]);
      return {
        ...site,
        assignments: assignmentsBySite[site.id] || [],
        resources,
        quizzes,
      };
    })
  );

  // Pre-accept copyright for all resources
  const allResourceUrls = siteDetails.flatMap((s) =>
    s.resources.filter((r) => r.url).map((r) => r.url)
  );
  await Promise.all(
    allResourceUrls.map(async (url) => {
      try {
        const path = new URL(url).pathname;
        const ref = path.replace("/access/content", "/content");
        await fetch(`${BASE_URL}/access/accept?ref=${ref}&url=${path}`, {
          credentials: "include",
        });
      } catch {}
    })
  );

  const now = new Date();
  const exportData = {
    exportedAt: now.toISOString(),
    version: 1,
    _sensitive: true,
    baseUrl: BASE_URL,
    _auth: cookieStr
      ? {
          cookie: cookieStr,
          expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          warning: "短命なセッション。処理後このファイルを削除してください。",
        }
      : null,
    sites: siteDetails,
  };

  // Trigger download via data URL
  const jsonStr = JSON.stringify(exportData, null, 2);
  const dataUrl =
    "data:application/json;charset=utf-8," +
    encodeURIComponent(jsonStr);
  const date = now.toISOString().slice(0, 10);

  await chrome.downloads.download({
    url: dataUrl,
    filename: `kulms-export-${date}.json`,
  });

  return { success: true, siteCount: siteDetails.length };
}
