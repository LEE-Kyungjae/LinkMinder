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

let activeGraphSimulation = null;

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

function disposeGraph() {
  if (activeGraphSimulation && typeof activeGraphSimulation.stop === "function") {
    activeGraphSimulation.stop();
  }
  activeGraphSimulation = null;
}

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

function buildGraphData(links) {
  const nodes = [];
  const edges = [];
  const nodeById = new Map();
  const stats = {
    categories: 0,
    clusters: 0,
    links: links.length,
    filteredLinks: 0
  };

  function ensureNode(id, data) {
    if (nodeById.has(id)) {
      return nodeById.get(id);
    }
    const node = {
      id,
      type: data.type,
      label: data.label,
      meta: data.meta ?? {},
      link: data.link ?? null,
      radius: data.radius ?? 12,
      color: data.color,
      group: data.group ?? data.type,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0
    };
    nodes.push(node);
    nodeById.set(id, node);
    return node;
  }

  const categoryCounts = new Map();
  const clusterCounts = new Map();
  const minClusterCount = state.graphSettings?.minClusterCount ?? 1;

  links.forEach((link) => {
    const categoryLabel = link.category ?? "기타";
    const categoryId = `category:${categoryLabel}`;
    const categoryNode = ensureNode(categoryId, {
      type: "category",
      label: `${CATEGORY_ICONS[categoryLabel] ?? CATEGORY_ICONS.기타} ${categoryLabel}`,
      radius: 26,
      color: "#2563eb",
      meta: { category: categoryLabel }
    });
    categoryCounts.set(categoryId, (categoryCounts.get(categoryId) ?? 0) + 1);

    const clusterId = link.cluster?.id ?? `cluster:${categoryLabel}:misc`;
    const clusterLabel = link.cluster?.label ?? "토픽 미지정";
    const clusterNode = ensureNode(clusterId, {
      type: "cluster",
      label: clusterLabel,
      radius: 18,
      color: "#f59e0b",
      meta: {
        category: categoryLabel,
        keywords: link.cluster?.keywords ?? []
      }
    });
    clusterCounts.set(clusterId, (clusterCounts.get(clusterId) ?? 0) + 1);

    const linkId = `link:${link.id}`;
    const linkNode = ensureNode(linkId, {
      type: "link",
      label: link.title || link.meta?.title || getDomain(link.url) || link.url,
      radius: 10,
      color: "#10b981",
      link,
      meta: {
        url: link.url,
        category: categoryLabel,
        cluster: clusterLabel
      }
    });

    edges.push({
      source: categoryNode,
      target: clusterNode,
      strength: 0.08,
      length: 140,
      type: "category-cluster"
    });
    edges.push({
      source: clusterNode,
      target: linkNode,
      strength: 0.06,
      length: 90,
      type: "cluster-link"
    });
  });

  categoryCounts.forEach((count, id) => {
    const node = nodeById.get(id);
    if (node) {
      node.radius = Math.min(32, 22 + Math.log2(count + 1) * 6);
      node.meta.count = count;
    }
  });

  const clustersToRemove = new Set();

  clusterCounts.forEach((count, id) => {
    const node = nodeById.get(id);
    if (node) {
      node.radius = Math.min(24, 16 + Math.log2(count + 1) * 4);
      node.meta.count = count;
      if (count < minClusterCount) {
        clustersToRemove.add(id);
      }
    }
  });

  nodes.forEach((node) => {
    if (node.type === "link") {
      const clusterId = node.link?.cluster?.id ?? `cluster:${node.meta?.category ?? "기타"}:misc`;
      if (clustersToRemove.has(clusterId)) {
        node.meta.filteredOut = true;
      }
    }
  });

  const filteredNodes = nodes.filter((node) => {
    if (node.type === "cluster") {
      return !clustersToRemove.has(node.id);
    }
    if (node.type === "link") {
      return node.meta.filteredOut !== true;
    }
    return true;
  });

  const filteredEdges = edges.filter((edge) => {
    if (edge.type === "category-cluster") {
      return !clustersToRemove.has(edge.target.id);
    }
    if (edge.type === "cluster-link") {
      return !clustersToRemove.has(edge.source.id) && edge.target.meta.filteredOut !== true;
    }
    return true;
  });

  const usedNodeIds = new Set();
  filteredEdges.forEach((edge) => {
    usedNodeIds.add(edge.source.id ?? edge.source);
    usedNodeIds.add(edge.target.id ?? edge.target);
  });

  const finalNodes = filteredNodes.filter((node) => {
    if (node.type === "category") {
      return usedNodeIds.has(node.id);
    }
    return true;
  });

  finalNodes.forEach((node) => {
    if (node.type === "category") stats.categories += 1;
    if (node.type === "cluster") stats.clusters += 1;
    if (node.type === "link") stats.filteredLinks += 1;
  });

  return { nodes: finalNodes, edges: filteredEdges, stats };
}

function renderGraph(filtered) {
  disposeGraph();
  configureContainerForView();

  const width = 340;
  const height = 340;
  const { nodes, edges, stats } = buildGraphData(filtered);

  if (!nodes.length) {
    renderEmpty("그래프에 표시할 링크가 없습니다.");
    return;
  }

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "graph-canvas");

  const summary = document.createElement("div");
  summary.className = "graph-summary";
  summary.innerHTML = `
    <div><strong>카테고리</strong><span>${stats.categories}</span></div>
    <div><strong>토픽</strong><span>${stats.clusters}</span></div>
    <div><strong>링크</strong><span>${stats.filteredLinks}</span></div>
  `;

  const defs = document.createElementNS(svgNS, "defs");
  const glow = document.createElementNS(svgNS, "filter");
  glow.setAttribute("id", "nodeGlow");
  glow.innerHTML = `
    <feGaussianBlur stdDeviation="4" result="coloredBlur"></feGaussianBlur>
    <feMerge>
      <feMergeNode in="coloredBlur"></feMergeNode>
      <feMergeNode in="SourceGraphic"></feMergeNode>
    </feMerge>
  `;
  defs.append(glow);
  svg.append(defs);

  const linksGroup = document.createElementNS(svgNS, "g");
  linksGroup.setAttribute("stroke", "rgba(15,23,42,0.2)");
  linksGroup.setAttribute("stroke-width", "1.2");
  svg.append(linksGroup);

  const nodesGroup = document.createElementNS(svgNS, "g");
  svg.append(nodesGroup);

  const infoPanel = document.createElement("div");
  infoPanel.className = "graph-info";
  infoPanel.innerHTML = "<p>노드를 클릭하면 자세한 정보를 볼 수 있어요.</p>";

  const lineElements = edges.map(() => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("stroke-linecap", "round");
    linksGroup.append(line);
    return line;
  });

  const nodeElements = nodes.map((node) => {
    const group = document.createElementNS(svgNS, "g");
    group.setAttribute("class", `graph-node graph-node--${node.type}`);

    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("r", String(node.radius));
    circle.setAttribute("fill", node.color);
    circle.setAttribute("fill-opacity", node.type === "link" ? "0.85" : "0.95");
    circle.setAttribute("filter", "url(#nodeGlow)");
    group.append(circle);

    if (node.type !== "link") {
      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("class", "graph-node__label");
      label.textContent = node.label;
      group.append(label);
    } else {
      circle.setAttribute("stroke", "rgba(255,255,255,0.8)");
      circle.setAttribute("stroke-width", "1.2");
    }

    nodesGroup.append(group);
    return { group, circle };
  });

  function updatePositions() {
    nodes.forEach((node, index) => {
      const { group, circle } = nodeElements[index];
      const x = node.x;
      const y = node.y;
      group.setAttribute("transform", `translate(${x},${y})`);
      circle.setAttribute("cx", "0");
      circle.setAttribute("cy", "0");

      if (group.childNodes.length > 1) {
        const label = group.childNodes[1];
        const offsetY = node.type === "category" ? -node.radius - 6 : node.radius + 12;
        label.setAttribute("x", "0");
        label.setAttribute("y", String(offsetY));
      }
    });

    edges.forEach((edge, index) => {
      const line = lineElements[index];
      line.setAttribute("x1", String(edge.source.x));
      line.setAttribute("y1", String(edge.source.y));
      line.setAttribute("x2", String(edge.target.x));
      line.setAttribute("y2", String(edge.target.y));
      line.setAttribute("stroke", edge.type === "category-cluster" ? "rgba(79,70,229,0.35)" : "rgba(16,185,129,0.4)");
    });
  }

  updatePositions();

  const simulation = startForceSimulation(nodes, edges, {
    width,
    height,
    onTick: updatePositions,
    forceScale: state.graphSettings.forceScale
  });
  activeGraphSimulation = simulation;

  function showInfo(node) {
    infoPanel.classList.remove("hidden");
    infoPanel.replaceChildren();
    if (node.type === "link" && node.link) {
      const card = createCard(node.link, { compact: true });
      infoPanel.append(card);
    } else {
      const heading = document.createElement("h3");
      heading.textContent = node.label;
      const meta = document.createElement("p");
      meta.className = "graph-info__meta";
      if (node.type === "cluster") {
        const keywords = node.meta?.keywords ?? [];
        const count = node.meta?.count ?? 0;
        const summary = keywords.length ? `키워드: ${keywords.join(", ")}` : "연관 키워드 없음";
        meta.textContent = `${summary} · 링크 ${count}개`;
      } else if (node.type === "category") {
        const count = node.meta?.count ?? 0;
        meta.textContent = `${node.meta?.category ?? "카테고리"} 카테고리 · 링크 ${count}개`;
      } else {
        meta.textContent = "노드를 클릭하세요.";
      }
      infoPanel.append(heading, meta);
    }
  }

  function svgPointFromEvent(event) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      return { x: 0, y: 0 };
    }
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  nodeElements.forEach(({ group }, index) => {
    const node = nodes[index];
    group.style.cursor = "pointer";
    group.addEventListener("pointerenter", () => {
      group.classList.add("graph-node--hover");
      setStatus(`${node.label}`, "info");
    });
    group.addEventListener("pointerleave", () => {
      group.classList.remove("graph-node--hover");
      setStatus("", "info");
    });
    group.addEventListener("click", (event) => {
      event.stopPropagation();
      if (node.type === "link" && node.link) {
        showInfo(node);
      } else if (node.type === "cluster") {
        showInfo(node);
      } else if (node.type === "category") {
        showInfo(node);
      }
    });

    group.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const pointerId = event.pointerId;
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        const coords = svgPointFromEvent(moveEvent);
        node.x = coords.x;
        node.y = coords.y;
        node.vx = 0;
        node.vy = 0;
        updatePositions();
      };
      const up = (upEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        svg.removeEventListener("pointermove", move);
        svg.removeEventListener("pointerup", up);
      };
      svg.addEventListener("pointermove", move);
      svg.addEventListener("pointerup", up, { once: true });
    });
  });

  elements.list.replaceChildren(summary, svg, infoPanel);
}

function startForceSimulation(nodes, edges, options) {
  const width = options.width ?? 340;
  const height = options.height ?? 320;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxIterations = 500;
  const forceScale = options.forceScale ?? 1;
  const repulsionStrength = 1800 * forceScale;
  const springStrength = 0.04 * forceScale;
  const damping = 0.9;

  nodes.forEach((node) => {
    node.x = centerX + (Math.random() - 0.5) * width * 0.4;
    node.y = centerY + (Math.random() - 0.5) * height * 0.4;
    node.vx = 0;
    node.vy = 0;
  });

  let frame;
  let iteration = 0;

  const tick = () => {
    iteration += 1;

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        let dx = nodeB.x - nodeA.x;
        let dy = nodeB.y - nodeA.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 0.01) {
          distSq = 0.01;
          dx = (Math.random() - 0.5) * 0.1;
          dy = (Math.random() - 0.5) * 0.1;
        }
        const dist = Math.sqrt(distSq);
        const force = repulsionStrength / distSq;
        const fx = (force * dx) / dist;
        const fy = (force * dy) / dist;
        nodeA.vx -= fx;
        nodeA.vy -= fy;
        nodeB.vx += fx;
        nodeB.vy += fy;
      }
    }

    edges.forEach((edge) => {
      const source = edge.source;
      const target = edge.target;
      let dx = target.x - source.x;
      let dy = target.y - source.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const desired = edge.length ?? 120;
      const force = (dist - desired) * (edge.strength ?? springStrength);
      const fx = (force * dx) / dist;
      const fy = (force * dy) / dist;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    });

    nodes.forEach((node) => {
      const centeringStrength = 0.05;
      node.vx += (centerX - node.x) * centeringStrength;
      node.vy += (centerY - node.y) * centeringStrength;

      node.vx *= damping;
      node.vy *= damping;

      node.x += node.vx * 0.02;
      node.y += node.vy * 0.02;

      node.x = Math.max(node.radius, Math.min(width - node.radius, node.x));
      node.y = Math.max(node.radius, Math.min(height - node.radius, node.y));
    });

    if (typeof options.onTick === "function") {
      options.onTick();
    }

    if (iteration < maxIterations) {
      frame = requestAnimationFrame(tick);
    }
  };

  frame = requestAnimationFrame(tick);

  return {
    stop() {
      if (frame) {
        cancelAnimationFrame(frame);
      }
    }
  };
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
