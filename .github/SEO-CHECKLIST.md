# SEO-Checkliste — espressodriven.com

Lebende Checkliste. Liegt bewusst in `.github/` (vom Deploy-Workflow
ausgeschlossen → versioniert, aber nicht öffentlich auf der Seite).

## Regelmäßig prüfen (z. B. quartalsweise)
- [ ] **Title & Meta-Description** noch aktuell? ≤ ~60 / ~155 Zeichen, Keywords vorne.
- [ ] **Canonical** zeigt auf die kanonische URL (`https://www.espressodriven.com/`).
- [ ] **sitemap.xml** enthält alle indexierbaren Seiten, `lastmod` aktuell.
- [ ] **robots.txt** erlaubt Crawling, Sitemap-Verweis korrekt.
- [ ] **JSON-LD** valide → [Rich Results Test](https://search.google.com/test/rich-results).
- [ ] **OG-/Twitter-Tags** konsistent mit Title/Description, `og:image` erreichbar (1200×630).
- [ ] **Alt-Texte** für alle inhaltlich relevanten Bilder gesetzt.
- [ ] **Google Search Console**: Abdeckung/Indexierung, keine neuen Fehler, Core Web Vitals grün.
- [ ] **Ladezeit / Lighthouse**: Performance & SEO-Score prüfen.
- [ ] **Broken Links** (intern wie extern, z. B. LinkedIn) noch gültig.

## Backlog / „wenn X passiert"
- [ ] **HelioPath-Release**: Sobald HelioPath live ist (statt „Coming Soon"), ein
      zusätzliches `Product`- bzw. `SoftwareApplication`-JSON-LD ergänzen — mit
      Preis (`offers`), `aggregateRating` und ggf. `applicationCategory`. Kann
      Rich Snippets (Sterne/Preis) in der Suche erzeugen. Bewusst noch weggelassen,
      weil ohne Release-/Preisdaten Google-Warnungen entstehen.
- [ ] Bei neuen Unterseiten: je Seite eigener Title/Description/Canonical + Eintrag in sitemap.xml.
- [ ] Optional: **Bing Webmaster Tools** einrichten (analog zur Search Console).

## Einmalig nach Go-Live (Status)
- [x] Google Search Console: Domain-Property `espressodriven.com` per DNS/Cloudflare
      verifiziert; www-Startseite indexiert; URL-Präfix-Property als Bonus angelegt.
- [x] Strukturierte Daten geprüft: Schema Markup Validator 0 Fehler. (Rich Results Test
      meldet „keine Elemente" — erwartet: `Organization`/`WebSite` sind keine
      Rich-Snippet-Typen. Greift erst, wenn `Product`/`SoftwareApplication` dazukommt.)

## Was bereits eingerichtet ist (2026-06-14)
- Keyword-erweiterter Title + Meta-Description.
- `<link rel="canonical">`, SVG-Favicon.
- OG-/Twitter-Tags konsistent gezogen.
- JSON-LD: Organization + WebSite.
- robots.txt + sitemap.xml im Root (Deploy shippt sie automatisch mit).

## Google Search Console eingerichtet (2026-06-15)
- Domain-Property via Cloudflare-DNS-Integration verifiziert (deckt apex + www ab).
- Apex → www sauber per 301; nur www ist kanonisch und indexiert.
- Sitemap unter `https://www.espressodriven.com/sitemap.xml` eingereicht.
- Verifizierung hängt an der Cloudflare-Integration (kein Backup-Meta-Tag — bewusst
  verworfen als Over-Engineering für eine statische Single-Page). Wenn die
  Cloudflare↔Google-Verknüpfung je getrennt wird, Property neu verifizieren.
