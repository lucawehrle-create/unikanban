# SemBan deployen (Vercel)

SemBan ist eine statische Vite-App (kein eigener Server). Am einfachsten geht das
Hosting über **Vercel** – kostenlos, mit automatischem Deploy bei jedem Push.

## 1. Vercel-Projekt anlegen
1. Auf <https://vercel.com> mit GitHub anmelden.
2. **Add New → Project** → das Repo `unikanban` importieren.
3. Vercel erkennt **Vite** automatisch:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - (so lassen)
4. Als **Production Branch** den gewünschten Branch wählen (z. B. `main` – ggf.
   den Feature-Branch vorher dorthin mergen).

## 2. Umgebungsvariablen setzen
Unter **Settings → Environment Variables** (für *Production* **und** *Preview*):

| Name | Wert |
|---|---|
| `VITE_SUPABASE_URL` | deine Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | dein anon/publishable Key |

Ohne diese Variablen läuft SemBan rein lokal (kein Login) – mit ihnen ist der
Cloud-Sync aktiv.

## 3. Deploy
**Deploy** klicken → nach ~1 Min gibt es eine URL wie
`https://semban-xxxx.vercel.app`. Schon erreichbar.

## 4. Eigene Domain (optional, sobald vorhanden)
1. Domain (z. B. `semban.de`) registrieren.
2. In Vercel: **Settings → Domains → Add** → `semban.de` → den angezeigten
   DNS-Eintrag beim Registrar setzen.

## 5. Supabase auf die Live-URL einstellen (wichtig fürs Login!)
**Authentication → URL Configuration:**
- **Site URL:** `https://semban.de` (bzw. die `.vercel.app`-URL, falls noch keine Domain)
- **Redirect URLs** (hinzufügen):
  - `https://semban.de`
  - `https://semban.de/**`
  - die `.vercel.app`-URL (für Tests)
  - für Vorschau-Deploys optional ein Wildcard wie `https://*.vercel.app/**`

> Ohne passende Redirect-URL schlägt Google/Apple-/Magic-Link-Login mit
> „redirect_to not allowed" o. ä. fehl.

## Hinweise
- **`vercel.json`** im Repo ist schon vorbereitet:
  - SPA-Fallback (alle Pfade → `index.html`),
  - `sw.js`/`index.html`/Manifest werden **nicht** dauerhaft gecacht (damit der
    „Neue Version verfügbar"-Hinweis zuverlässig auslöst),
  - gehashte Assets unter `/assets/*` werden langfristig gecacht.
- **Auto-Deploy:** Jeder Push auf den Production-Branch deployt automatisch;
  andere Branches bekommen eine Preview-URL.
- **Daten:** liegen weiterhin lokal (IndexedDB) bzw. – bei Login – in Supabase.
  Das Hosting speichert keine Nutzerdaten.
