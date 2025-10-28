export const STORAGE_KEYS = {
  LINKS: "linkminder.links",
  RULES: "linkminder.rules",
  SETTINGS: "linkminder.settings",
  PRIVATE_PIN: "linkminder.privatePin"
};

export const CATEGORY_DEFAULTS = [
  "개발",
  "디자인",
  "문서",
  "학습",
  "뉴스",
  "커뮤니티",
  "영상",
  "쇼핑",
  "기타"
];

export const MESSAGE_TYPES = {
  LIST_LINKS: "link:list",
  SAVE_ACTIVE: "link:save-active",
  DELETE_LINK: "link:delete",
  TOGGLE_ARCHIVE: "link:toggle-archive",
  TOGGLE_PRIVATE: "link:toggle-private",
  UPDATE_NOTE: "link:update-note",
  REFRESH_LINKS: "link:refresh",
  LIST_RULES: "rules:list",
  UPSERT_RULE: "rules:upsert",
  DELETE_RULE: "rules:delete",
  PIN_STATUS: "pin:status",
  SET_PIN: "pin:set",
  VERIFY_PIN: "pin:verify",
  EXPORT_LINKS: "links:export",
  IMPORT_LINKS: "links:import"
};

export const EVENT_TOPICS = {
  LINKS_UPDATED: "links:updated",
  RULES_UPDATED: "rules:updated"
};

export const CLASSIFIER_VERSION = 1;

export const VIEW_MODES = {
  LIST: "list",
  TREE: "tree",
  GRAPH: "graph"
};

export const TREE_GROUPINGS = {
  TAG: "tag",
  TIME: "time",
  DOMAIN: "domain",
  CLUSTER: "cluster"
};
