import type AdmZip from "adm-zip";
export function safeEntryPath(root: string, name: string): string;
export function validateEntries(entries: AdmZip.IZipEntry[], root: string, limits?: {maxEntries?: number; maxBytes?: number; maxEntryBytes?: number}): AdmZip.IZipEntry[];
export function writeEntry(root: string, name: string, data: Buffer): string;
