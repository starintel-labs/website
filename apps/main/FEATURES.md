# Homepage features

Edit `src/features.json` to update the homepage carousel and feature cards together.
Each record supplies a stable `id`, `title`, short `caption`, card `description`,
`status`, and an `image` URL under `public/`. Keep development status explicit.
The Vite plugin renders the catalog into HTML at build time, so the content also
works without JavaScript. Restart the build to publish catalog changes.

The six SVGs in `public/figures/` are editable diagrams, not product screenshots.
The Radar chart uses illustrative data and is labeled accordingly.

The carousel advances every six seconds, pauses on hover, focus, or a hidden tab,
and provides previous, next, and pause controls. Reduced-motion preferences start
it paused and disable the sliding transition. Without JavaScript the figure strip
can be scrolled manually.
