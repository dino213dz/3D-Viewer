<p align="center">
  <img src="logo.png" alt="3D Viewer" width="96" height="96" />
</p>

# 3D Viewer

## Description

3D Viewer lets you view your 3D files in FBX, GLB and GLTF formats.

**Author:** CHORFA Allaeddine  
**Website:** [chorfa.fr](https://chorfa.fr)  
**Contact:** [webmaster@chorfa.fr](mailto:webmaster@chorfa.fr)  
**GitHub:** [dino213dz/3D-Viewer](https://github.com/dino213dz/3D-Viewer)  
**Demo / test:** [https://3dviewer.h4ckr213dz.workers.dev/](https://3dviewer.h4ckr213dz.workers.dev/)  
**Created:** 19 August 2026  
**Last updated:** 23 August 2026, 14:38 CEST  

**Version:** 2.4.0

---

## Features

- Mobile / desktop UI
- Menu, toolbar, floating panels and context menu
- Saves your edits (materials, scene and environment settings)
- Unlimited Undo / Redo (history per file)
- FBX / GLB / GLTF / ZIP (containing the previous formats)
- Edit materials, lights, ground (grid, flat plane or none) and sky colour
- Scene options: wireframe, frame object / visible area, gizmos and light cones
- UI customisation: light / dark mode, accent colours, transparency
- Languages: French / English
- Navigation:
  - Right-click → context menu
  - Click the object → material-name bubble, select it in the material editor
  - Double-click an element → frame it
  - Double-click the ground → ground editor

---

## Version history

### 2.4.0 — 23 August 2026, 14:38 CEST
- Light and material axes match the gizmos (Z is up, not Y)
- Gizmos and light cones stay hidden after a new file or a page refresh
- Texture preview: draggable / resizable window, image scales with the window, embedded GLB textures display correctly
- README features rewritten; file translated to English
- About: description updated; rainbow ring around the logo (starts/stops with the window)
- Loading indicator if a task takes more than 1 second (files, materials, lights, wireframe)
- Default language follows the browser (French if FR, otherwise English)
- New favicon SVG (grey V behind red 3 + purple D)

### 2.3.3 — 22 August 2026, 17:15 CEST
- Critical fix: startup crash (`UI_I18N` used before init) that blocked the model, menu and windows

### 2.3.2 — 22 August 2026, 16:30 CEST
- App / tab title: “3D Viewer” only
- Double-click the light (sphere), not the cone → Lights panel with focus
- Separator at the top of the View menu
- Accents apply live (including light mode)
- Settings: UI transparency
- Materials: texture name (including embedded GLB maps)
- Live texture alpha
- Saved colours: right-click to delete (desktop), long-press (mobile)
- Texture preview for embedded ImageBitmap / GLB maps

### 2.3.1 — 22 August 2026, 14:41 CEST
- Settings window: draggable, resizable, − / + / ×, closes on outside click
- Language buttons readable (active = coloured + white text)
- Saved values loaded when opening Settings
- Save = defaults only; Apply = current scene
- Collapsible Settings sections
- Sketchfab link under “Reload default model”
- Light/dark accents actually applied
- Tooltips on each setting

### 2.3.0 — 22 August 2026, 14:05 CEST
- Right-click drag pans without opening the context menu
- Blender 5 gizmos: Z up (blue), Y green, X red
- Textures: alpha, reset scale, reload original, preview
- File menu: Download from Sketchfab, Settings
- Languages moved into Settings
- Settings: accents, default sky/ground, gizmos/cones, GitHub links
- Clicking a light cone no longer opens the Lights panel
- Favicon “3D” + purple V
- Yes/No confirm before leaving or refreshing

### 2.2.7 — 22 August 2026, 00:07 CEST
- Critical HTML fix: Materials panel markup left Lights content outside the window

### 2.2.6 — 22 August 2026, 00:02 CEST
- Lights window list restored if empty; reliable minimum size
- Panel minimum size 300×280

### 2.2.5 — 21 August 2026, 23:54 CEST
- Materials section −/+ like lights
- Save-colour button bottom-right
- Compact Apply / Apply to all / Reset
- Long-press to delete a saved colour

### 2.2.4 — 21 August 2026, 23:38 CEST
- Materials collapse-all / expand-all
- About: red “Update available” label

### 2.2.3 — 21 August 2026, 22:21 CEST
- Material list name + swatch update on every selection
- Frame visible area: centre and zoom in the free zone

### 2.2.2 — 21 August 2026, 22:10 CEST
- Critical syntax fix in `doFrameVisible` that blocked all JavaScript

### 2.2.1 — 21 August 2026, 22:00 CEST
- Material list name / swatch
- Section −/+ next to the title
- Frame visible area places the object in the free zone

### 2.2.0 — 21 August 2026, 21:14 CEST
- File properties name and size update on file change
- Collapsible material groups
- Quick Apply (✓) on the materials title bar
- Frame object fills the window without overflowing
- Help closes on outside click
- Compact status bar
- Better mobile landscape framing

### 2.1.9 — 21 August 2026, 19:30 CEST
- Ground options moved to Edit
- Light mode orange accent; grey dropdowns
- Vertical menu alignment
- Colour swatch inside each material row

### 2.1.8 — 21 August 2026, 19:07 CEST
- Close icon as a clear X
- Reset ground
- Light cards in light mode
- Only the active language is highlighted
- About links: black (light) / white (dark)

### 2.1.7 — 21 August 2026, 18:38 CEST
- Title bar vertically centred
- About links visible in light mode
- Light-mode mobile menu

### 2.1.6 — 21 August 2026, 18:25 CEST
- About window in light mode
- Window buttons on the right
- Light-mode accent `#F54927`
- About: “(Up to date)” green or “(Update)” red + GitHub link
- Only the active language highlighted

### 2.1.5 — 21 August 2026, 18:06 CEST
- Open-file window: single close button
- Double-click light → lights panel
- Ground edit on double-click only
- Monochrome window buttons; thinner title bar
- About title “About 3D Viewer”
- GitHub version check
- Help: mouse / touch controls
- Textures released on clear / new file

### 2.1.4 — 21 August 2026, 17:20 CEST
- Default language English; preference saved
- Critical TDZ fix on `currentLang` that blocked modele.glb
- Default model loading restored

### 2.1.3 — 21 August 2026, 17:08 CEST
- Status bar
- Window buttons − + × on the right
- Broader EN translation

### 2.1.2 — 21 August 2026, 16:37 CEST
- Mobile menu closes on a link click or outside click

### 2.1.1 — 21 August 2026, 16:25 CEST
- FR/EN UI
- Transparent Ground submenu
- Show / Hide dynamic labels
- Right-click context menu
- Ground editor; material swatch
- Windows 3.11 light theme, accent `#F54927`

### 2.1.0 — 21 August 2026, 15:30 CEST
- GLB textures / colorSpace
- FR/EN; modele.glb; logo.png
- Help, file properties, gizmo X/Y/Z labels
- Collapsible / renamed lights
- Ground grid / plane / none
- Double-click to frame an element

### 2.0.3 — 20 August 2026
- Gizmo in View menu
- Synced colour pickers

### 2.0.2 — 20 August 2026
- Reset sky colour
- Show / hide gizmos
- Materials grouped by name

### 2.0.1 — 20 August 2026
- Submenus close from the bar
- Light rotation X/Y/Z
- Axis gizmo; sky colour

### 2.0.0 — 20 August 2026 *(major)*
- Accent `#6761FF`; numbered materials
- 3D click → material bubble; About logo

### 1.7.9 — 20 August 2026
- README history; toolbar tooltips

### 1.7.8 — 20 August 2026
- Materials / Lights toggles; About icons

### 1.7.7 — 20 August 2026
- GitHub link in About; toolbar shortcuts

### 1.7.6 — 20 August 2026
- Only one submenu open at a time

### 1.7.5 — 20 August 2026
- Help shortcuts; accent `#6761FF`; file properties

### 1.7.4 — 20 August 2026
- Undo/Redo history per file

### 1.7.3 — 20 August 2026
- Visible-area framing fix

### 1.7.2 — 20 August 2026
- Window layout portrait / landscape
- Frame visible area

### 1.7.1 — 20 August 2026
- Second material apply fix; Redo; hex colours

### 1.7.0 — 20 August 2026
- Undo on the bar; SVG icons; texture scale X/Y/Z

### 1.6.9 — 20 August 2026
- `performUndo` syntax fix

### 1.6.8 — 20 August 2026
- File → Edit → View; Undo on the bar

### 1.6.7 — 20 August 2026
- Edit menu; unlimited Undo + Ctrl+Z

### 1.6.6 — 20 August 2026
- 66% transparency

### 1.6.5 — 19–20 August 2026
- No window open at startup

### 1.6.4 — 19–20 August 2026
- Open-file window (drag & drop)

### 1.6.3 — 19–20 August 2026
- Reset original materials

### 1.6.2 — 19–20 August 2026
- Load only via File menu

### 1.6.1 — 19–20 August 2026
- Author CHORFA Allaeddine; default model

### 1.6.0 — 19 August 2026
- Floating glass windows

### 1.5.x — 19 August 2026
- Responsive menu; material selection kept

### 1.4.x – 1.2.x — 19 August 2026
- Mac-style menu, HUD, auto-frame, ZIP/FBX/GLB

### 1.0.0 — 19 August 2026
- First release (Car3D Tester → 3D Viewer)
