import { MESSAGE_TYPES, STORAGE_KEYS, TREE_GROUPINGS, VIEW_MODES } from "../common/constants.js";

const CATEGORY_ICONS = {
  개발: "🛠",
  디자인: "🎨",
  문서: "📄",
  학습: "📚",
  뉴스: "📰",
  커뮤니티: "💬",
  영상: "🎬",
  쇼핑: "🛒",
  기타: "📁"
};

const TIME_BUCKETS = [
  { key: "today", label: "오늘 저장", predicate: (diffHours) => diffHours < 24 },
  { key: "week", label: "이번 주", predicate: (diffHours) => diffHours < 24 * 7 },
  { key: "month", label: "이번 달", predicate: (diffHours) => diffHours < 24 * 30 },
  { key: "older", label: "오래된 링크", predicate: () => true }
];

const state = {
  links: [],
  search: "",
  tagFilter: "__all",
  showArchived: false,
  viewMode: VIEW_MODES.LIST,
  treeGrouping: TREE_GROUPINGS.TAG,
  graphSettings: {
    minClusterCount: 1,
    forceScale: 1
  },
  graphFilters: {
    categories: []
  },
  isPrivateView: false,
  privateUnlocked: false,
  isLoading: true
};

const elements = {
  list: document.getElementById("link-list"),
  search: document.getElementById("search-input"),
  tagFilter: document.getElementById("tag-filter"),
  treeGrouping: document.getElementById("tree-grouping"),
  toggleArchived: document.getElementById("toggle-archived"),
  saveCurrent: document.getElementById("save-current"),
  status: document.getElementById("status-text"),
  listViewBtn: document.getElementById("list-view-btn"),
  treeViewBtn: document.getElementById("tree-view-btn"),
  graphViewBtn: document.getElementById("graph-view-btn"),
  privateHotspot: document.getElementById("private-hotspot"),
  graphControls: document.getElementById("graph-controls"),
  graphMinCluster: document.getElementById("graph-min-cluster"),
  graphMinClusterValue: document.getElementById("graph-min-cluster-value"),
  graphForceScale: document.getElementById("graph-force-scale"),
  graphForceScaleValue: document.getElementById("graph-force-scale-value"),
  exportLinksBtn: document.getElementById("export-links-btn"),
  importDropzone: document.getElementById("import-dropzone"),
  importFileInput: document.getElementById("import-file-input"),
  changePinBtn: document.getElementById("change-pin-btn")
};

function setStatus(message, tone = "info") {
  if (!elements.status) return;
  elements.status.textContent = message ?? "";
  elements.status.classList.remove("success", "error");
  if (tone === "success") {
    elements.status.classList.add("success");
  } else if (tone === "error") {
    elements.status.classList.add("error");
  }
}

async function sendMessage(type, payload = {}) {
  try {
    const response = await chrome.runtime.sendMessage({ type, payload });
    if (!response) {
      throw new Error("응답이 없습니다.");
    }
    if (!response.ok) {
      throw new Error(response.error ?? "요청 실패");
    }
    return response.data;
  } catch (error) {
    console.error("LinkMinder popup message error", error);
    throw error;
  }
}

async function fetchPinStatus() {
  const result = await sendMessage(MESSAGE_TYPES.PIN_STATUS);
  return Boolean(result?.hasPin);
}

async function setPrivatePin(pin) {
  await sendMessage(MESSAGE_TYPES.SET_PIN, { pin });
  state.privateUnlocked = true;
  return true;
}

async function verifyPrivatePin(pin) {
  const result = await sendMessage(MESSAGE_TYPES.VERIFY_PIN, { pin });
  return Boolean(result?.match);
}

async function ensurePrivateUnlocked() {
  if (state.privateUnlocked) {
    return true;
  }
  const hasPin = await fetchPinStatus();
  if (!hasPin) {
    const first = prompt("새로운 4자리 PIN을 설정하세요.");
    if (first == null) {
      return false;
    }
    const trimmed = first.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      alert("PIN은 숫자 4자리여야 합니다.");
      return false;
    }
    const confirmPin = prompt("PIN을 한 번 더 입력해 주세요.");
    if (confirmPin == null) {
      return false;
    }
    if (trimmed !== confirmPin.trim()) {
      alert("PIN이 일치하지 않습니다.");
      return false;
    }
    await setPrivatePin(trimmed);
    alert("프라이빗 영역 PIN이 설정되었습니다.");
    return true;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const input = prompt("프라이빗 PIN 4자리를 입력하세요.");
    if (input == null) {
      return false;
    }
    const trimmed = input.trim();
    if (!/^\d{4}$/.test(trimmed)) {
      alert("PIN은 숫자 4자리여야 합니다.");
      continue;
    }
    const match = await verifyPrivatePin(trimmed);
    if (match) {
      state.privateUnlocked = true;
      return true;
    }
    alert("PIN이 일치하지 않습니다.");
  }
  alert("PIN 인증에 실패했습니다. 다시 시도해 주세요.");
  return false;
}

function enterPrivateView() {
  state.isPrivateView = true;
  updateViewControls();
  render();
  setStatus("프라이빗 공간을 열었습니다.", "success");
}

function exitPrivateView() {
  state.isPrivateView = false;
  updateViewControls();
  render();
  setStatus("프라이빗 공간을 닫았습니다.", "info");
}

async function exportLinksToFile() {
  try {
    setStatus("링크를 내보내는 중...", "info");
    const links = await sendMessage(MESSAGE_TYPES.EXPORT_LINKS, {
      privateOnly: state.isPrivateView
    });
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      scope: state.isPrivateView ? "private" : "public",
      links: Array.isArray(links) ? links : []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const filename = `linkminder-export-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;

    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: true
      },
      () => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.error("Download failed", error);
          setStatus("내보내기에 실패했습니다.", "error");
        } else {
          setStatus("링크를 내보냈습니다.", "success");
        }
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    );
  } catch (error) {
    console.error("Export failed", error);
    setStatus("내보내기에 실패했습니다.", "error");
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

async function importLinksFromFiles(fileList) {
  if (!fileList || fileList.length === 0) {
    return;
  }
  try {
    setStatus("링크를 불러오는 중...", "info");
    const aggregate = [];
    for (const file of fileList) {
      const text = await readFileAsText(file);
      let parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsed = parsed.links ?? parsed.items;
      }
      if (!Array.isArray(parsed)) {
        throw new Error("파일 형식이 올바르지 않습니다.");
      }
      aggregate.push(...parsed);
    }

    if (state.isPrivateView) {
      const unlocked = await ensurePrivateUnlocked();
      if (!unlocked) {
        setStatus("프라이빗 PIN 인증이 필요합니다.", "error");
        return;
      }
    }

    const result = await sendMessage(MESSAGE_TYPES.IMPORT_LINKS, {
      items: aggregate,
      targetPrivate: state.isPrivateView
    });
    if (result) {
      updateLinks(result);
      setStatus(`링크 ${aggregate.length}개를 불러왔습니다.`, "success");
    } else {
      setStatus("불러오기 결과를 확인하지 못했습니다.", "error");
    }
  } catch (error) {
    console.error("Import failed", error);
    setStatus("불러오기에 실패했습니다.", "error");
  }
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (error) {
    return "";
  }
}

function applyFilters() {
  const search = state.search.trim().toLowerCase();
  return state.links.filter((item) => {
    if (state.isPrivateView) {
      if (!item.private) {
        return false;
      }
    } else if (item.private) {
      return false;
    }
    if (!state.showArchived && item.archived) {
      return false;
    }
    if (state.tagFilter !== "__all") {
      if (!Array.isArray(item.tags) || !item.tags.includes(state.tagFilter)) {
        return false;
      }
    }
    if (!search) {
      return true;
    }
    const target = [
      item.title ?? "",
      item.url ?? "",
      item.category ?? "",
      (item.tags ?? []).join(" "),
      item.meta?.description ?? ""
    ]
      .join(" ")
      .toLowerCase();
    return target.includes(search);
  });
}

function disposeGraph() {}

function configureContainerForView() {
  elements.list.classList.remove("link-list", "tree-container", "graph-container");
  switch (state.viewMode) {
    case VIEW_MODES.LIST:
      elements.list.classList.add("link-list");
      break;
    case VIEW_MODES.TREE:
      elements.list.classList.add("tree-container");
      break;
    case VIEW_MODES.GRAPH:
      elements.list.classList.add("graph-container");
      break;
    default:
      elements.list.classList.add("link-list");
  }
}

function renderEmpty(message) {
  disposeGraph();
  configureContainerForView();
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = message;
  elements.list.replaceChildren(empty);
}

function createTagPill(tag) {
  const pill = document.createElement("span");
  pill.className = "tag";
  pill.textContent = tag;
  return pill;
}

function createButton(label, options = {}) {
  const button = document.createElement("button");
  const { variant, icon } = options;

  if (icon) {
    const iconSpan = document.createElement("span");
    iconSpan.textContent = icon;
    iconSpan.style.marginRight = "0.35rem";
    button.append(iconSpan);
  }

  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;
  button.append(labelSpan);

  if (variant) {
    switch (variant) {
      case "ghost":
        button.classList.add("button-ghost");
        break;
      case "secondary":
        button.classList.add("button-secondary");
        break;
      case "danger":
        button.classList.add("button-danger");
        break;
      default:
        button.classList.add(variant);
        break;
    }
  }
  if (options.onClick) {
    button.addEventListener("click", options.onClick);
  }
  if (options.title) {
    button.title = options.title;
  }
  return button;
}

async function handleCopyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    setStatus("링크를 복사했습니다.", "success");
  } catch (error) {
    console.error("Clipboard write failed", error);
    setStatus("클립보드에 복사하지 못했습니다.", "error");
  }
}

function createCard(link, { compact = false } = {}) {
  const card = document.createElement("article");
  card.className = "link-card";
  if (compact) {
    card.classList.add("tree__link-card");
  }
  if (link.archived) {
    card.classList.add("archived");
  }

  const header = document.createElement("div");
  header.className = "link-card__header";

  const title = document.createElement("h2");
  title.className = "link-card__title";
  title.textContent = link.title || link.meta?.title || getDomain(link.url) || link.url;

  const meta = document.createElement("div");
  meta.className = "link-card__meta";
  const domain = getDomain(link.url);
  const savedAt = formatDateTime(link.createdAt);

  const category = document.createElement("span");
  category.className = "category";
  const categoryLabel = link.category ?? "기타";
  category.textContent = `${CATEGORY_ICONS[categoryLabel] ?? CATEGORY_ICONS.기타} ${categoryLabel}`;
  if (link.confidence) {
    category.title = `예측 신뢰도 ${(link.confidence * 100).toFixed(0)}%`;
  }

  meta.append(category);
  if (domain) {
    meta.append(document.createTextNode(" · "));
    const domainEl = document.createElement("span");
    domainEl.textContent = domain;
    meta.append(domainEl);
  }
  if (savedAt) {
    meta.append(document.createTextNode(" · "));
    const savedEl = document.createElement("span");
    savedEl.textContent = savedAt;
    meta.append(savedEl);
  }

  header.append(title, meta);

  const linkAnchor = document.createElement("a");
  linkAnchor.className = "link-card__link";
  linkAnchor.href = link.url;
  linkAnchor.textContent = link.url;
  linkAnchor.target = "_blank";
  linkAnchor.rel = "noopener noreferrer";

  const description = document.createElement("p");
  description.className = "link-card__description";
  description.textContent = link.meta?.description || link.meta?.selectionText || "";
  if (!description.textContent) {
    description.style.display = "none";
  }

  const tagsRow = document.createElement("div");
  tagsRow.className = "tags";
  if (Array.isArray(link.tags) && link.tags.length > 0) {
    link.tags.forEach((tag) => {
      tagsRow.append(createTagPill(tag));
    });
  }

  const note = document.createElement("textarea");
  note.className = "note";
  note.placeholder = "메모 추가...";
  note.value = link.note ?? "";
  note.addEventListener("change", async (event) => {
    const nextNote = event.target.value;
    try {
      const updatedLinks = await sendMessage(MESSAGE_TYPES.UPDATE_NOTE, {
        id: link.id,
        note: nextNote
      });
      updateLinks(updatedLinks);
      setStatus("메모를 저장했습니다.", "success");
    } catch (error) {
      setStatus("메모 저장에 실패했습니다.", "error");
    }
  });

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const openButton = createButton("열기", {
    icon: "🔗",
    variant: "ghost",
    onClick: () => {
      chrome.tabs.create({ url: link.url, active: false });
      setStatus("새 탭으로 열었습니다.", "success");
    }
  });

  const copyButton = createButton("복사", {
    icon: "📋",
    variant: "ghost",
    onClick: () => handleCopyLink(link.url)
  });

  const archiveButton = createButton(link.archived ? "보관 해제" : "보관하기", {
    icon: link.archived ? "🗂" : "📥",
    variant: "secondary",
    onClick: async () => {
      try {
        const updatedLinks = await sendMessage(MESSAGE_TYPES.TOGGLE_ARCHIVE, { id: link.id });
        updateLinks(updatedLinks);
        setStatus(link.archived ? "보관에서 복원했습니다." : "보관함으로 옮겼습니다.", "success");
      } catch (error) {
        setStatus("상태를 변경하지 못했습니다.", "error");
      }
    }
  });

  const privateButton = createButton(link.private ? "공유로 전환" : "비공개", {
    icon: link.private ? "🔓" : "🔒",
    variant: link.private ? "secondary" : "ghost",
    onClick: async () => {
      if (!link.private) {
        const unlocked = await ensurePrivateUnlocked();
        if (!unlocked) {
          setStatus("프라이빗 PIN 인증이 필요합니다.", "error");
          return;
        }
      }
      try {
        const updatedLinks = await sendMessage(MESSAGE_TYPES.TOGGLE_PRIVATE, { id: link.id });
        updateLinks(updatedLinks);
        if (link.private) {
          setStatus("프라이빗 링크를 공개로 전환했습니다.", "success");
        } else {
          setStatus("링크를 프라이빗 공간으로 이동했습니다.", "success");
        }
      } catch (error) {
        setStatus("프라이빗 상태를 변경하지 못했습니다.", "error");
      }
    }
  });

  const deleteButton = createButton("삭제", {
    icon: "🗑",
    variant: "danger",
    onClick: async () => {
      if (!confirm("이 링크를 삭제할까요?")) {
        return;
      }
      try {
        const updatedLinks = await sendMessage(MESSAGE_TYPES.DELETE_LINK, { id: link.id });
        updateLinks(updatedLinks);
        setStatus("삭제했습니다.", "success");
      } catch (error) {
        setStatus("삭제하지 못했습니다.", "error");
      }
    }
  });

  actions.append(openButton, copyButton, archiveButton, privateButton, deleteButton);

  card.append(header, linkAnchor);
  if (description.style.display !== "none") {
    card.append(description);
  }
  if (tagsRow.childElementCount > 0) {
    card.append(tagsRow);
  }
  card.append(note, actions);

  return card;
}

function updateTagOptions() {
  const select = elements.tagFilter;
  const previous = select.value;

  select.replaceChildren();

  const defaultOption = document.createElement("option");
  defaultOption.value = "__all";
  defaultOption.textContent = "모든 태그";
  select.append(defaultOption);

  const tags = new Set();
  state.links.forEach((link) => {
    (link.tags ?? []).forEach((tag) => tags.add(tag));
  });

  Array.from(tags)
    .sort((a, b) => a.localeCompare(b))
    .forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      select.append(option);
    });

  if (previous && (previous === "__all" || tags.has(previous))) {
    select.value = previous;
    state.tagFilter = previous;
  } else {
    select.value = "__all";
    state.tagFilter = "__all";
  }
}

function updateViewControls() {
  const {
    listViewBtn,
    treeViewBtn,
    graphViewBtn,
    treeGrouping,
    graphControls,
    graphMinCluster,
    graphMinClusterValue,
    graphForceScale,
    graphForceScaleValue
  } = elements;
  if (!listViewBtn || !treeViewBtn || !graphViewBtn || !treeGrouping) {
    return;
  }
  const isList = state.viewMode === VIEW_MODES.LIST;
  const isTree = state.viewMode === VIEW_MODES.TREE;
  const isGraph = state.viewMode === VIEW_MODES.GRAPH;

  listViewBtn.classList.toggle("selected", isList);
  listViewBtn.setAttribute("aria-selected", String(isList));

  treeViewBtn.classList.toggle("selected", isTree);
  treeViewBtn.setAttribute("aria-selected", String(isTree));
  treeViewBtn.disabled = state.isPrivateView;

  graphViewBtn.classList.toggle("selected", isGraph);
  graphViewBtn.setAttribute("aria-selected", String(isGraph));

  if (elements.privateHotspot) {
    elements.privateHotspot.classList.toggle("secret-active", state.isPrivateView);
  }

  if (isTree) {
    treeGrouping.classList.remove("hidden");
    treeGrouping.value = state.treeGrouping;
  } else {
    treeGrouping.classList.add("hidden");
  }

  if (graphControls) {
    if (isGraph) {
      graphControls.classList.remove("hidden");
      if (graphMinCluster) {
        graphMinCluster.value = String(state.graphSettings.minClusterCount);
      }
      if (graphMinClusterValue) {
        graphMinClusterValue.textContent = String(state.graphSettings.minClusterCount);
      }
      if (graphForceScale) {
        graphForceScale.value = String(state.graphSettings.forceScale);
      }
      if (graphForceScaleValue) {
        graphForceScaleValue.textContent = `${state.graphSettings.forceScale.toFixed(1)}x`;
      }
    } else {
      graphControls.classList.add("hidden");
    }
  }

  if (elements.changePinBtn) {
    elements.changePinBtn.classList.toggle("hidden", !state.isPrivateView);
  }
}

function updateLinks(nextLinks) {
  state.links = Array.isArray(nextLinks) ? nextLinks : [];
  updateTagOptions();
  render();
}

function renderList(filtered) {
  disposeGraph();
  configureContainerForView();
  const fragment = document.createDocumentFragment();
  filtered.forEach((link) => {
    fragment.append(createCard(link));
  });
  elements.list.replaceChildren(fragment);
}

function buildCategoryNode(label) {
  return {
    type: "category",
    id: `category:${label}`,
    label,
    count: 0,
    badge: CATEGORY_ICONS[label] ?? CATEGORY_ICONS.기타,
    childrenMap: new Map()
  };
}

function createLinkNode(link) {
  return {
    type: "link",
    id: `link:${link.id}`,
    link
  };
}

function finalizeCategoryMap(categoryMap, groupSorter) {
  return Array.from(categoryMap.values())
    .map((category) => {
      const groups = Array.from(category.childrenMap.values()).sort(groupSorter);
      return {
        type: category.type ?? "category",
        id: category.id,
        label: category.label,
        count: category.count,
        badge: category.badge,
        children: groups
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildTreeByTag(links) {
  const categories = new Map();
  links.forEach((link) => {
    const categoryLabel = link.category ?? "기타";
    let category = categories.get(categoryLabel);
    if (!category) {
      category = buildCategoryNode(categoryLabel);
      categories.set(categoryLabel, category);
    }
    category.count += 1;

    const primaryTag = Array.isArray(link.tags) && link.tags.length > 0 ? link.tags[0] : "태그 없음";
    let group = category.childrenMap.get(primaryTag);
    if (!group) {
      group = {
        type: "group",
        id: `group:${categoryLabel}:${primaryTag}`,
        label: primaryTag,
        badge: "TAG",
        count: 0,
        children: []
      };
      category.childrenMap.set(primaryTag, group);
    }
    group.count += 1;
    group.children.push(createLinkNode(link));
  });

  return finalizeCategoryMap(categories, (a, b) => b.count - a.count || a.label.localeCompare(b.label)).map((category) => ({
    ...category,
    children: category.children.map((group) => ({
      ...group,
      children: group.children.sort((a, b) => {
        const aDate = new Date(a.link.createdAt ?? 0).getTime();
        const bDate = new Date(b.link.createdAt ?? 0).getTime();
        return bDate - aDate;
      })
    }))
  }));
}

function buildTreeByDomain(links) {
  const categories = new Map();
  links.forEach((link) => {
    const categoryLabel = link.category ?? "기타";
    let category = categories.get(categoryLabel);
    if (!category) {
      category = buildCategoryNode(categoryLabel);
      categories.set(categoryLabel, category);
    }
    category.count += 1;

    const domain = getDomain(link.url) || "도메인 없음";
    let group = category.childrenMap.get(domain);
    if (!group) {
      group = {
        type: "group",
        id: `domain:${categoryLabel}:${domain}`,
        label: domain,
        badge: "DOMAIN",
        count: 0,
        children: []
      };
      category.childrenMap.set(domain, group);
    }
    group.count += 1;
    group.children.push(createLinkNode(link));
  });

  return finalizeCategoryMap(categories, (a, b) => b.count - a.count || a.label.localeCompare(b.label)).map((category) => ({
    ...category,
    children: category.children.map((group) => ({
      ...group,
      children: group.children.sort((a, b) => a.link.title.localeCompare(b.link.title))
    }))
  }));
}

function buildTreeByTime(links) {
  const categories = new Map();
  const now = Date.now();

  links.forEach((link) => {
    const categoryLabel = link.category ?? "기타";
    let category = categories.get(categoryLabel);
    if (!category) {
      category = buildCategoryNode(categoryLabel);
      categories.set(categoryLabel, category);
    }
    category.count += 1;

    const createdTime = new Date(link.createdAt ?? 0).getTime();
    const diffHours = Number.isNaN(createdTime) ? Infinity : (now - createdTime) / (1000 * 60 * 60);
    const bucket = TIME_BUCKETS.find((candidate) => candidate.predicate(diffHours)) ?? TIME_BUCKETS[TIME_BUCKETS.length - 1];

    let group = category.childrenMap.get(bucket.key);
    if (!group) {
      group = {
        type: "group",
        id: `time:${categoryLabel}:${bucket.key}`,
        label: bucket.label,
        badge: "TIME",
        order: TIME_BUCKETS.findIndex((candidate) => candidate.key === bucket.key),
        count: 0,
        children: []
      };
      category.childrenMap.set(bucket.key, group);
    }
    group.count += 1;
    group.children.push(createLinkNode(link));
  });

  return finalizeCategoryMap(categories, (a, b) => {
    const aOrder = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
    const bOrder = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || b.count - a.count;
  }).map((category) => ({
    ...category,
    children: category.children.map((group) => ({
      ...group,
      children: group.children.sort((a, b) => {
        const aDate = new Date(a.link.createdAt ?? 0).getTime();
        const bDate = new Date(b.link.createdAt ?? 0).getTime();
        return bDate - aDate;
      })
    }))
  }));
}

function buildTreeByCluster(links) {
  const categories = new Map();

  links.forEach((link) => {
    const categoryLabel = link.category ?? "기타";
    let category = categories.get(categoryLabel);
    if (!category) {
      category = buildCategoryNode(categoryLabel);
      categories.set(categoryLabel, category);
    }
    category.count += 1;

    const cluster = link.cluster ?? {
      id: `cluster:${categoryLabel}:unassigned`,
      label: "토픽 미지정",
      keywords: []
    };
    const clusterId = cluster.id ?? `cluster:${categoryLabel}:${cluster.label}`;

    let group = category.childrenMap.get(clusterId);
    if (!group) {
      group = {
        type: "group",
        id: clusterId,
        label: cluster.label || "토픽 미지정",
        badge: "TOPIC",
        keywords: cluster.keywords ?? [],
        count: 0,
        children: []
      };
      category.childrenMap.set(clusterId, group);
    }
    group.count += 1;
    group.children.push(createLinkNode(link));
  });

  return finalizeCategoryMap(categories, (a, b) => b.count - a.count || a.label.localeCompare(b.label)).map((category) => ({
    ...category,
    children: category.children.map((group) => ({
      ...group,
      children: group.children.sort((a, b) => {
        const aDate = new Date(a.link.createdAt ?? 0).getTime();
        const bDate = new Date(b.link.createdAt ?? 0).getTime();
        return bDate - aDate;
      })
    }))
  }));
}

function buildTree(links) {
  switch (state.treeGrouping) {
    case TREE_GROUPINGS.DOMAIN:
      return buildTreeByDomain(links);
    case TREE_GROUPINGS.TIME:
      return buildTreeByTime(links);
    case TREE_GROUPINGS.CLUSTER:
      return buildTreeByCluster(links);
    case TREE_GROUPINGS.TAG:
    default:
      return buildTreeByTag(links);
  }
}

function renderTreeNode(node, depth = 0) {
  if (node.type === "link") {
    const card = createCard(node.link, { compact: true });
    card.style.marginLeft = `${Math.min(depth * 12, 48)}px`;
    return card;
  }

  const details = document.createElement("details");
  details.className = "tree__node";
  if (depth <= 1) {
    details.open = true;
  }

  const summary = document.createElement("summary");
  if (node.keywords?.length) {
    summary.title = node.keywords.join(", ");
  }
  const label = document.createElement("span");
  label.className = "tree__label";
  if (node.badge && node.type === "category") {
    const icon = document.createElement("span");
    icon.textContent = node.badge;
    label.append(icon);
  } else if (node.badge && node.type === "group") {
    const badge = document.createElement("span");
    badge.className = "tree__badge";
    badge.textContent = node.badge;
    label.append(badge);
  }
  const text = document.createElement("span");
  text.textContent = node.label;
  label.append(text);

  const count = document.createElement("span");
  count.className = "tree__count";
  count.textContent = `${node.count}`;

  summary.append(label, count);
  details.append(summary);

  const childrenContainer = document.createElement("div");
  childrenContainer.className = "tree__children";
  node.children.forEach((child) => {
    childrenContainer.append(renderTreeNode(child, depth + 1));
  });

  details.append(childrenContainer);
  return details;
}

function renderTree(filtered) {
  disposeGraph();
  configureContainerForView();
  const tree = buildTree(filtered);
  if (!tree.length) {
    renderEmpty("조건에 맞는 링크가 없습니다.");
    return;
  }
  const fragment = document.createDocumentFragment();
  tree.forEach((categoryNode) => {
    fragment.append(renderTreeNode(categoryNode, 0));
  });
  elements.list.replaceChildren(fragment);
}


const CATEGORY_PALETTE = [
  "#2563eb",
  "#f97316",
  "#0ea5e9",
  "#a855f7",
  "#22c55e",
  "#f43f5e",
  "#14b8a6",
  "#ef4444",
  "#8b5cf6",
  "#f59e0b"
];

function getCategoryColor(index) {
  return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
}

function buildSectorGraph(links) {
  const filterSet = new Set(state.graphFilters.categories.filter(Boolean));
  const minClusterCount = state.graphSettings?.minClusterCount ?? 1;
  const categoriesMap = new Map();

  links.forEach((link) => {
    const categoryLabel = link.category ?? "기타";
    if (filterSet.size && !filterSet.has(categoryLabel)) {
      return;
    }
    let category = categoriesMap.get(categoryLabel);
    if (!category) {
      category = {
        id: categoryLabel,
        label: `${CATEGORY_ICONS[categoryLabel] ?? CATEGORY_ICONS.기타} ${categoryLabel}`,
        rawLabel: categoryLabel,
        count: 0,
        clustersMap: new Map()
      };
      categoriesMap.set(categoryLabel, category);
    }
    category.count += 1;

    const clusterMeta = link.cluster ?? {};
    const clusterId = clusterMeta.id ?? `cluster:${categoryLabel}:${link.tags?.[0] ?? "misc"}`;
    let cluster = category.clustersMap.get(clusterId);
    if (!cluster) {
      const keywords = new Set(clusterMeta.keywords ?? []);
      cluster = {
        id: clusterId,
        label: clusterMeta.label ?? [...keywords][0] ?? "토픽 없음",
        count: 0,
        keywords,
        links: []
      };
      category.clustersMap.set(clusterId, cluster);
    }
    cluster.count += 1;
    cluster.links.push(link);
    if (clusterMeta.keywords) {
      clusterMeta.keywords.forEach((kw) => cluster.keywords.add(kw));
    }
    if (Array.isArray(link.tags)) {
      link.tags.forEach((tag) => cluster.keywords.add(tag));
    }
  });

  const categories = Array.from(categoriesMap.values())
    .map((category) => {
      const clusters = Array.from(category.clustersMap.values())
        .filter((cluster) => cluster.count >= minClusterCount)
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .map((cluster) => ({
          ...cluster,
          keywords: Array.from(cluster.keywords).slice(0, 5),
          links: cluster.links.sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0))
        }));
      return {
        ...category,
        clusters
      };
    })
    .filter((category) => category.clusters.length > 0);

  const totalLinks = categories.reduce((sum, category) => sum + category.count, 0);
  const stats = {
    categories: categories.length,
    clusters: categories.reduce((sum, category) => sum + category.clusters.length, 0),
    links: totalLinks,
    filteredLinks: categories.reduce((sum, category) => sum + category.clusters.reduce((acc, cluster) => acc + cluster.links.length, 0), 0)
  };

  return { categories, stats, totalLinks };
}

function renderGraph(filtered) {
  disposeGraph();
  configureContainerForView();

  const { categories, stats, totalLinks } = buildSectorGraph(filtered);

  if (!categories.length) {
    renderEmpty("그래프에 표시할 링크가 없습니다.");
    return;
  }

  const width = 520;
  const height = 400;
  const centerX = width / 2;
  const centerY = height / 2 + 10;
  const spread = state.graphSettings.forceScale || 1;
  const categoryRadius = 140 * spread;
  const clusterBaseRadius = categoryRadius + 60 * spread;
  const clusterGap = 42 * spread;
  const linkRadiusOffset = 38 * spread;

  const totalCount = totalLinks || categories.length;
  let angleCursor = -Math.PI / 2;

  categories.forEach((category, index) => {
    const angleSpan = totalCount > 0 ? (Math.PI * 2 * category.count) / totalCount : (Math.PI * 2) / categories.length;
    const midAngle = angleCursor + angleSpan / 2;
    category.color = getCategoryColor(index);
    category.angleStart = angleCursor;
    category.angleEnd = angleCursor + angleSpan;
    category.position = {
      x: centerX + Math.cos(midAngle) * categoryRadius,
      y: centerY + Math.sin(midAngle) * categoryRadius
    };

    const clusters = category.clusters;
    const clusterCount = clusters.length || 1;
    clusters.forEach((cluster, clusterIndex) => {
      const clusterAngle = angleCursor + angleSpan * ((clusterIndex + 1) / (clusterCount + 1));
    const clusterRadius = clusterBaseRadius + clusterIndex * clusterGap - 18;
      cluster.position = {
        x: centerX + Math.cos(clusterAngle) * clusterRadius,
        y: centerY + Math.sin(clusterAngle) * clusterRadius
      };
      cluster.color = category.color;

      const linkCount = cluster.links.length || 1;
      const linkAngularRange = angleSpan / (clusterCount + 2);
      const linkStartAngle = clusterAngle - linkAngularRange / 2;
      cluster.links.forEach((link, linkIndex) => {
        const linkAngle = linkStartAngle + linkAngularRange * ((linkIndex + 1) / (linkCount + 1));
        const linkRadius = clusterRadius + linkRadiusOffset - 20;
        link.graphPosition = {
          x: centerX + Math.cos(linkAngle) * linkRadius,
          y: centerY + Math.sin(linkAngle) * linkRadius
        };
        link.graphColor = "#22c55e";
      });
    });

    angleCursor += angleSpan;
  });

  const layout = document.createElement("div");
  layout.className = "graph-layout";

  const summary = document.createElement("div");
  summary.className = "graph-summary";
  summary.innerHTML = `
    <div><strong>카테고리</strong><span>${stats.categories}</span></div>
    <div><strong>토픽</strong><span>${stats.clusters}</span></div>
    <div><strong>링크</strong><span>${stats.filteredLinks}</span></div>
  `;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "graph-canvas");

  const connectionGroup = document.createElementNS(svgNS, "g");
  connectionGroup.setAttribute("class", "graph-connections");
  svg.append(connectionGroup);

  const nodeGroup = document.createElementNS(svgNS, "g");
  nodeGroup.setAttribute("class", "graph-nodes");
  svg.append(nodeGroup);

  const infoPanel = document.createElement("div");
  infoPanel.className = "graph-info";
  infoPanel.innerHTML = "<p>노드를 클릭하면 자세한 정보를 볼 수 있어요.</p>";

  const legend = document.createElement("aside");
  legend.className = "graph-legend";

  const resetLegendButton = document.createElement("button");
  resetLegendButton.type = "button";
  resetLegendButton.className = "graph-legend__reset";
  resetLegendButton.textContent = "전체 보기";
  resetLegendButton.addEventListener("click", () => {
    state.graphFilters.categories = [];
    renderGraph(applyFilters());
  });
  legend.append(resetLegendButton);

  const lineElements = [];

  categories.forEach((category) => {
    const categoryButton = document.createElement("button");
    categoryButton.type = "button";
    categoryButton.className = "graph-legend__item";
    if (state.graphFilters.categories.includes(category.rawLabel)) {
      categoryButton.classList.add("selected");
    }
    categoryButton.innerHTML = `
      <span class="swatch" style="background:${category.color}"></span>
      <strong>${category.label}</strong>
      <span>${category.count}</span>
    `;
    categoryButton.addEventListener("click", () => {
      if (state.graphFilters.categories.includes(category.rawLabel)) {
        state.graphFilters.categories = [];
      } else {
        state.graphFilters.categories = [category.rawLabel];
      }
      renderGraph(applyFilters());
    });
    legend.append(categoryButton);
  });

  const highlightLines = (predicate) => {
    lineElements.forEach(({ element, category, cluster, link }) => {
      if (predicate({ category, cluster, link })) {
        element.classList.remove("muted");
      } else {
        element.classList.add("muted");
      }
    });
  };

  const resetHighlight = () => {
    lineElements.forEach(({ element }) => element.classList.remove("muted"));
  };

  const showInfo = (payload) => {
    infoPanel.replaceChildren();
    if (payload.type === "link" && payload.link) {
      infoPanel.append(createCard(payload.link, { compact: true }));
      return;
    }
    const heading = document.createElement("h3");
    heading.textContent = payload.title;
    infoPanel.append(heading);
    if (payload.subtitle) {
      const subtitle = document.createElement("p");
      subtitle.className = "graph-info__meta";
      subtitle.textContent = payload.subtitle;
      infoPanel.append(subtitle);
    }
    if (payload.list && payload.list.length) {
      const list = document.createElement("ul");
      list.className = "graph-info__list";
      payload.list.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        list.append(li);
      });
      infoPanel.append(list);
    }
  };

  categories.forEach((category) => {
    category.clusters.forEach((cluster) => {
      const categoryLine = document.createElementNS(svgNS, "line");
      categoryLine.setAttribute("x1", String(category.position.x));
      categoryLine.setAttribute("y1", String(category.position.y));
      categoryLine.setAttribute("x2", String(cluster.position.x));
      categoryLine.setAttribute("y2", String(cluster.position.y));
      categoryLine.setAttribute("class", "graph-link graph-link--category");
      categoryLine.setAttribute("stroke", `${category.color}55`);
      connectionGroup.append(categoryLine);
      lineElements.push({ element: categoryLine, category, cluster });

      cluster.links.forEach((link) => {
        const linkLine = document.createElementNS(svgNS, "line");
        linkLine.setAttribute("x1", String(cluster.position.x));
        linkLine.setAttribute("y1", String(cluster.position.y));
        linkLine.setAttribute("x2", String(link.graphPosition.x));
        linkLine.setAttribute("y2", String(link.graphPosition.y));
        linkLine.setAttribute("class", "graph-link graph-link--link");
        linkLine.setAttribute("stroke", `${category.color}40`);
        connectionGroup.append(linkLine);
        lineElements.push({ element: linkLine, category, cluster, link });
      });
    });
  });

  const addNode = (config) => {
    const group = document.createElementNS(svgNS, "g");
    group.setAttribute("class", `graph-node graph-node--${config.type}`);
    group.setAttribute("transform", `translate(${config.position.x},${config.position.y})`);

    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("r", String(config.radius));
    circle.setAttribute("fill", config.fill);
    group.append(circle);

    if (config.label) {
      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("class", "graph-node__label");
      label.textContent = config.label;
      label.setAttribute("y", String(config.labelOffset ?? config.radius + 12));
      group.append(label);
    }

    group.addEventListener("mouseenter", () => {
      highlightLines(({ category }) => category.id === config.categoryId);
    });

    group.addEventListener("mouseleave", () => {
      resetHighlight();
    });

    group.addEventListener("click", () => {
      if (config.onClick) {
        config.onClick();
      }
    });

    nodeGroup.append(group);
  };

  categories.forEach((category) => {
    addNode({
      type: "category",
      position: category.position,
      radius: 18,
      fill: category.color,
      categoryId: category.id,
      label: category.label,
      labelOffset: -22,
      onClick: () => {
        showInfo({
          type: "category",
          title: category.label,
          subtitle: `링크 ${category.count}개 · 토픽 ${category.clusters.length}개`,
          list: category.clusters.slice(0, 6).map((cluster) => `${cluster.label} · ${cluster.count}개`)
        });
      }
    });

    category.clusters.forEach((cluster) => {
      addNode({
        type: "cluster",
        position: cluster.position,
        radius: 11,
        fill: category.color,
        categoryId: category.id,
        label: cluster.label,
        onClick: () => {
          showInfo({
            type: "cluster",
            title: `${cluster.label} · ${cluster.count}개`,
            subtitle: cluster.keywords.length ? `키워드: ${cluster.keywords.join(", ")}` : "키워드 없음",
            list: cluster.links.slice(0, 6).map((link) => link.title || link.url)
          });
        }
      });

      cluster.links.forEach((link) => {
        addNode({
          type: "link",
          position: link.graphPosition,
          radius: 6,
          fill: link.graphColor,
          categoryId: category.id,
          onClick: () => {
            showInfo({ type: "link", link });
          }
        });
      });
    });
  });

  const panel = document.createElement("div");
  panel.className = "graph-panel";
  panel.append(svg, infoPanel);

  layout.append(summary, panel, legend);
  elements.list.replaceChildren(layout);
}


function render() {
  updateViewControls();
  const filtered = applyFilters();
  if (state.isLoading) {
    renderEmpty("데이터를 불러오는 중...");
    return;
  }
  if (filtered.length === 0) {
    renderEmpty("조건에 맞는 링크가 없습니다.");
    return;
  }

  if (state.viewMode === VIEW_MODES.TREE) {
    renderTree(filtered);
  } else if (state.viewMode === VIEW_MODES.GRAPH) {
    renderGraph(filtered);
  } else {
    renderList(filtered);
  }
}

async function refreshLinks(showStatus = false) {
  state.isLoading = true;
  render();
  try {
    const links = await sendMessage(MESSAGE_TYPES.LIST_LINKS);
    state.isLoading = false;
    updateLinks(links);
    if (showStatus) {
      setStatus("목록을 새로고침했습니다.", "success");
    }
  } catch (error) {
    state.isLoading = false;
    renderEmpty("목록을 불러오지 못했습니다.");
    setStatus("목록을 가져오지 못했습니다.", "error");
  }
}

async function handleSaveCurrent() {
  setStatus("현재 탭을 저장하는 중...", "info");
  try {
    const result = await sendMessage(MESSAGE_TYPES.SAVE_ACTIVE, {
      makePrivate: state.isPrivateView
    });
    if (result?.links) {
      state.isLoading = false;
      updateLinks(result.links);
    }
    setStatus(state.isPrivateView ? "프라이빗 공간에 저장했습니다." : "현재 탭을 저장했습니다.", "success");
  } catch (error) {
    setStatus(error.message ?? "저장에 실패했습니다.", "error");
  }
}

function registerEvents() {
  elements.saveCurrent.addEventListener("click", handleSaveCurrent);

  elements.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  elements.tagFilter.addEventListener("change", (event) => {
    state.tagFilter = event.target.value;
    render();
  });

  elements.toggleArchived.addEventListener("change", (event) => {
    state.showArchived = event.target.checked;
    render();
  });

  elements.listViewBtn.addEventListener("click", () => {
    if (state.viewMode === VIEW_MODES.LIST) {
      return;
    }
    state.viewMode = VIEW_MODES.LIST;
    updateViewControls();
    render();
  });

  elements.treeViewBtn.addEventListener("click", () => {
    if (state.viewMode === VIEW_MODES.TREE) {
      return;
    }
    state.viewMode = VIEW_MODES.TREE;
    updateViewControls();
    render();
  });

  if (elements.graphViewBtn) {
    elements.graphViewBtn.addEventListener("click", () => {
      if (state.viewMode === VIEW_MODES.GRAPH) {
        return;
      }
      state.viewMode = VIEW_MODES.GRAPH;
      updateViewControls();
      render();
    });
  }

  if (elements.privateHotspot) {
    const togglePrivateView = async () => {
      if (state.isPrivateView) {
        exitPrivateView();
        return;
      }
      const unlocked = await ensurePrivateUnlocked();
      if (!unlocked) {
        return;
      }
      enterPrivateView();
    };

    elements.privateHotspot.addEventListener("click", togglePrivateView);
    elements.privateHotspot.addEventListener("dblclick", togglePrivateView);
    elements.privateHotspot.addEventListener("touchstart", async (event) => {
      event.preventDefault();
      await togglePrivateView();
    });
    elements.privateHotspot.addEventListener("keydown", async (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        await togglePrivateView();
      }
    });
  }

  if (elements.changePinBtn) {
    elements.changePinBtn.addEventListener("click", async () => {
      const hasPin = await fetchPinStatus();
      if (!hasPin) {
        const unlocked = await ensurePrivateUnlocked();
        if (!unlocked) {
          return;
        }
        return;
      }
      const current = prompt("현재 PIN을 입력하세요.");
      if (current == null) {
        return;
      }
      if (!/^\d{4}$/.test(current.trim())) {
        alert("PIN은 숫자 4자리여야 합니다.");
        return;
      }
      const match = await verifyPrivatePin(current.trim());
      if (!match) {
        alert("현재 PIN이 일치하지 않습니다.");
        return;
      }
      const next = prompt("새 PIN 4자리를 입력하세요.");
      if (next == null) {
        return;
      }
      const trimmed = next.trim();
      if (!/^\d{4}$/.test(trimmed)) {
        alert("PIN은 숫자 4자리여야 합니다.");
        return;
      }
      const confirmPin = prompt("새 PIN을 한 번 더 입력하세요.");
      if (confirmPin == null) {
        return;
      }
      if (trimmed !== confirmPin.trim()) {
        alert("PIN이 일치하지 않습니다.");
        return;
      }
      await setPrivatePin(trimmed);
      setStatus("PIN을 변경했습니다.", "success");
    });
  }

  if (elements.graphMinCluster) {
    elements.graphMinCluster.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      state.graphSettings.minClusterCount = Number.isNaN(value) ? 1 : value;
      if (elements.graphMinClusterValue) {
        elements.graphMinClusterValue.textContent = String(state.graphSettings.minClusterCount);
      }
      if (state.viewMode === VIEW_MODES.GRAPH) {
        renderGraph(applyFilters());
      }
    });
  }

  if (elements.graphForceScale) {
    elements.graphForceScale.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      state.graphSettings.forceScale = Number.isNaN(value) ? 1 : value;
      if (elements.graphForceScaleValue) {
        elements.graphForceScaleValue.textContent = `${state.graphSettings.forceScale.toFixed(1)}x`;
      }
      if (state.viewMode === VIEW_MODES.GRAPH) {
        renderGraph(applyFilters());
      }
    });
  }

  elements.treeGrouping.addEventListener("change", (event) => {
    const value = event.target.value;
    if (Object.values(TREE_GROUPINGS).includes(value)) {
      state.treeGrouping = value;
      render();
    }
  });

  if (elements.exportLinksBtn) {
    elements.exportLinksBtn.addEventListener("click", exportLinksToFile);
  }

  if (elements.importDropzone) {
    const dropzone = elements.importDropzone;
    const fileInput = elements.importFileInput;

    const clearDrag = () => dropzone.classList.remove("drag-over");

    dropzone.addEventListener("click", () => {
      fileInput?.click();
    });

    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("drag-over");
    });

    dropzone.addEventListener("dragleave", clearDrag);
    dropzone.addEventListener("dragend", clearDrag);

    dropzone.addEventListener("drop", async (event) => {
      event.preventDefault();
      clearDrag();
      if (event.dataTransfer?.files?.length) {
        await importLinksFromFiles(event.dataTransfer.files);
      }
    });
  }

  if (elements.importFileInput) {
    elements.importFileInput.addEventListener("change", async (event) => {
      const files = event.target.files;
      if (files?.length) {
        await importLinksFromFiles(files);
        event.target.value = "";
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    if (changes[STORAGE_KEYS.LINKS]) {
      const nextLinks = changes[STORAGE_KEYS.LINKS].newValue ?? [];
      updateLinks(nextLinks);
    }
  });
}

async function bootstrap() {
  updateViewControls();
  registerEvents();
  await refreshLinks();
}

bootstrap();
