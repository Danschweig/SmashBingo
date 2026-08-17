# Smash Bingo

Eine mobile Bingo-Webanwendung für gemeinsame *Super Smash Bros. Ultimate*-Runden.

## Seiten und Funktionen

- `index.html`: zufällige 4 × 4- und 5 × 5-Boards erzeugen, Felder abhaken oder einzeln neu rollen und eine Bonus-Challenge spielen
- `pool.html`: gemeinsame Bingo- und Bonus-Felder hinzufügen, bearbeiten und löschen
- Der aktuelle Pool und das Board werden lokal zwischengespeichert
- Mit Firebase Firestore werden Pool-Änderungen in Echtzeit an alle Geräte übertragen
- Installierbare Progressive Web App mit Offline-Oberfläche

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

Die Firebase-Web-Konfiguration ist kein privater Server-Schlüssel und darf im Frontend stehen. Die mitgelieferten Regeln erlauben ausschließlich den Zugriff auf das Pool-Dokument, begrenzen den normalen Pool auf 200 sowie den Bonus-Pool auf 100 Einträge und verbieten das Löschen des Dokuments. Nach diesem Update müssen die geänderten Regeln erneut in der Firebase Console veröffentlicht werden, bevor der Bonus-Pool cloud-synchronisiert werden kann.

Der Sound bei drei gleichzeitigen Bingo-Linien wird aus `assets/triple-bingo.mp3` abgespielt und vom Service Worker für die Offline-Nutzung zwischengespeichert.

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
