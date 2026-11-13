/** Open the command palette from anywhere (e.g. the top-bar search button). */
export const openCommandPalette = () => window.dispatchEvent(new Event("command-palette:open"));
