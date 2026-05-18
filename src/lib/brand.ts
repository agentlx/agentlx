export const APP_NAME = "agentlx";

export const APP_DESCRIPTION =
  "Painel para monitoramento e execucao remota em servidores Linux via agent.";

const BRAND_ICON_SVG = String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect x="1" y="1" width="30" height="30" rx="8" fill="url(#bg)"/><rect x="1" y="1" width="30" height="30" rx="8" stroke="rgba(255,255,255,0.14)"/><path d="M10.75 10.75L15 15l-4.25 4.25" stroke="#F8FAFC" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.5 20.25H22.25" stroke="#F8FAFC" stroke-width="2.4" stroke-linecap="round"/><path d="M20.75 8.75L24 12" stroke="#93C5FD" stroke-width="1.7" stroke-linecap="round" opacity=".95"/><defs><linearGradient id="bg" x1="4" y1="3.5" x2="28.5" y2="29"><stop stop-color="#3B82F6"/><stop offset="1" stop-color="#2563EB"/></linearGradient></defs></svg>`;

export const BRAND_ICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(BRAND_ICON_SVG)}`;
