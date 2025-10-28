import { CATEGORY_DEFAULTS, CLASSIFIER_VERSION } from "../common/constants.js";
import { DEFAULT_RULES } from "./rules.js";
import { getDomain } from "./utils.js";

/**
 * @typedef {Object} LinkCandidate
 * @property {string} url
 * @property {string} title
 * @property {string} description
 * @property {string} selectionText
 * @property {Array<string>} keywords
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {string} category
 * @property {Array<string>} tags
 * @property {number} confidence
 * @property {string|null} ruleId
 * @property {number} version
 * @property {Array<string>} evidence
 */

function scoreRule(rule, context) {
  let score = 0;
  const evidence = [];
  const { url, title, description, selectionText } = context;
  const lowerTitle = title.toLowerCase();
  const lowerDescription = description.toLowerCase();
  const lowerSelection = selectionText.toLowerCase();
  const host = getDomain(url);
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch (error) {
      return "";
    }
  })();
  const bodyText = [lowerTitle, lowerDescription, lowerSelection].join(" ");

  if (rule.hostIncludes?.length) {
    const matched = rule.hostIncludes.some((fragment) => host.includes(fragment.toLowerCase()));
    if (matched) {
      score += 3;
      evidence.push(`domain:${rule.hostIncludes.join(",")}`);
    }
  }

  if (rule.pathIncludes?.length) {
    const matched = rule.pathIncludes.some((fragment) => path.includes(fragment));
    if (matched) {
      score += 2;
      evidence.push(`path:${rule.pathIncludes.join(",")}`);
    }
  }

  if (rule.keywords?.length) {
    const matched = rule.keywords.some((keyword) => bodyText.includes(keyword.toLowerCase()));
    if (matched) {
      score += 2;
      evidence.push(`keyword:${rule.keywords.join(",")}`);
    }
  }

  if (rule.regex && rule.regex.length > 0) {
    try {
      const matcher = new RegExp(rule.regex, "i");
      if (matcher.test(url)) {
        score += 4;
        evidence.push(`regex:${rule.regex}`);
      }
    } catch (error) {
      console.warn("Invalid custom regex", rule.regex, error);
    }
  }

  return { score, evidence };
}

function applyFallbacks(candidate) {
  const url = candidate.url.toLowerCase();
  const text = [candidate.title, candidate.description, candidate.selectionText].join(" ").toLowerCase();

  if (url.includes("blog") || text.includes("blog")) {
    return { category: "문서", tags: ["blog"], confidence: 0.3, evidence: ["fallback:blog"] };
  }

  if (url.includes("youtube") || url.includes("vimeo") || url.includes("video")) {
    return { category: "영상", tags: ["video"], confidence: 0.35, evidence: ["fallback:video"] };
  }

  if (url.includes("news") || text.includes("breaking news")) {
    return { category: "뉴스", tags: ["news"], confidence: 0.3, evidence: ["fallback:news"] };
  }

  return { category: "기타", tags: [], confidence: 0.1, evidence: ["fallback:default"] };
}

/**
 * @param {LinkCandidate} candidate
 * @param {Array<Object>} customRules
 * @returns {ClassificationResult}
 */
export function classifyLink(candidate, customRules = []) {
  const rules = [...customRules, ...DEFAULT_RULES];
  let best = null;
  let bestEvidence = [];

  for (const rule of rules) {
    const { score, evidence } = scoreRule(rule, candidate);
    if (score <= 0) {
      continue;
    }
    if (!best || score > best.score) {
      best = {
        score,
        category: rule.category,
        tags: rule.tags ?? [],
        ruleId: rule.id ?? null
      };
      bestEvidence = evidence;
    }
  }

  if (best) {
    const confidence = Math.min(1, 0.2 + best.score * 0.15);
    return {
      category: best.category,
      tags: best.tags,
      ruleId: best.ruleId,
      confidence,
      evidence: bestEvidence,
      version: CLASSIFIER_VERSION
    };
  }

  const fallback = applyFallbacks(candidate);
  return {
    category: CATEGORY_DEFAULTS.includes(fallback.category) ? fallback.category : "기타",
    tags: fallback.tags,
    ruleId: null,
    confidence: fallback.confidence,
    evidence: fallback.evidence,
    version: CLASSIFIER_VERSION
  };
}
