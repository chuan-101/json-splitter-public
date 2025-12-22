export const safe = (s) =>
  (s || "Untitled")
    .replace(/[^0-9A-Za-z_\-\u4e00-\u9fa5]+/g, "_")
    .slice(0, 80);

export const safeStringify = (val) => {
  try {
    return typeof val === "string" ? val : JSON.stringify(val);
  } catch {
    return String(val ?? "");
  }
};
