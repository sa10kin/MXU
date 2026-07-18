export interface AtlasAliases {
  servants: Record<string, string[]>;
  craftEssences: Record<string, string[]>;
}

const STORAGE_KEY = 'papermoon-atlas-aliases-v1';
const EMPTY_ALIASES: AtlasAliases = { servants: {}, craftEssences: {} };

export function loadAtlasAliases(): AtlasAliases {
  if (typeof window === 'undefined') return EMPTY_ALIASES;
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as AtlasAliases;
    return value?.servants && value?.craftEssences ? value : EMPTY_ALIASES;
  } catch {
    return EMPTY_ALIASES;
  }
}

export function saveAtlasAliases(aliases: AtlasAliases) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
}
