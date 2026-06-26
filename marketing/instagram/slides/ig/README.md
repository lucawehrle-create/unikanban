# Instagram-native Slides (Upload-fertig)

Diese Versionen sind **exakt 1080 px breit** (Stories 1080×1920, Feed-Karussells
1080×1350) — Instagrams native Größe. Lokal sauber heruntergerechnet
(supersampled) aus den hochauflösenden Slides im übergeordneten Ordner.

**Diese hier hochladen, nicht die 2160-px-Originale.** Dann muss Instagram nicht
selbst skalieren und macht nur einen einzigen JPEG-Schritt → schärfere Schrift.

Neu erzeugen (nach Änderungen an den Render-Skripten):
```
node marketing/instagram/slides/render-ig-native.mjs
```

## Damit es auf Instagram scharf bleibt
1. **App-Einstellung an:** Instagram → Einstellungen → *Mediennutzung* →
   **„Medien in höchster Qualität hochladen"** aktivieren. (Häufigste Ursache.)
2. **Sauber aufs Handy bringen:** AirDrop, Google Drive (**Original** laden, nicht
   die Vorschau) oder Kabel. **Nicht** per WhatsApp/Telegram/iMessage — die
   komprimieren das Bild schon vor Instagram.
3. **Im Story-Editor nicht zoomen:** Bei exaktem 9:16 füllt das Bild von selbst.
   Pinch-to-Zoom skaliert hoch und macht unscharf.
