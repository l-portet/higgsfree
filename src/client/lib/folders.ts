/** Favorites folders: ids, the name rules, and where the heart's default destination is remembered. */
import type { Folder } from "@shared/types";
import { shortId } from "./uid";

export const FOLDER_ID = /^fld_[A-Za-z0-9_-]{6,32}$/;
export const FOLDER_NAME_MAX = 60;
/** The folder the heart files into by default (the last one picked); `""` = All. */
export const DESTINATION_STORAGE = "higgsfree.favorites.destination";
/** How many of a folder's newest records its tile shows as a cover. */
export const FOLDER_COVER_COUNT = 4;

export const newFolderId = (): string => `fld_${shortId(10)}`;

export function isFolderId(s: unknown): s is string {
  return typeof s === "string" && FOLDER_ID.test(s);
}

/** Trimmed, inner whitespace collapsed, clipped to `FOLDER_NAME_MAX`; `""` when nothing is left. */
export function normalizeFolderName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, FOLDER_NAME_MAX).trim();
}

/** Names compare case-insensitively: "travel" is the same folder as "Travel". */
export const folderNameKey = (name: string): string => normalizeFolderName(name).toLocaleLowerCase();

/** Newest first (by creation: a rename does not move a folder); the id breaks ties. */
export function compareFolders(a: Folder, b: Folder): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}
