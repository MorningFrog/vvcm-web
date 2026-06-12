# VVCM Web

VVCM Web is a React, TypeScript, and Vite visual test bench for the `@morningfrog/vvcm-rs` WebAssembly package. It helps inspect VVCM forward-kinematics inputs and outputs for multi-robot transporting system with a deformable sheet.

## Features

* Configure the robot count, which also controls the deformable sheet vertex count.
* Configure the robot hold height used by the VVCM solver.
* Edit deformable sheet vertices and robot positions in coordinate tables.
* Drag sheet vertices and robot positions directly on an SVG coordinate canvas.
* Import, edit, sync, and copy point arrays as JSON.
* Copy the full solver configuration, including `robotCount`, `holdHeight`, `sheet`, and `formation`.
* Run `VvcmFk` in the browser and display candidate solution counts, stability labels, object poses, virtual object points, and taut cable indices.
* Visualize the sheet polygon, robot formation, cable reference lines, single-solution taut `vi-vo` and `ri-ro` segments, and selected or all FK solution positions.
* Switch the interface language between Simplified Chinese and English.

## Requirements

* Node.js compatible with the versions required by Vite and TypeScript in `package.json`.
* npm.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Vite prints the local development URL after startup. If the default port is already occupied, pass a port explicitly:

```bash
npm run dev -- --host 127.0.0.1 --port 5174
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

Use the parameter panel to set the robot count and hold height. The robot count is clamped to the supported UI range and keeps the sheet vertex count and robot position count aligned.

The default interface language is English. Use the language selector in the header to switch between English and Simplified Chinese. The selected language is saved in local browser storage and reused on the next visit.

Use the edit mode control to choose whether canvas clicks edit sheet vertices or robot positions. Drag a point marker or its label to move that point. Clicking the canvas moves the currently selected point to the clicked coordinate.

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

The full copied configuration uses this shape:

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

## Project Structure

```text
src/
  App.tsx       Main VVCM visual test bench UI and solver integration.
  App.css       Test bench layout, canvas, and control styling.
  i18n.ts       UI translation dictionaries and locale persistence helpers.
  index.css     Global styles.
  main.tsx      React entry point.
vite.config.ts  Vite config, React plugin, and vvcm-rs wasm compatibility.
```
