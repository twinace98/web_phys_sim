// Inline SVG icons, 20×20, currentColor.
const svg = (body: string) =>
  `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  play: svg('<path d="M6.5 4.5v11l9-5.5z" fill="currentColor" stroke="none"/>'),
  pause: svg('<rect x="5.5" y="4.5" width="3" height="11" rx="0.8" fill="currentColor" stroke="none"/><rect x="11.5" y="4.5" width="3" height="11" rx="0.8" fill="currentColor" stroke="none"/>'),
  step: svg('<path d="M5 5v10l7.5-5z" fill="currentColor" stroke="none"/><path d="M15 5v10"/>'),
  reset: svg('<path d="M4.5 10a5.5 5.5 0 1 0 1.7-4"/><path d="M4.5 3.5v3h3"/>'),
  // Vertical sliders, so it never reads as the menu (hamburger) icon.
  sliders: svg('<path d="M5.5 3.5v13M10 3.5v13M14.5 3.5v13"/><circle cx="5.5" cy="12.5" r="2" fill="currentColor"/><circle cx="10" cy="6.5" r="2" fill="currentColor"/><circle cx="14.5" cy="10.5" r="2" fill="currentColor"/>'),
  info: svg('<circle cx="10" cy="10" r="7.2"/><path d="M10 9v5"/><circle cx="10" cy="6.4" r="0.6" fill="currentColor"/>'),
  link: svg('<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9"/>'),
  check: svg('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>'),
  menu: svg('<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"/>'),
  screen: svg('<rect x="2.8" y="4" width="14.4" height="9.5" rx="1.2"/><path d="M7 16.5h6M10 13.5v3"/>'),
  close: svg('<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>'),
};
