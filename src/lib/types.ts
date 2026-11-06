export interface RawCard { s: string; q: string; c: string; w: string[]; p?: number }
export interface Card { id: string; s: string; q: string; c: string; w: string[]; p?: number; ord?: number }
export interface QCard extends Card { t: string; n: string; g: string }
export interface Folder { id: string; name: string; parent: string }
export interface FoldDB { folders: Folder[]; place: Record<string, string> }

/** One change to the folder tree. Applied optimistically in the browser and for real by /api/folders. */
export type Mut =
  | { t: 'addFolder'; id: string; name: string; parent: string }
  | { t: 'renameFolder'; id: string; name: string }
  | { t: 'moveFolder'; id: string; parent: string }
  | { t: 'delFolder'; id: string; up: string }
  | { t: 'setPlace'; key: string; value: string }
  | { t: 'delPlace'; key: string };

export interface LocalPack { name: string; text: string; at?: number }
