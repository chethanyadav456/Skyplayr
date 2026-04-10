---
title: Skyplayr
description: Production-grade Manifest V3 Chrome extension for universal Picture-in-Picture with Netflix-first resilience
author: Skyplayr
ms.date: 2026-04-10
ms.topic: reference
keywords:
  - chrome extension
  - picture in picture
  - netflix
  - manifest v3
estimated_reading_time: 10
---

## Skyplayr Overview

Skyplayr is a production-grade Chrome Extension (Manifest V3) designed as a premium universal floating player solution.

It is optimized for Netflix and resilient enough for modern streaming, education, and generic HTML5 video platforms. The extension automatically finds the best visible video candidate, survives dynamic DOM replacement, and retries PiP requests with layered fallback logic.

## Product Identity

* Product Name: Skyplayr
* Short Name: Skyplayr PiP
* Store Title: Skyplayr - Universal PiP for Netflix & Video Players
* Tone: premium, modern, reliable, power-user friendly
* Visual Direction: floating-window, sky, lightweight, always-on-top feel

## Features

* Universal HTML5 video detection with visibility and size prioritization
* Shadow DOM traversal for modern encapsulated players
* Same-origin iframe traversal support
* Netflix-first resilience for player replacement and SPA transitions
* Smart PiP retries at 0ms, 300ms, and 1000ms
* Recovery after fullscreen transitions and DOM re-renders
* Toolbar, keyboard, and floating in-page toggle controls
* Optional auto-enter on tab switch
* Optional restore after autoplay episode transitions
* Site profile architecture with modular handlers
* Lightweight draggable overlay with tooltip states and toasts

## Folder Structure

```text
Skyplayr/
  manifest.json
  background.js
  content.js
  inject.js
  options.html
  options.js
  siteProfiles/
    netflix.js
    youtube.js
    primevideo.js
    disneyplus.js
    coursera.js
    generic.js
    index.js
  utils/
    shadowWalker.js
    videoScanner.js
  styles/
    overlay.css
    options.css
  icons/
    icon-source.svg
    icon16.png
    icon32.png
    icon48.png
    icon128.png
  README.md
  STORE_LISTING.md
```

## Core Architecture

* `background.js`
  * MV3 service worker for toolbar action, keyboard command routing, and telemetry logging.
* `content.js`
  * Bridge between extension runtime and page context, settings sync, shortcut fallback, visibility-triggered auto-enter.
* `inject.js`
  * In-page runtime with DOM observers, SPA route hooks, fullscreen handling, fallback retries, overlay UI, and PiP orchestration.
* `options.html` + `options.js`
  * Native extension settings page for synced toggles and reset-to-default controls.
* `utils/shadowWalker.js`
  * Recursive traversal for document, shadow roots, and same-origin iframe documents.
* `utils/videoScanner.js`
  * Candidate scanning, visibility filtering, scoring, and best-video ranking.
* `siteProfiles/*.js`
  * Domain-optimized scoring and compatibility handlers.
* `styles/overlay.css`
  * Premium floating control, state tooltip colors, animations, and mobile-safe behavior.

## Install Instructions

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable Developer mode.
3. Select Load unpacked.
4. Pick the Skyplayr folder.
5. Pin the extension to the toolbar.
6. Open extension Details and click Extension options to configure behavior.
7. Open Netflix or any video site and click the Skyplayr toolbar icon.

## Usage

* Toolbar button toggles Picture-in-Picture.
* Keyboard shortcut is `Ctrl+Shift+P` on Windows/Linux and `Command+Shift+P` on macOS.
* Floating in-page Skyplayr button toggles PiP directly.
* Tooltip states:
  * Ready
  * Active
  * Retry
  * Failed

## Configuration

Extension settings are stored in `chrome.storage.sync`:

* `autoEnterOnTabSwitch` (default `false`)
* `restoreAfterAutoplay` (default `true`)
* `showOverlayButton` (default `true`)

Set these from the built-in options page:

1. Open `chrome://extensions`.
2. Find Skyplayr and click Details.
3. Click Extension options.
4. Toggle settings and click Save settings.

## Chrome Web Store Packaging

1. Ensure production icons exist at 16, 32, 48, and 128 sizes in PNG format.
2. Remove any local debug-only files if added during QA.
3. Zip the folder contents so `manifest.json` is at the root of the zip.
4. Validate with Chrome Extension Developer Dashboard checks.
5. Upload zip to Chrome Web Store Developer Dashboard.
6. Set store listing metadata to:
   * Title: Skyplayr - Universal PiP for Netflix & Video Players
   * Summary: Premium universal Picture-in-Picture extension with Netflix-first reliability
7. Add screenshots showing Netflix, YouTube, and generic HTML5 playback scenarios.
8. Submit and monitor policy review results.

For listing copy variants and screenshot direction, use `STORE_LISTING.md`.

## Netflix Test Scenarios

Run the following before release:

1. Start playback and enter PiP from toolbar.
2. Trigger next-episode autoplay and verify PiP restoration.
3. Change subtitle language and verify active player rebind.
4. Change quality and verify PiP still attaches to the current video.
5. Enter and exit fullscreen multiple times and confirm retry recovery.
6. Navigate between episodes using in-app SPA route transitions and confirm re-detection.
7. Refresh while in player view and confirm overlay appears with Ready state.
8. Test when multiple videos exist on page and ensure largest active player is selected.

## Known Limitations

* Cross-origin iframe videos cannot be inspected due to browser security boundaries.
* Some DRM environments can disable PiP through platform policy and no extension can bypass that restriction.
* Websites that explicitly set `disablePictureInPicture` may reject requests.
* Browser-level PiP behavior can vary across Chrome versions and OS builds.

## Future Roadmap

1. Domain-level diagnostics panel for user troubleshooting.
2. Playback controls inside overlay (skip, seek, speed where allowed).
3. Smart learning model to prioritize historically successful video nodes.
4. Enterprise deployment policy templates and managed configuration support.
5. Per-domain policy overrides in options UI.

## Branding-Ready Icon Suggestions

Use a visual language that feels lightweight and always-on-top:

* Core concept: rounded floating window over a soft sky gradient
* Primary motif: subtle horizon arc with a detached mini-player frame
* Color palette:
  * Deep Sky: `#113A64`
  * Cloud Blue: `#5DB8FF`
  * Aurora Mint: `#2ED3B7`
  * Night Glass: `#081325`
* Style guidance:
  * High contrast at 16px
  * Minimal interior detail for readability
  * Distinct silhouette from common PiP glyph icons

## Reliability Notes

Skyplayr uses a layered resilience strategy:

* Continuous DOM observation and candidate rescoring
* Netflix-first scoring profile and rebind behavior
* Recovery hooks for route changes and fullscreen state changes
* Multi-delay fallback retries with reason logging

This design significantly improves reliability over simple single-video PiP toggles used by many extensions.
