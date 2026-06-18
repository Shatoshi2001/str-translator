/**
 * Inline SVG icons (stroke style, 24×24).
 */
window.AppIcons = (function appIcons() {
  function svg(paths, size = 18) {
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  return {
    folder: () => svg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.5L10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/>', 17),
    play: () => svg('<polygon points="8 5 19 12 8 19 8 5"/>', 17),
    stop: () => svg('<rect x="7" y="7" width="10" height="10" rx="1"/>', 17),
    export: () => svg('<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5-5H7a2 2 0 0 0-2 2z"/><path d="M12 11v6"/><path d="M9 14l3 3 3-3"/>', 17),
    edit: () => svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>', 15),
    copy: () => svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 15),
    chevronLeft: () => svg('<path d="M15 18l-6-6 6-6"/>', 16),
    chevronRight: () => svg('<path d="M9 18l6-6-6-6"/>', 16),
    check: () => svg('<path d="M20 6 9 17l-5-5"/>', 14),
    loader: () => svg('<path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/>', 14),
    circle: () => svg('<circle cx="12" cy="12" r="9"/>', 14),
    pencil: () => svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>', 13),
    retranslate: () => svg('<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/>', 15),
  };
}());
