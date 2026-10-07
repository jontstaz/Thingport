# Thingport Grab

A browser extension for Chrome, Edge and Firefox that imports MakerWorld, Thingiverse, Printables,
and Cults3D models into your self-hosted Thingport instance without leaving the provider's site.
Visiting a model, collection, or Thingiverse Likes page shows a floating Thingport icon; clicking it
opens a small panel to pick what to import (and, for a single model, an optional destination
collection), then imports it the same way Thingport's own "+ Add > Import" does.

It's useful without Thingport too: on MakerWorld model pages it adds a **Download normalized**
button that turns the Bambu Studio project into a 3MF that PrusaSlicer, Cura and other slicers open
with its colors and print settings intact. See [Download normalized](#download-normalized-no-thingport-needed).

**Get it from the [Chrome Web Store](https://chromewebstore.google.com/detail/nmblahmglpbplmfcggghdgohohlaeiee),
[Firefox Add-ons](https://addons.mozilla.org/firefox/addon/thingport-grab/) or
[Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/kahfidpmojfocohinlmglnfoaimocbol).**

It talks directly to your Thingport instance's API from the extension's background script -- no
separate server, no data sent anywhere else -- and converts files in your browser. See the [privacy policy](PRIVACY.md) for exactly what
it stores and sends.

## Screenshots

<table>
  <tr>
    <td width="50%"><a href="docs/screenshots/panel-printables.jpg"><img src="docs/screenshots/panel-printables.jpg" alt="Import panel on a Printables model page"></a><br><sub><b>Printables</b> -- import panel on a model page</sub></td>
    <td width="50%"><a href="docs/screenshots/imported-printables.jpg"><img src="docs/screenshots/imported-printables.jpg" alt="Import finished, with an Open in Thingport button"></a><br><sub><b>Imported</b> -- with a link straight to the model in Thingport</sub></td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/screenshots/panel-makerworld.jpg"><img src="docs/screenshots/panel-makerworld.jpg" alt="Import panel on a MakerWorld model page"></a><br><sub><b>MakerWorld</b> -- import panel on a model page</sub></td>
    <td width="50%"><a href="docs/screenshots/panel-thingiverse.jpg"><img src="docs/screenshots/panel-thingiverse.jpg" alt="Import panel on a Thingiverse thing page"></a><br><sub><b>Thingiverse</b> -- import panel on a thing page</sub></td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/screenshots/setup-dialog-makerworld.jpg"><img src="docs/screenshots/setup-dialog-makerworld.jpg" alt="Setup dialog opened from the grayed-out icon"></a><br><sub><b>Not set up yet</b> -- the grayed-out icon's setup dialog</sub></td>
    <td width="50%"></td>
  </tr>
</table>

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/popup-setup.png" alt="Popup before setup"><br><sub><b>Popup</b> -- before setup</sub></td>
    <td width="33%"><img src="docs/screenshots/popup-connected.png" alt="Popup when connected, with recent imports"><br><sub><b>Popup</b> -- connected, with recent imports</sub></td>
    <td width="33%"><img src="docs/screenshots/popup-connected-dark.png" alt="Popup in dark mode"><br><sub><b>Popup</b> -- dark mode</sub></td>
  </tr>
</table>

## Install

### Chrome / other Chromium browsers

Install **[Thingport Grab from the Chrome Web Store](https://chromewebstore.google.com/detail/nmblahmglpbplmfcggghdgohohlaeiee)**
-- click **Add to Chrome**, then click the new Thingport icon in your toolbar (it may be under the
puzzle-piece Extensions button) and enter your instance's URL and your Thingport login. Chrome
keeps it up to date from then on. Other Chromium browsers that install from the Chrome Web Store
(Brave, Vivaldi, Opera with its Chrome extensions add-on) work the same way.

<details>
<summary>Alternative: install the Chrome build by hand</summary>

Only needed if you can't use the store, e.g. to try a build before it's been published there:

1. Download `thingport-grab-chrome.zip` from the
   [`extension-latest` release](https://github.com/TautvydasDerzinskas/Thingport/releases/tag/extension-latest)
   and unzip it somewhere permanent (the browser loads the extension from that folder every time it
   starts, so don't delete it).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.

A hand-installed copy doesn't update itself -- repeat these steps for a newer version.
</details>

### Firefox

Install **[Thingport Grab from Firefox Add-ons](https://addons.mozilla.org/firefox/addon/thingport-grab/)**
-- click **Add to Firefox**, then click the new Thingport icon in your toolbar (it may be under the
puzzle-piece Extensions button) and enter your instance's URL and your Thingport login. Firefox
keeps it up to date from then on.

<details>
<summary>Alternative: install the Firefox build by hand</summary>

Only needed if you can't use the store, e.g. to try a build before it's been published there.
Firefox refuses to install _any_ unsigned extension outside of Developer Edition/Nightly, so this
is a Mozilla-signed `.xpi` rather than a zip -- CI signs one for self-distribution (the "unlisted"
channel) on every push to `main` (see [Releases](CONTRIBUTING.md#releases-ci) in the development
guide):

1. Download `thingport-grab-firefox.xpi` from the
   [`extension-latest` release](https://github.com/TautvydasDerzinskas/Thingport/releases/tag/extension-latest).
2. Open it directly (double-click, or `File > Open File` in Firefox) -- or drag it onto a Firefox
   window -- and confirm the install prompt.

</details>

### Microsoft Edge

Install **[Thingport Grab from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/kahfidpmojfocohinlmglnfoaimocbol)**
-- click **Get**, then click the new Thingport icon in your toolbar (it may be under the
puzzle-piece Extensions button) and enter your instance's URL and your Thingport login. Edge keeps
it up to date from then on.

<details>
<summary>Alternative: install the Edge build by hand</summary>

Only needed if you can't use the store, e.g. to try a build before it's been published there:

1. Download `thingport-grab-edge.zip` from the
   [`extension-latest` release](https://github.com/TautvydasDerzinskas/Thingport/releases/tag/extension-latest)
   and unzip it somewhere permanent (Edge loads the extension from that folder every time it
   starts, so don't delete it).
2. Open `edge://extensions` and turn on **Developer mode** (in the left sidebar).
3. Click **Load unpacked** and select the unzipped folder.

A hand-installed copy doesn't update itself -- repeat these steps for a newer version.
</details>

## Download normalized (no Thingport needed)

MakerWorld's files are Bambu Studio projects, which PrusaSlicer, Cura, Anycubic Slicer Next,
Creality Print, Elegoo Slicer and Snapmaker Orca often open without their colors or print settings.
On a MakerWorld model page, the extension adds a **Download normalized** button under MakerWorld's
own "Open in Bambu Studio" (or Download) button. Clicking it downloads the selected print profile's file, converts it, and saves
a `<name>-normalized.3mf` that keeps painted colors, filament colors, plates and the designer's
settings (walls, layer height, infill, supports). Multi-part objects may be merged into one,
per-object overrides and layer color changes are dropped, and you pick your own printer profile.
Hover the bulb on the button for the same summary.

- **Who sees it:** everyone who hasn't connected the extension to a Thingport instance, and people
  who have, when their Thingport profile's slicer is one of those above (with Bambu Studio or
  OrcaSlicer picked, the original file is the right one, so the button stays hidden).
- **Where it runs:** entirely in your browser, the same conversion Thingport's "Open normalized"
  does on the server. The file goes nowhere but your downloads folder.
- **Limits:** you need to be signed in to MakerWorld, as for its own Download button, and files over
  50 MB are too big to convert in the browser -- the button says so. MakerWorld's button is found by
  its label, so it only appears while MakerWorld is in English.

## Setup

The popup asks for your instance URL (e.g. `https://thingport.example.com`) and your Thingport
email/password once. Until that's done, importable pages show a grayed-out Thingport icon; clicking
it explains what's needed and opens that same setup form (the toolbar popup, or the same form in a
tab where the browser won't let the extension open its popup itself). Saving requests permission to
reach that one origin and validates the login before storing anything. After that, the toolbar icon
turns from the dark/inactive icon to the color/active one, and the floating icon becomes the normal
import button. Reopen the popup any time to change the instance (the pencil next to its address) or
flip **Extension enabled** off to pause it without losing the saved setup.

The extension re-authenticates automatically as its session token nears expiry -- there's nothing
to keep re-entering day to day. If your password changes or a session gets revoked server-side, the
next import attempt will silently re-login with the stored credentials, or surface a clear error if
those no longer work.

### MakerWorld: no separate cookie setup needed

Importing from MakerWorld normally requires pasting a session cookie into Thingport's Profile
settings by hand (MakerWorld's own site sets it `HttpOnly`, which blocks a normal web page from
reading it -- that's the whole reason for the manual copy/paste). This extension reads that same
cookie directly from your browser instead, using the `cookies` API -- a privileged, extension-only
capability explicitly allowed to read `HttpOnly` cookies, unlike a regular page's own JavaScript.
It's sent only to your own Thingport instance, as part of the same import request that needs it,
exactly like the cookie you'd otherwise paste in by hand -- never anywhere else. If your Thingport
account doesn't already have a MakerWorld cookie saved, the extension also pushes this one to
Profile > MakerWorld for you, so the plain web app's own imports benefit too, not just ones started
from the extension.

## What counts as "importable"

- A single model page (MakerWorld, a Thingiverse Thing, a Printables Model, a Cults3D model) --
  hidden automatically once you've already imported that exact page.
- A MakerWorld collection, a Thingiverse Collection or Likes page, a Printables collection, or a
  Cults3D creator's creations page -- lets you import the listed designs in one go.

Picking a destination collection is only offered for a single-model import; a batch import instead
lands in Thingport's own auto-named collection for that batch (e.g. "Thingiverse Likes"), matching
how the web app's own batch imports already work.

A batch import keeps running on the server even if you close the panel or the tab -- closing it
just stops showing progress, it doesn't cancel anything.

## Privacy

Thingport Grab has no servers of its own and sends nothing to its developer or any third party --
only to your own Thingport instance and the provider site you're on. The
**[privacy policy](PRIVACY.md)** lists exactly what it stores, what it sends and where.

## Contributing

The extension is TypeScript and SCSS, built per browser with esbuild. See
**[CONTRIBUTING.md](CONTRIBUTING.md)** for the development setup, the code layout, building and
packaging for the Chrome Web Store, Edge Add-ons and addons.mozilla.org, and how the screenshots
above are generated.
