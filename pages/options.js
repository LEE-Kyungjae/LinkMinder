import { CATEGORY_DEFAULTS, MESSAGE_TYPES } from "../common/constants.js";

const state = {
  rules: []
};

const elements = {
  form: document.getElementById("rule-form"),
  label: document.getElementById("rule-label"),
  category: document.getElementById("rule-category"),
  tags: document.getElementById("rule-tags"),
  hosts: document.getElementById("rule-hosts"),
  keywords: document.getElementById("rule-keywords"),
  regex: document.getElementById("rule-regex"),
  table: document.getElementById("rules-table"),
  tableBody: document.querySelector("#rules-table tbody"),
  empty: document.getElementById("rules-empty"),
  refresh: document.getElementById("refresh-rules"),
  status: document.getElementById("options-status")
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
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response) {
    throw new Error("응답을 받지 못했습니다.");
  }
  if (!response.ok) {
    throw new Error(response.error ?? "요청이 실패했습니다.");
  }
  return response.data;
}

function renderCategoryOptions() {
  elements.category.replaceChildren();
  CATEGORY_DEFAULTS.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    elements.category.append(option);
  });
}

function parseList(value) {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderRules() {
  if (!state.rules.length) {
    elements.table.classList.add("hidden");
    elements.empty.classList.remove("hidden");
    return;
  }
  elements.table.classList.remove("hidden");
  elements.empty.classList.add("hidden");

  const fragment = document.createDocumentFragment();

  state.rules.forEach((rule) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = rule.label ?? "(이름 없음)";

    const categoryCell = document.createElement("td");
    categoryCell.textContent = rule.category ?? "";

    const hostsCell = document.createElement("td");
    hostsCell.textContent = (rule.hostIncludes ?? []).join(", ");

    const keywordsCell = document.createElement("td");
    keywordsCell.textContent = (rule.keywords ?? []).join(", ");

    const tagsCell = document.createElement("td");
    tagsCell.textContent = (rule.tags ?? []).join(", ");

    const regexCell = document.createElement("td");
    regexCell.textContent = rule.regex ?? "";

    const actionsCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", async () => {
      if (!confirm(`"${rule.label}" 규칙을 삭제할까요?`)) {
        return;
      }
      try {
        const rules = await sendMessage(MESSAGE_TYPES.DELETE_RULE, { id: rule.id });
        state.rules = rules;
        renderRules();
        setStatus("규칙을 삭제했습니다.", "success");
      } catch (error) {
        console.error("Failed to delete rule", error);
        setStatus("규칙 삭제에 실패했습니다.", "error");
      }
    });
    actionsCell.append(deleteButton);

    row.append(nameCell, categoryCell, hostsCell, keywordsCell, tagsCell, regexCell, actionsCell);
    fragment.append(row);
  });

  elements.tableBody.replaceChildren(fragment);
}

async function loadRules(showStatus = false) {
  setStatus("규칙을 불러오는 중...");
  try {
    const data = await sendMessage(MESSAGE_TYPES.LIST_RULES);
    state.rules = data?.custom ?? [];
    renderRules();
    if (showStatus) {
      setStatus("규칙 목록을 새로고침했습니다.", "success");
    } else {
      setStatus("");
    }
  } catch (error) {
    console.error("Failed to load rules", error);
    setStatus("규칙 목록을 불러오지 못했습니다.", "error");
  }
}

function resetForm() {
  elements.form.reset();
  elements.category.value = CATEGORY_DEFAULTS[0];
}

function attachEvents() {
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      label: elements.label.value.trim(),
      category: elements.category.value,
      tags: parseList(elements.tags.value),
      hostIncludes: parseList(elements.hosts.value),
      keywords: parseList(elements.keywords.value),
      regex: elements.regex.value.trim()
    };

    const hasMatchers =
      payload.hostIncludes.length > 0 || payload.keywords.length > 0 || (payload.regex && payload.regex.length > 0);

    if (!hasMatchers) {
      setStatus("도메인, 키워드, 정규식 중 하나 이상은 입력해야 합니다.", "error");
      return;
    }

    try {
      const rules = await sendMessage(MESSAGE_TYPES.UPSERT_RULE, payload);
      state.rules = rules;
      renderRules();
      resetForm();
      setStatus("규칙을 저장했습니다.", "success");
    } catch (error) {
      console.error("Failed to save rule", error);
      setStatus(error.message ?? "규칙 저장에 실패했습니다.", "error");
    }
  });

  elements.refresh.addEventListener("click", () => {
    loadRules(true);
  });
}

function init() {
  renderCategoryOptions();
  attachEvents();
  loadRules();
}

init();
