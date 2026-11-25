export type ArticleStatus = 'draft' | 'review' | 'published';
export type ArticleMeta = {
  slug: string; title: string; summary: string; cover: string | null; tags: string[]; author: string; language: string;
  version: number; published_at: string; reading_minutes: number; status: ArticleStatus; outline: string[];
};
export type PrevVersion = { version: number; saved: number; bytes: number; html: string };
export type LocalArticle = { id: string; title: string; added: number; bytes: number; html: string; version?: number; updated?: number; prev?: PrevVersion[] };
export type LocalMeta = { id: string; title: string; added: number; bytes: number; version: number; updated?: number; hasPrev: boolean };
