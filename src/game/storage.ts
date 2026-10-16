export interface ScoreEntry {
  score: number;
  coins: number;
  distance: number;
  date: number;
  id: string;
  /** true when the run reached the finish line */
  won?: boolean;
}

const KEY = 'bloxrush.highscores.v1';
const MUTE_KEY = 'bloxrush.muted.v1';
export const MAX_SCORES = 7;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.score === 'number')
      .slice(0, MAX_SCORES)
      .map((e) => ({
        score: Math.round(e.score) || 0,
        coins: Math.round(e.coins) || 0,
        distance: Math.round(e.distance) || 0,
        date: e.date || Date.now(),
        id: e.id || `${e.date}-${e.score}`,
        won: !!e.won,
      }));
  } catch {
    return [];
  }
}

export function saveScore(entry: Omit<ScoreEntry, 'id' | 'date'>): {
  list: ScoreEntry[];
  id: string;
  rank: number;
} {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const next: ScoreEntry = { ...entry, date: Date.now(), id };
  const list = [...loadScores(), next].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — scores stay in memory for the session */
  }
  const rank = list.findIndex((e) => e.id === id);
  return { list, id, rank };
}

export function clearScores(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(m: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
}
