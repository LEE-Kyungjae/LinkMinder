const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "you",
  "are",
  "was",
  "were",
  "will",
  "have",
  "has",
  "had",
  "your",
  "into",
  "about",
  "https",
  "http",
  "www",
  "com",
  "org",
  "net",
  "co",
  "kr",
  "blog",
  "html",
  "amp",
  "rt",
  "nbsp",
  "the",
  "of",
  "in",
  "to",
  "a",
  "on",
  "at",
  "by",
  "is",
  "it",
  "be",
  "or",
  "as",
  "an",
  "we",
  "if",
  "so",
  "but",
  "can",
  "do",
  "did",
  "not",
  "no",
  "yes",
  "use",
  "using",
  "used",
  "see",
  "more",
  "less",
  "한",
  "이",
  "가",
  "은",
  "는",
  "을",
  "를",
  "에",
  "의",
  "으로",
  "에서",
  "하다",
  "있다",
  "없다",
  "이다",
  "하기",
  "하는",
  "했다",
  "보기",
  "소개",
  "정리"
]);

function tokenize(text) {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

export function extractKeywords(candidate, max = 5) {
  const tokens = [candidate.title, candidate.description, candidate.selectionText]
    .map((part) => tokenize(part))
    .flat();

  const counts = new Map();
  tokens.forEach((token) => {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([token]) => token);
}

function buildClusterId(category, keywords) {
  const base = [category || "misc", ...keywords].join("-").toLowerCase();
  return `cluster-${base}`.replace(/[^a-z0-9-]+/g, "-");
}

export function assignCluster(candidate, existingLinks) {
  const keywords = extractKeywords(candidate, 4);
  const label = keywords.slice(0, 2).join(" · ") || candidate.category || "클러스터";

  if (!keywords.length) {
    return {
      id: buildClusterId(candidate.category, ["general"]),
      label: candidate.category || "기타",
      keywords: [],
      size: 0
    };
  }

  const category = candidate.category ?? "기타";
  let bestMatch = null;
  let bestScore = 0;

  existingLinks.forEach((link) => {
    if (link.category !== category) {
      return;
    }
    const otherKeywords = link.cluster?.keywords ?? [];
    if (otherKeywords.length === 0) {
      return;
    }
    const intersection = otherKeywords.filter((token) => keywords.includes(token));
    const union = new Set([...otherKeywords, ...keywords]);
    const score = intersection.length / (union.size || 1);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = link.cluster;
    }
  });

  if (bestMatch && bestMatch.id) {
    return {
      id: bestMatch.id,
      label: bestMatch.label,
      keywords: Array.from(new Set([...(bestMatch.keywords ?? []), ...keywords])).slice(0, 4),
      size: (bestMatch.size ?? 0) + 1
    };
  }

  return {
    id: buildClusterId(category, keywords),
    label: label || category,
    keywords,
    size: 1
  };
}
