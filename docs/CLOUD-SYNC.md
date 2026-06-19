# Cloud-Sync einrichten (Supabase)

SemBan funktioniert standardmäßig **rein lokal** (IndexedDB, kein Konto). Optional
kannst du Cloud-Sync aktivieren: Dann können sich Nutzer:innen anmelden und ihre
Daten werden geräteübergreifend synchron gehalten (Handy ↔ Web).

Ist keine Supabase-Konfiguration hinterlegt, bleibt alles wie bisher – der
„Anmelden"-Eintrag taucht dann gar nicht erst auf.

## 1. Supabase-Projekt anlegen
1. Auf <https://supabase.com> ein kostenloses Konto + neues Projekt erstellen.
2. **Project Settings → API**: dort findest du
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

## 2. Datenbank-Tabelle anlegen
Im Supabase-Dashboard **SQL Editor** öffnen und den Inhalt von
[`supabase/schema.sql`](../supabase/schema.sql) einfügen und ausführen.
Das legt die Tabelle `user_data` mit Row-Level-Security an (jede:r sieht nur die
eigenen Daten).

## 3. Login-Methoden aktivieren (Authentication → Providers)
- **E-Mail**: standardmäßig aktiv. Für Tests ggf. „Confirm email" temporär aus.
- **Google**: aktivieren und Client-ID/Secret aus der
  [Google Cloud Console](https://console.cloud.google.com/) (OAuth-Client) eintragen.
- **Apple**: aktivieren und die Apple-Service-ID/Key hinterlegen
  (Apple Developer Account nötig).

### Redirect-URLs (Authentication → URL Configuration)
- **Site URL**: die Adresse, unter der SemBan läuft (z. B. `https://semban.de`).
- **Redirect URLs** zusätzlich für lokale Tests:
  - `http://localhost:5173`
  - `http://localhost:4173`

> Bei den OAuth-Providern (Google/Apple) zusätzlich die von Supabase angezeigte
> **Callback-URL** (`https://DEIN-PROJEKT.supabase.co/auth/v1/callback`) in der
> jeweiligen Entwicklerkonsole als zulässige Redirect-URI eintragen.

## 4. Schlüssel hinterlegen
Lokal: `.env.example` nach `.env` kopieren und die beiden Werte eintragen:

```bash
cp .env.example .env
# VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY ausfüllen
```

Beim Hosting (Vercel/Netlify/…) die beiden Variablen in den
Projekt-Umgebungsvariablen setzen.

## 5. Fertig
Neu starten/builden – im „Mehr"-Menü erscheint jetzt **Anmelden & sichern**.
Nach dem Login wird beim ersten Mal abgeglichen; danach pushen lokale Änderungen
automatisch (entprellt) und beim App-Fokus wird geprüft, ob ein anderes Gerät
neuer ist.

## E-Mails hübsch machen (optional)
Die Standard-Mails von Supabase sind schlicht. Im Repo liegen gebrandete
HTML-Vorlagen unter [`supabase/email-templates/`](../supabase/email-templates/):

| Datei | Supabase-Template | Betreff-Vorschlag |
|---|---|---|
| `confirm-signup.html` | **Confirm signup** | SemBan – bestätige deine E-Mail |
| `reset-password.html` | **Reset Password** | SemBan – Passwort zurücksetzen |

So einsetzen:
1. Supabase → **Authentication → Emails → Templates**.
2. Das jeweilige Template wählen, **„Source"/HTML** öffnen.
3. Inhalt der passenden Datei reinkopieren, Betreff setzen, speichern.

Der Platzhalter `{{ .ConfirmationURL }}` wird von Supabase automatisch durch den
echten Link ersetzt – nicht ersetzen oder umbenennen.

> Hinweis: Über Supabase' Standard-Versand gibt es ein striktes Rate-Limit
> (wenige Mails/Stunde) und der Absender ist eine Supabase-Adresse. Für den
> produktiven Betrieb unter eigener Absenderadresse später **Custom SMTP**
> einrichten (Authentication → Emails → SMTP Settings).

## Wie der Sync funktioniert (Kurzfassung)
- Gespeichert wird pro Konto **ein JSON-Dokument** (das bestehende Backup-Format)
  in `user_data`.
- **Konfliktregel:** „neuere Version gewinnt" (per Zeitstempel).
- **Erstes Verknüpfen** eines Geräts, auf dem schon lokale Daten liegen und in der
  Cloud ebenfalls: SemBan fragt, welche Seite behalten werden soll.
- `anon key` ist öffentlich (nur für den Browser gedacht); die Datensicherheit
  kommt aus den Row-Level-Security-Policies.
