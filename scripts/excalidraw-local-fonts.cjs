// Excalidraw 0.18.1 always appends esm.sh to every FontFace source list.
// Keep the fallback same-origin too, without weakening CSP or patching dependencies.
module.exports = function localFonts(source) {
  const pattern = /new URL\((\w+),(\w+)\.ASSETS_FALLBACK_URL\)/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error('Excalidraw font fallback changed; review the pinned asset adapter.');
  return source.replace(pattern, 'new URL($1,window.location.origin+"/excalidraw/")');
};
