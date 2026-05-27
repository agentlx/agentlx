export function isDocumentVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}
