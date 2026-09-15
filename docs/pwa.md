# PWA and Theme Maintenance

Serve the repository root over HTTPS in production or localhost for development:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

The manifest and worker use root-relative URLs, matching the existing satoshi.si deployment. Subdirectory hosting requires updating those URLs and the existing asset links.

`theme.css` loads after page styles and owns shared neutral colors and responsive rules. Existing orange colors remain in the page styles. Prefer the shared surface variables for new neutral backgrounds.

The shared background uses a small transparent noise tile (`img/grain.png`) moved in discrete steps behind page content. `--grain-opacity` controls its strength. `siteEffects.css` and `siteEffects.js` add a 240 ms channel-change departure and a 200 ms arrival, or a 380 ms CRT shutdown for external same-tab links. New-tab links, modified clicks, downloads, same-page anchors, and non-HTTP links retain native behavior. Reduced-motion preferences disable both the moving grain and navigation effects. History restoration clears departure overlays. All effect assets are precached for offline use.

`pwa.js` registers `sw.js`. The worker precaches the home shell and offline page, uses network-first fetching for visited pages and static assets, and falls back to cached responses on network failure. External requests, JSON data, query strings, and non-GET requests are excluded. External fonts and icons may fall back or be unavailable offline; live tools still require connectivity.

Increment the cache version in `sw.js` when releasing changed precached assets. New workers wait for existing tabs to close before activating; activation removes only older Satoshi caches. No automatic reload interrupts an active form or game.

## Verification

- Inspect the manifest and service worker in browser developer tools.
- Visit the home page, wait for service worker activation, then test offline navigation and an unvisited page.
- Test installation on Android Chrome and iOS Safari after HTTPS deployment.
- Check pages at 320, 390, 768, and 1440 pixels, plus short landscape windows. Open navigation, submenus, and dialogs, and check keyboard focus and scrolling.

## Further Cleanup

Navigation and modal markup are duplicated across pages. A build-time partial system would reduce drift while retaining static hosting. Several tools also depend on externally hosted scripts and live services; offline support for each tool needs its own data and dependency strategy. Existing game states and third-party embeds need real-service integration checks beyond layout testing.
