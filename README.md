# Smash Bingo

Eine mobile Bingo-Webanwendung für gemeinsame *Super Smash Bros. Ultimate*-Runden.

## Seiten und Funktionen

- `index.html`: zufällige 4 × 4- und 5 × 5-Boards erzeugen, Felder abhaken oder einzeln neu rollen und eine Bonus-Challenge spielen
- `pool.html`: gemeinsame Bingo- und Bonus-Felder hinzufügen, bearbeiten und löschen
- Der aktuelle Pool und das Board werden lokal zwischengespeichert
- Mit Firebase Firestore werden Pool-Änderungen in Echtzeit an alle Geräte übertragen
- Installierbare Progressive Web App mit Offline-Oberfläche

## Felder mit benötigter Anzahl

Im Felder-Pool kannst du beim Anlegen und Bearbeiten die **benötigte Anzahl** zwischen 1 und 999 einstellen. Zum Beispiel: Text „Jemand fällt erbärmlich runter“, Anzahl **5**. Das Feld erscheint als „5 × Jemand fällt erbärmlich runter“. Gleicher Text mit verschiedenen Zielzahlen ist als eigene Variante erlaubt; identische Kombinationen werden verhindert.

Bei Anzahl **1** bleibt das Feld per Antippen abhakbar und hat keine Zählerbuttons. Ab Anzahl **2** zeigt das Board **−**, **Fortschritt / Ziel** und **+**. Erst beim Zielwert wird das Feld markiert und für Bingo-Linien sowie ein volles Board gewertet. Mit Minus kannst du Fehlzählungen korrigieren; unterhalb des Ziels entfällt die Wertung wieder. Die Anzahl bleibt zwischen null und dem Zielwert.

Der Fortschritt bleibt beim Neuladen und beim Spielerwechsel erhalten. Nach der Punkteabgabe sind die Zähler gesperrt. Neurollen setzt den Zähler dieses Feldes zurück. Pool-Änderungen ändern keine Ziele auf schon laufenden Boards. Der separate Bonus-Pool bleibt eine einmalige Extra-Challenge.

Bestehende Felder als Text bleiben kompatibel und gelten als Ziel **1**. Mehrfach-Felder werden als `{ text, target }` in derselben Firebase-Felderliste gespeichert. Die vorhandenen Pool-Regeln erlauben Listen mit diesen Einträgen bereits; für diese Funktion ist keine Änderung an Firebase-Regeln nötig. Schafkopf und Leaderboard-Regeln bleiben unverändert.

Zum Veröffentlichen auch die neue Datei `field-model.js` mitpushen. Danach die App auf allen Geräten neu laden, damit Pool und Board das neue Feldformat unterstützen.

## Spieler und Leaderboard

Vor dem Start wählst du Daniel, Fabian oder Tim. Bis zur bestätigten Punkteabgabe kannst du den Namen jederzeit wechseln, ohne das Board oder seine Markierungen zu verlieren. Deine Auswahl und das laufende Board werden auf deinem Gerät gespeichert. Während des Speicherns und bei einem noch unbestätigten Speicherversuch bleibt die Zuordnung fest, damit dieselbe Runde nicht für mehrere Spieler gezählt wird. Ein älteres Board ohne Spieler kann nach der Namensauswahl weitergespielt werden.

Mit **Fertig · Runde abschließen** bestätigst du das Ergebnis: Jede aktuell vollständig markierte Reihe, Spalte und Diagonale zählt als ein Bingo. Ein erfülltes Bonus-Feld zählt zusätzlich als ein Bingo. Ein volles 4 × 4-Board ergibt somit 10 Bingos (mit Bonus 11), ein volles 5 × 5-Board 12 (mit Bonus 13). Wiederholtes Ab- und Anhaken sammelt keine zusätzlichen Punkte. Auch Runden mit null Bingos können abgeschlossen werden.

Jedes Board besitzt eine feste Runden-ID. Das Ergebnis wird per Firestore-Transaktion einmalig in der Collection `smashBingoRounds` gespeichert. Bereits gespeicherte Ergebnisse werden nicht verändert; ein erneuter Speicherversuch derselben Runde fügt keine Punkte hinzu. Die Rangliste summiert diese Ergebnisse live für alle drei Spieler, gleiche Gesamtzahlen erhalten denselben Rang.

Nach dem Abschluss bleiben die Felder gesperrt; für die nächste Runde mischst du ein neues Board. Beim Abbruch oder Größenwechsel einer laufenden Runde werden keine Punkte gespeichert. Zum Speichern ist eine Internetverbindung nötig. Scheitert das Speichern, bleibt das eingefrorene Ergebnis lokal erhalten und kann mit **Ergebnis erneut speichern** erneut übertragen werden; bis dahin kann kein neues Board gestartet werden.

**Einmalig erforderlich:** Veröffentliche die gesamte aktuelle Datei `firestore.rules` in der Firebase Console unter **Firestore Database → Rules**. Die Regeln erlauben gültige neue Rundenergebnisse für die drei Namen, verbieten Änderungen und Löschungen und erhalten die bisherigen Regeln für Pool und Schafkopf-Räume. Committe und pushe danach die App einschließlich `leaderboard-store.js` zu GitHub Pages. Ohne veröffentlichte Regeln zeigt die App einen Hinweis; ein Ergebnis wird dann nicht als gespeichert ausgegeben.

Die Namensauswahl verwendet wie der bisherige Pool keinen Login; sie ist für eure Freundesgruppe gedacht und verifiziert die Identität nicht.

### Leaderboard manuell korrigieren

Mit **Edit** öffnest du die Passwortabfrage. Nach Eingabe von **Schiss** kannst du die Gesamt-Bingos für Daniel, Fabian und Tim auf ganze Zahlen ab null setzen. Der Button ist verfügbar, sobald Rundenergebnisse und Korrekturen aus Firebase live geladen sind.

Die Freischaltung gilt nur für einen Speicherversuch. Beim Speichern wird sie sofort verbraucht, auch wenn die Übertragung fehlschlägt. Nach Abbrechen, Neuladen, Verlassen der Seite oder spätestens fünf Minuten ist ebenfalls eine erneute Passworteingabe nötig. Es wird kein Admin-Status in Cookies oder im lokalen Speicher abgelegt.

Korrekturen werden separat in `smashBingo/leaderboardAdjustments` gespeichert; die ursprünglichen Rundenergebnisse bleiben erhalten. Die App speichert die Differenz zum beim Freischalten angezeigten Gesamtstand. Während der Bearbeitung neu abgeschlossene Runden zählen dadurch zusätzlich. Wenn jemand anderes zwischenzeitlich eine Korrektur speichert, wird ein veralteter Speicherversuch abgelehnt; öffne Edit dann erneut und prüfe den aktuellen Stand.

**Zum Aktivieren:** Die gesamte aktualisierte `firestore.rules` erneut in der Firebase Console veröffentlichen und alle App-Dateien einschließlich `leaderboard-editor.js` zu GitHub Pages pushen. Die Regeln für den Pool und für Schafkopf-Räume bleiben unverändert.

**Grenze der Passwortabfrage:** In dieser statischen App ist das Passwort eine Bedienungssperre und im ausgelieferten JavaScript einsehbar. Firebase prüft die Struktur der Korrekturen, aber keinen Admin-Login. Gegen gezielte Manipulationen wäre eine serverseitige Anmeldung erforderlich.

## Warum Firebase nötig ist

GitHub Pages liefert nur statische Dateien aus und besitzt keine Datenbank. `localStorage` gilt immer nur für einen einzelnen Browser. Damit mehrere Handys dieselbe Liste sehen, wird eine externe Datenbank benötigt. Diese Anwendung ist bereits für Cloud Firestore vorbereitet.

Ohne Firebase-Konfiguration läuft sie automatisch im lokalen Modus. Auf der Pool-Seite zeigt ein Statusfeld an, welcher Modus aktiv ist.

## Firestore einmalig einrichten

1. Öffne die [Firebase Console](https://console.firebase.google.com/) und erstelle ein Projekt.
2. Registriere im Projekt eine Web-App über das `</>`-Symbol. Firebase zeigt danach ein Objekt namens `firebaseConfig` an.
3. Erstelle unter **Build → Firestore Database** eine Firestore-Datenbank.
4. Öffne [`firebase-config.js`](firebase-config.js) und ersetze die vier Platzhalter durch `apiKey`, `authDomain`, `projectId` und `appId` aus deiner Firebase-Konfiguration.
5. Öffne in Firestore den Tab **Rules**, kopiere den Inhalt aus [`firestore.rules`](firestore.rules) hinein und klicke auf **Publish**.
6. Committe und pushe die Änderungen zu GitHub Pages. Beim ersten Aufruf wird der bisher lokale Pool als gemeinsamer Pool angelegt.

Die Firebase-Web-Konfiguration ist kein privater Server-Schlüssel und darf im Frontend stehen. Die mitgelieferten Regeln begrenzen den normalen Pool auf 200 sowie den Bonus-Pool auf 100 Einträge und verbieten das Löschen des Pool-Dokuments. Für die Rangliste erlauben sie neue, gültige Rundenergebnisse und ein separates Korrekturdokument. Änderungen und Löschungen von Rundenergebnissen sind gesperrt. Nach diesem Update müssen die geänderten Regeln erneut in der Firebase Console veröffentlicht werden, bevor das Leaderboard genutzt werden kann.

Beim Erreichen von zwei Bingo-Linien spielen die ersten vier Sekunden von `assets/Double-Bingo.mp3`, bei drei Linien `assets/triple-bingo.mp3`, bei fünf Linien `assets/5-bingo.mp3` und beim vollständig markierten Board `assets/Alle Voll.mp3`. Das Bonus-Feld zählt separat. Überschreitet ein Klick mehrere Schwellen, hat das volle Board Vorrang, danach fünf, drei und zwei Linien. Beim Wiederherstellen des Boards bleiben die Sounds aus; fällt der Stand unter eine Schwelle, kann sie erneut ausgelöst werden.

Die Sounds starten direkt beim Antippen. Der Service Worker speichert die vollständigen MP3-Dateien für die Offline-Nutzung und beantwortet Byte-Range-Anfragen mit passenden Teilantworten. Netzwerk-Teilantworten (HTTP 206) werden nicht in den Cache geschrieben, da die Cache API dies ablehnt. Cache-Schreibfehler blockieren erfolgreiche Netzwerkantworten nicht mehr.

### Sicherheitshinweis

Die aktuelle Variante ist für eine kleine private Freundesgruppe gedacht: Jeder Besucher der veröffentlichten Seite kann den Pool bearbeiten. Wenn die Seite öffentlich beworben wird oder der Inhalt geschützt sein soll, sollte zusätzlich Firebase Authentication eingerichtet und der Schreibzugriff in den Regeln auf angemeldete Personen begrenzt werden.

## Lokal starten

Da die Anwendung keine Build-Abhängigkeiten hat, reicht ein kleiner Webserver:

```powershell
python -m http.server 8080
```

Danach `http://localhost:8080` im Browser öffnen. Das direkte Öffnen als `file://` funktioniert im lokalen Modus, Browser können dort aber JavaScript-Module blockieren; ein Webserver ist daher empfohlen.

## GitHub-Pages-Cache zurücksetzen

Falls die veröffentlichte Seite nach einem Update schwarz bleibt oder alte Dateien lädt, ist meist noch ein alter Service Worker im Browser aktiv. Lade die Seite einmal hart neu (`Strg` + `F5`) oder lösche in den Browser-Entwicklertools unter **Application → Service Workers** die Registrierung für die GitHub-Pages-Seite.

## Leaderboard-Tests

Mit Node.js lassen sich die Regressionstests ohne zusätzliche Pakete ausführen:

```powershell
node tests/leaderboard.test.mjs
node tests/leaderboard-editor.test.mjs
node tests/field-progress.test.mjs
node tests/pool-fields.test.mjs
```

Die Tests prüfen Punkte und Gleichstände, doppelte beziehungsweise konkurrierende Speicherungen, Spielerwechsel vor der Abgabe, feste Zuordnung beim Speichern, abgeschlossene Boards, Wiederherstellung, Speicherausfälle und alte Boards mit simuliertem Firestore und DOM. Außerdem prüfen sie manuelle Korrekturen, konkurrierende Bearbeitungen, den Passwortdialog und das Ende der Freischaltung bei Speichern, Abbrechen und Zeitablauf. Ein Dateivergleich schützt die ursprünglichen Pool- und Schafkopf-Regeln. Die Firebase-Regeln und die Darstellung auf echten Handys müssen nach der Veröffentlichung zusätzlich geprüft werden.

Die Zählertests prüfen Teilfortschritt, Plus/Minus-Grenzen, Bingo-Schwellen und Sounds, altes und neues Speicherformat, Neurollen, feste Ziele laufender Boards und gesperrte abgeschlossene Runden. Die Pooltests prüfen Anlegen, Bearbeiten, Varianten, doppelte Felder, Wiederherstellung und parallele Änderungen sowohl lokal als auch mit einer simulierten Firebase-Verbindung.
