/** Messages and state shared by the host and the players of a live game. */
export interface Player { id: string; name: string; av: string; team?: number }
export interface Settings {
  count: number;          // questions
  secs: number;           // seconds per question
  points: 'std' | 'double' | 'none';
  streak: boolean;        // answer-streak bonus
  shuffle: boolean;       // shuffle the choices
  showQ: boolean;         // also show the question text on the players' devices
  late: boolean;          // allow joining after the game started
  teams: number;          // 0 = everyone for themselves, 2..4 = team mode
  auto: boolean;          // keep going by itself (no host clicks)
  sound: boolean;
}
export type Phase = 'lobby' | 'countdown' | 'question' | 'reveal' | 'board' | 'podium';
export interface Score { t: number; d: number; r: number; s: number; ok: number; a: number }   // total, gained now, rank, streak, correct, answered
export interface Snapshot {
  v: number; pin: string; hid: string; title: string; phase: Phase; settings: Settings; locked: boolean; paused: boolean;
  players: Player[]; idx: number; total: number;
  q?: { text: string; choices: string[]; secs: number; remaining: number };
  answered: number;
  reveal?: { correct: number; counts: number[]; choices?: string[] };
  scores: Record<string, Score>;
  teamScores?: number[];
  kicked?: string[];
}
export const DEFAULTS: Settings = { count: 10, secs: 20, points: 'std', streak: true, shuffle: true, showQ: true, late: true, teams: 0, auto: false, sound: true };
export const TEAM_NAMES = ['Red', 'Blue', 'Yellow', 'Green'];
export const TEAM_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
