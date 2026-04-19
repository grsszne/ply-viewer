# PLY Viewer

Small static PLY viewer for GitHub Pages.

The main difference from most lightweight web viewers is that it renders point clouds as world-scale circular splats rather than fixed-size screen pixels, so zooming in does not collapse the scene into tiny dots.

## Features

- Drag-and-drop local `.ply` files
- Optional `?file=...` query parameter for hosted demo files
- Circular shaded splats with depth correction
- Radius multiplier and pixel clamp controls
- Plain static output that builds cleanly for GitHub Pages

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The output is in `dist/`.

## GitHub Pages

One simple path:

1. Push this repo to GitHub.
2. Run `npm install` and `npm run build`.
3. Publish the `dist/` folder with GitHub Pages, or use a Pages action that builds the repo.

Because `vite.config.js` uses `base: "./"`, the built app works from a project subpath instead of assuming domain root.

## Remote file loading

If you host a file alongside the viewer, you can open it with:

```text
https://your-pages-site.example/?file=sample.ply
```

For arbitrary local files, drag them onto the drop zone.
