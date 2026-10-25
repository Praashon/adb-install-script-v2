const { resolve, relative, isAbsolute } = require("path");
const { mkdirSync, writeFileSync, readFileSync, lstatSync, existsSync } = require("fs");

function safeEntryPath(root, name) {
  if (typeof name !== "string" || !name || /[\\:\x00-\x1f]/.test(name) || name.startsWith("/")) throw new Error("Unsafe archive path");
  const parts = name.replace(/\/$/, "").split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("Unsafe archive path");
  const target = resolve(root, ...parts);
  const rel = relative(resolve(root), target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Archive path escapes extraction root");
  return target;
}
function validateEntries(entries, root, limits = {}) {
  const maxEntries = limits.maxEntries ?? 10000;
  const maxBytes = limits.maxBytes ?? 2 * 1024 ** 3;
  const maxEntryBytes = limits.maxEntryBytes ?? 512 * 1024 ** 2;
  if (entries.length > maxEntries) throw new Error("Archive has too many entries");
  const seen = new Set();
  let total = 0;
  for (const entry of entries) {
    const target = safeEntryPath(root, entry.entryName);
    const key = target.toLowerCase();
    if (seen.has(key)) throw new Error("Duplicate archive path");
    seen.add(key);
    const mode = (entry.attr >>> 16) & 0xf000;
    if (mode && mode !== 0x8000 && mode !== 0x4000) throw new Error("Archive links and special files are forbidden");
    const size = entry.header.size;
    total += size;
    if (!Number.isSafeInteger(size) || size < 0 || size > maxEntryBytes || total > maxBytes) throw new Error("Archive exceeds extraction limits");
  }
  return entries;
}
function writeEntry(root, name, data) {
  const target = safeEntryPath(root, name);
  // All parents must be real directories, including when reusing an extraction directory.
  const parts = relative(resolve(root), target).split(/[\\/]/);
  let parent = resolve(root);
  for (const part of ["", ...parts.slice(0, -1)]) {
    if (part) parent = resolve(parent, part);
    if (existsSync(parent)) {
      const stat = lstatSync(parent);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Unsafe extraction directory");
    } else mkdirSync(parent);
  }
  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile() || !readFileSync(target).equals(data)) throw new Error("Extraction target already exists with different content");
  } else writeFileSync(target, data, { flag: "wx" });
  return target;
}
module.exports = { safeEntryPath, validateEntries, writeEntry };
