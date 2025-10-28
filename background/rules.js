/**
 * Built-in heuristic rules for lightweight automatic categorisation.
 * The options page lets the user append more rules, which are stored
 * alongside these defaults.
 */
export const DEFAULT_RULES = [
  {
    id: "dev-github",
    label: "Git hosting",
    category: "개발",
    tags: ["dev", "git"],
    hostIncludes: ["github.com", "gitlab.com", "bitbucket.org"]
  },
  {
    id: "dev-docs",
    label: "API reference",
    category: "개발",
    tags: ["docs"],
    hostIncludes: ["developer.mozilla.org", "docs.google", "api.", "dev."]
  },
  {
    id: "learning",
    label: "Learning",
    category: "학습",
    tags: ["learn"],
    keywords: ["tutorial", "guide", "how to", "learn", "study"]
  },
  {
    id: "video",
    label: "Video platforms",
    category: "영상",
    tags: ["video"],
    hostIncludes: ["youtube.com", "youtu.be", "vimeo.com", "shorts"]
  },
  {
    id: "news",
    label: "News sites",
    category: "뉴스",
    tags: ["news"],
    hostIncludes: ["news", "nytimes.com", "cnn.com", "bbc.com", "khan.co.kr", "joongang"]
  },
  {
    id: "community",
    label: "Community / forum",
    category: "커뮤니티",
    tags: ["community"],
    keywords: ["forum", "discussion", "community", "stackoverflow", "stack exchange"],
    hostIncludes: ["reddit.com", "stackoverflow.com", "stackexchange.com", "discord.com"]
  },
  {
    id: "shopping",
    label: "Shopping",
    category: "쇼핑",
    tags: ["shopping"],
    hostIncludes: ["amazon.", "smartstore.naver.com", "coupang", "gmarket"]
  }
];
