<p align="center">
  <img src="icons/icon128.png" alt="Skyplayr logo" width="88" height="88" />
</p>

<p align="center">
  <strong>Skyplayr</strong>
</p>

<p align="center">
  Premium universal Picture-in-Picture for Netflix and modern HTML5 video players
</p>

<p align="center">
  <a href="#"> 
    <img alt="manifest-v3" src="https://img.shields.io/badge/Manifest-V3-2f7dc4" />
  </a>
  <a href="#">
    <img alt="chrome" src="https://img.shields.io/badge/Chrome-114%2B-2ed3b7" />
  </a>
  <a href="#">
    <img alt="netflix-first" src="https://img.shields.io/badge/Netflix-First%20Resilience-e50914" />
  </a>
  <a href="#">
    <img alt="pip" src="https://img.shields.io/badge/Picture--in--Picture-Always%20Ready-113A64" />
  </a>
</p>

<p align="center">
  <a href="#features">Features</a>
  ·
  <a href="#installation">Installation</a>
  ·
  <a href="#usage">Usage</a>
  ·
  <a href="#compatibility-profiles">Compatibility</a>
  ·
  <a href="#netflix-test-scenarios">Netflix QA</a>
</p>

## Overview

Skyplayr is a production-grade Chrome Extension built with Manifest V3.

It is optimized for Netflix and hardened for dynamic players on streaming, education, OTT, and generic HTML5 platforms.

The extension continuously rescans candidate videos, survives SPA transitions, and retries PiP requests with layered fallback timing.


## Features

* Universal video discovery across visible HTML5 players
* Shadow DOM traversal for encapsulated player trees
* Same-origin iframe traversal for embedded playback surfaces
* Netflix-first resilience during autoplay, quality, subtitle, and route changes
* Smart fallback retries at 0ms, 300ms, and 1000ms
* Recovery hooks for fullscreen changes and DOM mutations
* Toolbar command, keyboard shortcut, and draggable in-page button
* Options page with synced preferences across Chrome profile
* Tooltip and toast states: Ready, Active, Retry, Failed

## Installation

1. Open Chrome and go to `chrome://extensions`.
2. Enable Developer mode.
3. Select Load unpacked.
4. Choose the `Skyplayr` folder.
5. Pin Skyplayr in the toolbar.
6. Open extension Details and select Extension options.

## Usage

* Toolbar icon toggles Picture-in-Picture
* Keyboard shortcut:
  * Windows/Linux: `Ctrl+Shift+P`
  * macOS: `Command+Shift+P`
* Floating Skyplayr button toggles PiP from the page

## Configuration

Settings are stored in `chrome.storage.sync`:

* `autoEnterOnTabSwitch` default `false`
* `restoreAfterAutoplay` default `true`
* `showOverlayButton` default `true`

Open configuration:

1. Go to `chrome://extensions`.
2. Select Skyplayr Details.
3. Click Extension options.
4. Save or reset defaults.

## Compatibility Profiles

* netflix.com
* youtube.com
* primevideo.com
* disneyplus.com
* coursera.org
* Generic fallback profile

## Known Limitations

* Cross-origin iframe videos are not script-accessible.
* Some DRM policy environments can block PiP regardless of extension behavior.
* Sites that enforce `disablePictureInPicture` can reject requests.
* Browser PiP behavior can differ across Chrome versions.

## Roadmap

1. Domain diagnostics panel for fast support debugging.
2. Optional playback controls in overlay where policy allows.
3. Smart candidate memory for per-domain reliability tuning.
4. Enterprise policy support for managed deployments.
5. Per-domain override settings in options UI.
