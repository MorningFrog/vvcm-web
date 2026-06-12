# VVCM Web

VVCM Web is a React, TypeScript, and Vite visual test bench for the `@morningfrog/vvcm-rs` WebAssembly package. It helps inspect VVCM forward-kinematics inputs and outputs for multi-robot transporting system with a deformable sheet.

## Features

* Configure the robot count, which also controls the deformable sheet vertex count.
* Configure the robot hold height used by the VVCM solver.
* Edit deformable sheet vertices and robot positions in coordinate tables.
* Drag sheet vertices and robot positions directly on an SVG coordinate canvas.
* Toggle sheet and robot view layers independently in the coordinate canvas, with both visible by default.
* Pan and zoom the coordinate canvas manually, with a fit-view control to reframe the current geometry.
* Inspect robot ground points `r#`, elevated `p# hold point` markers, FK object points `po`, and taut `p#-po` links in a Z-up Three.js 3D view.
* Import, edit, sync, and copy point arrays as JSON.
* Copy and paste the full solver configuration, including `robotCount`, `holdHeight`, `sheet`, and `formation`.
* Run `VvcmFk` in the browser and display candidate solution counts, stability labels, object poses, virtual object points, and taut cable indices.
* Visualize the sheet polygon, robot formation, cable reference lines, single-solution taut `vi-vo` and `ri-ro` segments, and selected or all FK solution positions with matching solution colors in the canvas and FK result list.
* Switch displayed indices between 0-based and 1-based labels for points, FK solutions, object markers, and taut cable lists.
* Switch the interface language between Simplified Chinese and English.

## Requirements

* Node.js compatible with the versions required by Vite and TypeScript in `package.json`.
* npm.

## Install

```bash
npm install
```

Install the managed Chromium browser once before using the screenshot script:

```bash
npm run screenshot:install
```

## Run

```bash
npm run dev
```

Vite prints the local development URL after startup. If the default port is already occupied, pass a port explicitly:

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

## Screenshot

Use the project screenshot script for repeatable visual checks, especially after Codex or another automation tool changes UI, canvas, or 3D visualization code:

```bash
npm run screenshot
```

The script starts a temporary Vite server on `127.0.0.1:5174` or the next free port, waits for the main UI to render, captures desktop and mobile viewport screenshots, writes them to `artifacts/screenshots/`, and shuts the server down automatically. Inspect both `artifacts/screenshots/vite-desktop.png` and `artifacts/screenshots/vite-mobile.png` after the command finishes.

Screenshot configuration is controlled with environment variables:

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `VITE_SCREENSHOT_HOST` | `127.0.0.1` | Host used by the temporary Vite server. |
| `VITE_SCREENSHOT_PORT` | `5174` | Preferred port for the temporary Vite server. |
| `VITE_SCREENSHOT_STRICT_PORT` | `false` | Set to `true` to fail instead of trying the next free port. |
| `VITE_SCREENSHOT_DIR` | `artifacts/screenshots` | Directory where screenshots are written. |
| `VITE_SCREENSHOT_PATH` | `/` | Route to open before taking screenshots. |

PowerShell example:

```powershell
$env:VITE_SCREENSHOT_PORT = '5180'; $env:VITE_SCREENSHOT_PATH = '/'; npm run screenshot
```

## Build

```bash
npm run build
```

The production output is written to `dist/`.

## Lint

```bash
npm run lint
```

## Usage

Use the parameter panel to set the robot count and hold height. The robot count is clamped to the supported UI range and keeps the sheet vertex count and robot position count aligned. Use the full configuration actions in the left sidebar to copy or paste the complete solver configuration.

On desktop, the workspace uses three independently scrolling columns: sheet vertex and robot position inputs, including JSON editors, on the left; the coordinate canvas and 3D view in the center; FK results and FK result JSON on the right.

The default interface language is English. Use the language selector in the header to switch between English and Simplified Chinese. The selected language is saved in local browser storage and reused on the next visit.

Use the index selector in the header to choose 0-based or 1-based display labels. The setting is saved in local browser storage and keeps sheet vertex labels, robot labels, FK solution labels, object marker labels, and taut cable lists consistent.

Use the edit mode control and point tables to choose whether you are editing sheet vertices or robot positions. Use the sheet view and robot view checkboxes in the Coordinate Canvas header to show or hide those canvas layers; the sheet view includes `vo` markers, and the robot view includes `po` markers. Drag a point marker or its label to move that point. Drag empty canvas space to pan the view, use the mouse wheel or the `+` and `-` controls to zoom, and use `Fit` to reframe the currently visible sheet, robot, and FK result geometry.

The 3D view uses the same VVCM coordinates directly with Z as the vertical axis. The legend describes robot ground points as `r# ground`, elevated hold points as `p# hold point`, visible FK object points as `po object`, and taut links as `taut p#-po`; in-scene point labels use the active index base, such as `r0`/`p0` or `r1`/`p1`. Orbit, pan, and zoom the 3D view with the mouse or touchpad, and use `Reset` to fit the current scene. Switching the shown FK solution preserves the current 3D camera view. 3D labels scale with the view to stay readable, and camera movement stops immediately when input ends. In single-solution mode the selected solution's taut cables are drawn from the relevant `p#` hold point to `po`; in all-solutions mode every visible `po` is shown with that solution's taut `p#-po` links.

The point tables provide precise numeric editing. The JSON editors accept arrays of `[x, y]` tuples or `{ "x": number, "y": number }` objects. Applying a JSON editor also updates the shared robot count to match the number of parsed points.

The FK result panel calls:

```ts
const fk = new VvcmFk(robotCount, holdHeight, sheet)
const solutions = fk.updateStableSolutions(formation)
```

The FK result panel lists every candidate branch from `solutions.solutions`, marks each branch as stable or unstable, shows each branch's `po` and `vo`, and lets you show one branch or all branches on the canvas. When exactly one branch is visible, taut cables from that branch are highlighted as `vi-vo` and `ri-ro` segments. In all-branches mode, object and virtual-object markers for every branch are drawn while taut segments are hidden to keep the canvas readable.

## Data Format

Point arrays can be represented as tuples:

```json
[
  [213.7, 122.7],
  [804.6, 37.2],
  [904.0, 550.0],
  [439.3, 715.9]
]
```

The full copied and pasted configuration uses this shape:

```json
{
  "robotCount": 4,
  "holdHeight": 1000,
  "sheet": [
    [-316.1, -421.9],
    [803.4, -384.1],
    [746.1, 712.8],
    [-367.3, 664.2]
  ],
  "formation": [
    [213.7, 122.7],
    [804.6, 37.2],
    [904.0, 550.0],
    [439.3, 715.9]
  ]
}
```

## WebAssembly Notes

The app consumes `@morningfrog/vvcm-rs`, which ships wasm-bindgen generated ESM that imports `vvcm_rs_bg.wasm` directly. Vite 8 does not handle that ESM wasm import form by default, so `vite.config.ts` includes a small compatibility plugin that instantiates the package wasm and re-exports its bindings.

The Vite dependency optimizer excludes `@morningfrog/vvcm-rs` so the same wasm compatibility path works in development and production builds.

## Scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check the project and build production assets. |
| `npm run lint` | Run ESLint. |
| `npm run preview` | Preview the production build locally. |
| `npm run screenshot` | Start a temporary Vite server and capture desktop and mobile screenshots. |
| `npm run screenshot:install` | Install Playwright's managed Chromium browser for screenshot capture. |

## Project Structure

```text
src/
  App.tsx       Main VVCM visual test bench UI and solver integration.
  App.css       Test bench layout, canvas, and control styling.
  i18n.ts       UI translation dictionaries and locale persistence helpers.
  index.css     Global styles.
  main.tsx      React entry point.
  RobotScene3D.tsx  Z-up Three.js robot hold-height and FK object visualization.
scripts/
  screenshot-vite.mjs  Temporary Vite server and Playwright screenshot helper.
vite.config.ts  Vite config, React plugin, and vvcm-rs wasm compatibility.
```
