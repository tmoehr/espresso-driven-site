# Unity WebGL Demo (HelioPath)

Source for the WebGL demo served at `www.espressodriven.com/demo/heliopath/`.
This folder is **excluded from deploy** (see `--exclude='unity'` in
`.github/workflows/deploy.yml`) — it is source only and never ships to the live site.

## 1. Install the custom template

Copy `WebGLTemplates/EspressoDriven/` into the Unity project at:

```
<UnityProject>/Assets/WebGLTemplates/EspressoDriven/
```

Then, under **Project Settings → Player → WebGL → Resolution and Presentation**,
select the **EspressoDriven** template.

The template **links the site stylesheet** (`<link rel="stylesheet" href="/styles.css">`)
as the single source of truth — it defines no colours of its own, only the demo-specific
overlay layout, all expressed through the shared tokens. It also runs the same pre-paint
script as the main page, so the demo opens in the visitor's chosen dark/light/auto mode
(persisted in `localStorage`, shared across the origin) and follows live OS changes while
on auto. The page chrome is the usual one: header with wordmark, gold loading bar, a "back"
link to `/#assets`, and a fullscreen button.

## 2. Pipeline

⚠️ **HDRP does not run in WebGL.** The demo scene must be built in **URP**
(or Built-in).

## 3. Player Settings (for GitHub Pages)

**Project Settings → Player → WebGL → Publishing Settings**

| Setting | Value | Why |
|---|---|---|
| Compression Format | **Brotli** | best size |
| **Decompression Fallback** | **✅ on** | GitHub Pages cannot set `Content-Encoding` — the fallback decompresses client-side, otherwise the loader fails |
| Data Caching | ✅ | faster repeat visits (IndexedDB) |
| Debug Symbols | Off | release |

**Other Settings**

| Setting | Value |
|---|---|
| Code Optimization | Disk Size |
| Managed Stripping Level | High |
| Strip Engine Code | ✅ |
| Color Space | Linear |

## 4. Build target

Build output to:

```
<repo>/demo/heliopath/
```

Unity writes `index.html`, `Build/`, and `TemplateData/` there. Its `index.html`
overwrites the placeholder page. Then commit & push — deploy picks up
`demo/heliopath/` automatically (the `?v=<sha>` rewrite in the workflow only
touches top-level `*.html`, not subfolders, so the loader paths stay intact).
