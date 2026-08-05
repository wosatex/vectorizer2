# Vectorizer

Prüft, ob ein Text in einer Vektordatenbank auffindbar ist. Zerlegt ihn in Abschnitte, bewertet jeden einzeln, misst welche Frage welchen Abschnitt findet, und vergleicht die Themenabdeckung mit Wettbewerbertexten.

Eine einzige HTML-Datei, kein Build, keine Abhängigkeiten, kein Server.

---

## Echte Embeddings

Standardmäßig vergleicht Vectorizer nur Wörter und Wortstämme. Das erkennt keine Synonyme. Im Feld **Embeddings** lässt sich stattdessen ein echtes Modell einschalten — der Schlüssel wird manuell eingegeben, bleibt im Tab und geht direkt an den Anbieter.

**Google Gemini (`gemini-embedding-001`)** ist die Voreinstellung, aus zwei Gründen. Erstens ist der Browser-Zugriff bestätigt: Ein Preflight gegen `generativelanguage.googleapis.com` mit `content-type` und `x-goog-api-key` liefert die nötigen CORS-Header. (Der verbreitete CORS-Fehler betrifft nur den neuen SDK-Client, der einen zusätzlichen `Api-Revision`-Header setzt — mit einfachem `fetch` tritt er nicht auf.) Zweitens kennt das Modell **Task-Typen**: `RETRIEVAL_QUERY` für Anfragen, `RETRIEVAL_DOCUMENT` für Abschnitte, `SEMANTIC_SIMILARITY` für Dubletten. Das sind genau die drei Messungen, die dieses Tool braucht — die Architektur mit getrennten Vektorräumen fällt darauf ohne Umbau.

**OpenAI (`text-embedding-3-small`)** funktioniert auch, kennt aber keine Task-Typen: Anfrage und Abschnitt laufen durch dasselbe Modell.

Beide werden auf **768 Dimensionen** gekürzt. Laut Googles MTEB-Tabelle kostet das 0,17 Punkte gegenüber 3072 und spart drei Viertel der Datenmenge im Browser. Bei `gemini-embedding-001` müssen gekürzte Vektoren manuell normalisiert werden — das Tool tut das.

Fällt der Anbieter aus, wird auf den Wortabgleich zurückgefallen, mit Hinweis.

### Zwei Messungen statt einer

Die lexikalische Ebene bleibt aktiv, auch wenn Embeddings laufen. Wo beide auseinandergehen, ist das kein Widerspruch, sondern der eigentliche Befund — der neue Block **„Bedeutung trägt, Wortlaut fehlt"** zeigt Anfragen, für die semantisch eine Stelle existiert, deren Begriffe aber nirgends wörtlich stehen. Das war der Fall `cluburlaub spanien festland`: Position 2,6, das Wort „Festland" kommt auf der Seite nicht vor.

### Die Schwelle kommt jetzt aus der Wirklichkeit

Bislang war der Grenzwert für „kein Anker" geschätzt: 45 % des Medians. Liegen mindestens zwei Search-Console-Anfragen mit Position 1 bis 5 vor, wird er stattdessen **abgeleitet** — der schwächste gemessene Wert einer nachweislich funktionierenden Anfrage bildet die Untergrenze, minus 10 % Sicherheitsabstand. Das Tool weist aus, welche der beiden Herkünfte gilt.

Damit ist die offene Frage aus der Kalibrierung beantwortet, ohne an Zahlen zu drehen: Statt eine Konstante zu raten, wird gemessen, was bei diesem Text nachweislich reicht.

---

## Zerlegung: Token und Überlappung

Zerlegt wird in **geschätzten Token**, nicht in Zeichen — echte Pipelines rechnen in Token, und die Grenzen der Embedding-Modelle sind Token-Grenzen. Die Umrechnung ist eine Schätzung pro Zielsystem (deutscher Text braucht mehr Token als englischer); ein echter Tokenizer wäre ein Megabyte Download.

**Überlappung** nimmt das Ende eines Abschnitts in den nächsten mit, damit ein Gedanke nicht an der Schnittkante zerreißt. Voreinstellung 15 %, wie in den meisten Pipelines. Der Seed wird aus **Sätzen** gebildet, nicht aus ganzen Absätzen — sonst sprengt ein einzelner Absatz das Budget um ein Vielfaches. Ist ein einzelner Satz zu lang, wird er an einer Wortgrenze gekürzt.

Das hat eine Nebenwirkung, die mitgelöst werden musste: Überlappende Abschnitte teilen sich per Definition Text. Ohne Gegenmaßnahme meldet die Dublettenerkennung jedes Nachbarpaar. Jeder Abschnitt behält deshalb einen **Kern** ohne die geerbte Überlappung, und Dubletten werden nur auf den Kernen gemessen. An der ROBINSON-Seite gemessen: über den Volltext werden zwei Paare gemeldet, über die Kerne nur eines — das zweite war reines Artefakt der Überlappung.

---

## Markensprache

Manche Wörter fehlen absichtlich. ROBINSON betreibt Clubs, keine Hotels — „Hotel" gehört dort nicht auf die Seite, auch wenn Nutzer danach suchen. Ohne diese Information hätte das Tool empfohlen, den Begriff aufzunehmen, und damit gegen die Marke gearbeitet.

Trag solche Begriffe kommagetrennt in das Feld **Markensprache** ein. Drei Dinge passieren dann:

- Fehlende Begriffe werden getrennt ausgewiesen: „fehlt" gegenüber „bewusst nicht verwendet".
- Die Vorschlagsspalte bekommt das Verbot als Anweisung mit und formuliert mit der eigenen Bezeichnung.
- Jeder Vorschlag wird danach gegen die Liste geprüft. Kommt ein verbotener Begriff trotzdem vor, steht eine Warnung darunter — auf die Selbstbindung des Modells allein wird nicht vertraut.

Komposita werden mitgefangen: `clubhotel` und `hotelanlage` gelten als „Hotel", `clubanlage` bleibt frei.

Ein Nebenbefund aus der Praxis: Die ROBINSON-Spanienseite steht für `club hotels spanien` auf Position 4,3, obwohl das Wort nirgends vorkommt. Der Verzicht kostet dort nichts — Google schlägt die Brücke selbst. Wenn du den Begriff trotzdem bedienen willst, gehört er in eine Frage, die den Unterschied erklärt, nicht in die Selbstbeschreibung.

---

## Unterscheiden sich Gemini, ChatGPT und Claude beim Chunking?

Beim Chunking selbst: nein. Das Zerlegen erledigt deine Pipeline, nicht das Sprachmodell. Unterschiedlich ist das **Embedding-Modell**, das die Abschnitte in Vektoren übersetzt — und dessen Grenzen wirken direkt auf die Chunk-Größe zurück.

Stand August 2026, aus den Herstellerdokumentationen:

| | Modell | Max. Token je Abschnitt | Vektorlänge | Frage vs. Absatz |
|---|---|---|---|---|
| **Google** | `gemini-embedding-001` | **2.048** | 3072, kürzbar auf 1536/768 | getrennt über `task_type` |
| **OpenAI** | `text-embedding-3-small/-large` | 8.191 | 1536 / 3072, kürzbar | kein getrennter Modus |
| **Anthropic** | *kein eigenes Modell*, empfiehlt Voyage | — | — | — |
| **Voyage** | `voyage-4` | 32.000 | 1024, 256–2048 wählbar | getrennt über `input_type` |
| **Voyage kontextualisiert** | `voyage-context-4` | 120.000 | 1024, kürzbar | getrennt über `input_type` |

Die vier Punkte, die praktisch zählen:

**Googles 2.048-Token-Grenze ist die engste — und sie schneidet still ab.** `autoTruncate` steht standardmäßig auf `true`: Ein zu langer Abschnitt wird ohne Fehlermeldung gekürzt. Bei OpenAI liegt die Grenze viermal höher, bei Voyage sechzehnmal. Wer für Google baut, muss feiner zerlegen — und merkt sonst nichts davon.

**Kontextualisierte Chunk-Embeddings ändern die Spielregeln.** `voyage-context-4` sieht beim Kodieren das ganze Dokument und legt den Zusammenhang in jeden Abschnittsvektor. Damit verliert die wichtigste Regel klassischer RAG-Pipelines — jeder Absatz muss allein verständlich sein — einen Großteil ihres Gewichts. Vectorizer bildet das ab: In diesem Modus zählt „Steht für sich" nur noch 15 % statt 45 %.

**Asymmetrie.** Google und Voyage kodieren Fragen und Dokumente in getrennten Modi, OpenAI nicht. Ohne Trennung hilft es messbar, wenn ein Absatz die Frage sprachlich bereits aufgreift — eine Zwischenüberschrift als Frage zu formulieren, ist bei OpenAI also wirksamer als bei Google.

**Vektorräume sind nicht kompatibel.** Ein Wechsel des Embedding-Modells bedeutet immer, den gesamten Bestand neu einzulesen. Das gilt selbst innerhalb eines Anbieters: Google weist ausdrücklich darauf hin, dass `gemini-embedding-001` und `gemini-embedding-2` unterschiedliche Räume aufspannen.

### Und was ist mit ChatGPT-Suche, Gemini in Google und Claude mit Websuche?

Das ist ein anderer Mechanismus und wird oft damit verwechselt. Diese Assistenten bauen aus deiner Seite keine dauerhafte Vektordatenbank — sie rufen Seiten ab und lesen sie. Für Auffindbarkeit dort zählt eher, ob eine Passage eine Frage klar und belegbar beantwortet, als die genaue Chunk-Länge. Die Bewertungen von Vectorizer (steht für sich, sagt etwas aus, nennt Namen) helfen in beiden Welten; die Token-Grenzen betreffen nur den Fall, dass du selbst eine Vektordatenbank befüllst.

---

## Bedienung

Zwei Angaben genügen: Thema und Text. Alles Optionale — Suchanfragen, Wettbewerber, Messung, Zerlegung, Markensprache — liegt in aufklappbaren Gruppen darunter. Jeder Gruppenkopf zeigt seinen Zustand an („6 Anfragen geladen", „2 Texte", „Embeddings · 3× messen"), sodass auf einen Blick sichtbar ist, was in den Lauf eingeht.

**Beispiel laden** füllt Thema, Text und Suchanfragen mit einem Demodatensatz — zum Ausprobieren, bevor eigener Text da ist.

**Eingaben überleben das Neuladen.** Text, Thema, Einstellungen und Suchanfragen werden im Tab gesichert und wiederhergestellt. Die beiden Schlüssel ausdrücklich nicht — die bleiben flüchtig. Mit dem Schließen des Tabs ist der Entwurf weg.

Während der Prüfung zeigt ein Fortschrittsbalken, wo der Lauf steht. Die Ergebnisse beginnen mit einer Sprungnavigation zu allen Blöcken, der Überblick steht an erster Stelle; am Ende führt „Zu den Eingaben" zurück nach oben. In der Fußzeile steht die Fassung, damit sich nach einem Update in einer Sekunde prüfen lässt, welcher Stand läuft.

---

## Wie belastbar sind die Zahlen?

Die Bewertungen kommen von einem Sprachmodell und schwanken zwischen Durchläufen. Solange diese Schwankung ungemessen ist, weiß niemand, ob eine Veränderung im Verlauf etwas bedeutet.

Der Schalter **„Genauer messen"** bewertet jeden Abschnitt dreimal und nimmt den Median. Daraus leitet das Tool zwei Dinge ab:

**Die Unsicherheit der Gesamtnote.** Die Gesamtnote ist ein Mittelwert über alle Abschnitte — sind die Abweichungen der Einzelbewertungen unabhängig voneinander, mitteln sie sich weitgehend heraus, und die Gesamtnote ist deutlich präziser als jede Einzelbewertung. Das Tool weist beides aus: die Unsicherheit unter dieser Annahme und die Obergrenze, falls die Abweichungen gleichgerichtet wären. Ob die Annahme stimmt, klärt ein zweiter Lauf desselben unveränderten Textes — weichen die Gesamtnoten um weniger als die ausgewiesene Schwelle ab, passt sie. Der Verlauf merkt sich die Schwelle und warnt beim nächsten Lauf, wenn eine Veränderung darunter liegt: Das kann Rauschen sein.

**Uneindeutig bewertete Abschnitte.** Geht die Bewertung eines Abschnitts über die drei Durchläufe um einen Punkt oder mehr auseinander, ist das kein Messfehler, sondern ein Befund: Die Stelle selbst ist uneindeutig, meist auf der Kippe zwischen Aussage und Floskel — auch zwei Menschen würden dort verschieden urteilen. Das Tool listet diese Abschnitte namentlich. Das ist eine Redaktionsaufgabe, die sonst niemand findet.

Kostet dreimal so viel für die Abschnittsbewertung, aber die läuft auf dem kleinen Modell. Für einen einmaligen Check überflüssig, für alles, was in den Verlauf soll, unverzichtbar.

## Warum eine Frage keine Antwort findet

„Kein Anker" hat vier verschiedene Ursachen, und die Maßnahme ist jeweils eine andere. Das Tool unterscheidet sie anhand der Wertverteilung über alle Abschnitte:

| Befund | Erkennungsmerkmal | Maßnahme |
|---|---|---|
| **Thema kommt nicht vor** | kein Abschnitt reagiert, Anfragebegriffe fehlen im Text | Neuen Absatz schreiben |
| **Thema ist verstreut** | alle Abschnitte reagieren ähnlich schwach, keiner ragt heraus | Zusammenziehen, sodass eine Stelle die Frage vollständig beantwortet |
| **Ein Absatz behandelt es, ist aber zu schwach** | ein Abschnitt ragt heraus, hat aber Note unter 5 | Dort konkret werden: Zahlen, Namen, Bedingungen |
| **Knapp unter der Schwelle** | ein Abschnitt ragt heraus und ist solide | Meist genügt es, die Frage wörtlich aufzugreifen |

## Nicht jede Anfrage wiegt gleich

Die Noten zählen jeden Abschnitt gleich. Das verzerrt die Prioritäten: Zwei unbeantwortete Nischenfragen sind kein Drama, eine unbeantwortete Hauptanfrage schon.

Liegen Search-Console-Daten vor, weist der Überblick deshalb zusätzlich die **abgedeckte Nachfrage** aus — den Anteil der Impressionen, die auf Anfragen mit Antwort entfallen — und nennt den größten offenen Posten. Die Liste der unbeantworteten Fragen ist nach Impressionen sortiert, ebenso die Chancen.

---

## Welche Schlüssel brauche ich?

Auf einer eigenen Adresse werden bis zu **zwei verschiedene Schlüssel** von **zwei verschiedenen Anbietern** gebraucht. Sie sind nicht austauschbar.

| Feld | Anbieter | Wofür | Pflicht? |
|---|---|---|---|
| **Anthropic-Schlüssel** | console.anthropic.com, beginnt mit `sk-ant-` | Die eigentliche Analyse: Abschnitte bewerten, Fragen ableiten, Zitatstellen finden, Vorschläge formulieren | **ja** |
| **Embeddings** | aistudio.google.com (`AIza…`) oder platform.openai.com (`sk-…`) | Nur die Ähnlichkeitsmessung. Ohne diesen Schlüssel vergleicht das Tool Wörter statt Bedeutung | nein |

Der Anthropic-Schlüssel trägt die Arbeit — ohne ihn läuft gar nichts. Der Embedding-Schlüssel macht die Messung besser; lässt du ihn weg, läuft alles durch, nur eben mit Wortabgleich.

Das Feld für den Anthropic-Schlüssel erscheint automatisch, sobald die App auf einer eigenen Adresse läuft. Im Claude-Artifact bleibt es ausgeblendet, weil dort kein Schlüssel nötig ist.

**Beide Schlüssel bleiben nur im geöffneten Tab.** Sie werden nicht gespeichert, nicht in den Verlauf geschrieben und nicht an Dritte weitergegeben — jeder geht direkt an seinen Anbieter. Nach dem Neuladen sind sie weg und müssen erneut eingegeben werden. Das ist bewusst so: Was in `localStorage` liegt, liest jedes eingeschleuste Skript mit.

### Was ein Durchlauf kostet

Gemessen an einer echten Seite mit 11 Abschnitten und 16 Anfragen, nach den Verbrauchsangaben der API:

| | Aufrufe | Kosten |
|---|---|---|
| ursprünglich, alles mit Sonnet | 25 | $0,107 |
| jetzt | 17 | **$0,045** |

Für eine große Landingpage mit 30 Abschnitten skaliert das etwa auf das Zweieinhalbfache, also rund 11 Cent statt vorher 25. Die Embeddings kosten zusätzlich Bruchteile eines Cents.

Vier Maßnahmen bringen die Ersparnis:

- **Zwei Modelle statt einem.** Die Abschnittsbewertung folgt einem festen Schema und läuft mit Haiku 4.5 zu einem Drittel des Preises. Formuliert wird weiter mit Sonnet 4.6. Ist Haiku nicht verfügbar, schaltet das Tool nach dem ersten Fehlschlag stillschweigend zurück.
- **Zitatstellen nach Abschnitt gebündelt** und auf die zehn aussagekräftigsten Anfragen begrenzt — echte Suchanfragen mit Potenzial und unbeantwortete Fragen zuerst.
- **Fragen aus den Kernaussagen** statt aus 7.000 Zeichen Volltext. Die Zusammenfassungen liegen zu dem Zeitpunkt bereits vor.
- **Doc2Query-Felder nur ohne Embeddings.** Mit echtem Embedding-Modell entfallen die Felder `terme` und `fragen` sowie der ganze Aufruf zur Begriffserweiterung — sie schließen eine Lücke, die dann nicht existiert. Ausgabe kostet das Fünffache von Eingabe, deshalb wiegt das schwerer, als die Tokenzahl vermuten lässt.

Nach jedem Durchlauf zeigt das Tool den tatsächlichen Verbrauch: Aufrufe, Tokens, Kosten in Dollar und Euro, aufgeschlüsselt nach Modell. Der Verlauf hält die Kosten je Lauf fest.

Nicht nutzbar: **Prompt-Caching** braucht einen zwischenspeicherbaren Präfix von mindestens 1.024 Tokens, der Anweisungsblock hat nur rund 350. Die **Batch-API** mit 50 % Rabatt arbeitet asynchron und passt nicht zu einem interaktiven Werkzeug.

Setz in beiden Konten ein Monatslimit.

---

## Als PWA veröffentlichen

Das Repository enthält alles Nötige:

```
index.html                 die App
manifest.webmanifest       Name, Farben, Icons
sw.js                      Service Worker
icon-192.png               Startbildschirm
icon-512.png               Startbildschirm, groß
icon-maskable-512.png      für Systeme, die Icons beschneiden
favicon.png                Browsertab
README.md
```

**Veröffentlichen:**

1. Alle Dateien in ein neues Repository laden — flach im Wurzelverzeichnis, nicht in einem Unterordner.
2. **Settings → Pages → Source: Deploy from a branch**, Branch `main`, Ordner `/ (root)`.
3. Nach ein bis zwei Minuten liegt die App unter `https://DEIN-NAME.github.io/REPO-NAME/`.
4. Im Browser aufrufen. Chrome und Edge bieten „Installieren" in der Adressleiste an, auf iOS geht es über Teilen → „Zum Home-Bildschirm".

Alle Pfade sind relativ, die App funktioniert deshalb in jedem Unterverzeichnis. HTTPS liefert GitHub Pages mit — ohne HTTPS registriert sich kein Service Worker.

### Was offline geht und was nicht

Nur die Hülle. Der Service Worker cacht ausschließlich die App-Dateien und rührt **keine** Anfrage an einen Modellanbieter an: `POST` wird durchgelassen, fremde Herkünfte werden durchgelassen, Anthropic, Google und OpenAI sind zusätzlich ausdrücklich ausgenommen. Eine zwischengespeicherte Modellantwort wäre schlimmer als gar keine.

Offline nutzbar: die App öffnen, Text vorbereiten, gespeicherte Läufe ansehen. Jede Analyse braucht Netz.

### Verlauf

Der eigentliche Grund für die PWA. Nach jedem Lauf wird ein Eintrag abgelegt, und beim nächsten Lauf zum selben Thema erscheint im Überblick die Veränderung: „+1,3 Punkte besser als der Lauf vom 12. Juli". Damit lässt sich eine Überarbeitung messen, statt sie zu behaupten.

**Gespeichert werden nur Kennzahlen** — Datum, Thema, Noten, Anzahl Abschnitte, offene Anfragen, Messart. Nie die Texte selbst. Das hält den Speicher klein und die Inhalte deiner Kunden aus dem Browserspeicher heraus. Im Test bestätigt: kein Textfragment landet im Speicher.

Vergleichbar sind Läufe nur bei gleicher Zerlegung und gleicher Messart — Wortabgleich und Embeddings ergeben verschiedene Skalen. Die Messart steht deshalb an jedem Eintrag.

**Safari auf iOS löscht Browserspeicher nach etwa sieben Tagen ohne Nutzung.** Für Vergleiche über Monate den Knopf „Verlauf sichern" nutzen, der eine JSON-Datei herunterlädt.

Im Claude-Artifact gibt es keinen dauerhaften Speicher und keinen Service Worker. Die Analyse läuft dort vollständig, der Verlauf entfällt — die App sagt das an der Stelle, an der er stünde.

---

## Drei Betriebsarten

**1. In Claude im Browser — ohne Einrichtung.** Datei als Artifact öffnen, Text einfügen, prüfen. Kein Schlüssel, keine API-Kosten. Die Aufrufe laufen über Anthropics eigenen Zugang und zählen auf dein normales Chat-Kontingent. Das Schlüsselfeld bleibt ausgeblendet, weil es hier nichts zu tun hat.

**2. Auf einer eigenen Adresse (GitHub Pages, Netlify, lokal).** Dort gibt es diesen Zugang nicht. Beim ersten Versuch blendet das Tool das Schlüsselfeld selbst ein und sagt, was fehlt. Jeder Besucher nutzt seinen eigenen Schlüssel.

**3. Mit eigenem Proxy.** Nur, wenn du bewusst willst, dass alles über dein Budget läuft. Siehe unten.

Ein Hinweis zu Variante 1: Jeder Abschnitt ist eine eigene Anfrage. Bei sehr langen Texten summiert sich das und kann an das Nachrichtenlimit stoßen. Dann entweder größere Abschnitte wählen oder den Text in zwei Durchläufen prüfen.

---

## Kostet mich das Geld, wenn andere das Tool benutzen?

**Nein — in der Standardkonfiguration nicht.** Das ist bewusst so gebaut.

Auf GitHub Pages gibt es keinen Server, der etwas geheim halten könnte. Alles, was ausgeliefert wird, kann jeder Besucher im Quelltext lesen. Deshalb enthält der Code **keinen** Schlüssel: Jeder Besucher trägt seinen eigenen API-Key in das Feld links ein, der Browser schickt ihn direkt an Anthropic, und Anthropic rechnet gegen **dessen** Konto ab. Dein Konto ist nicht beteiligt.

Der Schlüssel wird nirgends gespeichert — weder auf einem Server noch im Browser-Speicher. Er lebt nur in dem geöffneten Tab und ist nach dem Neuladen weg.

### Was du auf keinen Fall tun darfst

```js
var API_KEY = "sk-ant-api03-...";   // NIEMALS
```

Ein Schlüssel im Frontend-Code ist öffentlich, sobald die Seite online ist. Zwei Rechtsklicks genügen. Bots scannen GitHub-Repositories systematisch nach genau diesem Muster, oft innerhalb von Minuten nach dem Push. Das gilt auch für private Repos, deren Pages-Seite öffentlich ist, und für `.env`-Dateien, die versehentlich mitcommittet werden.

Falls das doch mal passiert: Schlüssel sofort in der Anthropic Console widerrufen. Aus der Git-Historie zu löschen reicht nicht, weil Forks und Caches bestehen bleiben.

### Wenn du bewusst willst, dass alle über dein Budget laufen

Das geht nur mit einem eigenen kleinen Server, der den Schlüssel hält. Dann gilt aber: **Ja, dann zahlst du für jeden Besucher** — und ohne Schutz auch für jeden, der deine Proxy-URL findet und automatisiert anfragt.

Minimalversion als Cloudflare Worker (kostenloses Kontingent reicht für den Anfang):

```js
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const erlaubt = "https://DEIN-NAME.github.io";

    const cors = {
      "Access-Control-Allow-Origin": erlaubt,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (origin !== erlaubt) return new Response("Nein", { status: 403 });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,   // als Secret hinterlegt, nicht im Code
        "anthropic-version": "2023-06-01"
      },
      body: await request.text()
    });
    return new Response(res.body, { status: res.status, headers: { ...cors, "Content-Type": "application/json" } });
  }
};
```

Dann in `index.html` oben `PROXY_URL` auf die Worker-URL setzen und das Key-Feld ausblenden.

Wichtig: Die Origin-Prüfung ist eine Bequemlichkeitsbremse, keine Sicherung — ein Header lässt sich fälschen. Wer das ernsthaft öffentlich betreibt, braucht zusätzlich ein Rate-Limit pro IP, ein Ausgabenlimit in der Anthropic Console und idealerweise einen Login. Setz in jedem Fall in der Console ein hartes Monatslimit auf den verwendeten Schlüssel.

---

## Auf GitHub Pages veröffentlichen

1. Neues Repository anlegen, `index.html` und diese `README.md` hochladen.
2. **Settings → Pages → Source: Deploy from a branch**, Branch `main`, Ordner `/ (root)`.
3. Nach ein bis zwei Minuten liegt die Seite unter `https://DEIN-NAME.github.io/REPO-NAME/`.

Es funktioniert genauso von jedem anderen Static-Host (Netlify, Vercel, Cloudflare Pages) oder lokal per Doppelklick auf die Datei.

Der Aufruf aus dem Browser braucht den Header `anthropic-dangerous-direct-browser-access: true` — den setzt das Tool bereits. Ohne ihn blockiert die API Anfragen direkt aus dem Browser.

---

## API-Schlüssel bekommen

Unter console.anthropic.com anmelden, unter *API Keys* einen Schlüssel erstellen, Guthaben aufladen. Ein Durchlauf mit 15 Abschnitten kostet grob 5 bis 15 Cent — das Tool macht pro Abschnitt eine kleine Anfrage plus drei bis sechs übergreifende.

---

## Was das Tool ausgibt

**Überblick** — vier Noten von 0 bis 10. *Auffindbarkeit* fasst zusammen; *Steht für sich* fragt, ob ein Absatz allein verständlich ist; *Sagt etwas aus* misst Fakten gegen Floskeln; *Nennt Namen* prüft, ob Zahlen und Begriffe wirklich dastehen.

**Abschnitt für Abschnitt** — jeder Absatz mit Note und konkreten Umformulierungsvorschlägen. Zeile anklicken.

**Welche Frage findet welchen Abschnitt** — die Matrix. Zeilen sind Fragen, Spalten deine Absätze, kräftiges Blau heißt gute Passung. Daraus folgen drei Befunde: Fragen ohne Antwort, Absätze die sich gegenseitig verdrängen, Absätze die keine Frage erreicht.

**Was eine KI zitieren würde** — eine Tabelle mit drei Spalten: die Frage, die wörtliche Stelle aus deinem Text, die als Antwort ausgegeben würde, und ein fertig formulierter Vorschlag zum Übernehmen. Jedes Zitat wird gegen den Originaltext geprüft; weicht es ab, steht es dabei. Vorschläge enthalten [Platzhalter] statt erfundener Zahlen.

**Wer beantwortet welche Anfrage besser** — dieselben Anfragen gegen jeden Text einzeln gemessen, Anfrage für Anfrage. Zwei Entscheidungen machen das erst belastbar: Alle Texte liegen in **einem gemeinsamen Vektorraum** (getrennte Korpora haben unterschiedliche IDF, ihre Werte wären nicht vergleichbar), und alle laufen **ohne Doc2Query-Anreicherung** — der eigene Text wäre sonst angereichert, die fremden nicht, und der Vergleich ginge zu unseren Gunsten aus. Symmetrisch schlecht ist fair.

Für die schwersten Lücken fasst das Tool in eigenen Worten zusammen, was der Wettbewerber dort abdeckt, und nennt eine Maßnahme. Fremde Formulierungen werden nicht übernommen.

Achte auf ähnliche Textlängen: Wer dreimal so viel Text hat, hat dreimal so viele Gelegenheiten für einen Treffer. Das Tool warnt, wenn die Abschnittszahlen um Faktor zwei auseinanderliegen.

**Was Leute fragen** — typische Fragen zum Thema mit Status beantwortet / angerissen / offen.

**Was Wettbewerber haben und du nicht** — Themenvergleich, plus die Themen, die nur du hast.

---

## Wie es intern arbeitet

Die Bewertung übernimmt Claude, ein Aufruf pro Abschnitt. Die Ähnlichkeitsmessung läuft vollständig im Browser: TF-IDF-Vektoren mit Kosinus-Ähnlichkeit über einen leichten deutschen Stemmer.

Das sind **keine echten Embeddings** — die kommen nicht ohne zusätzlichen Endpunkt und Modell-Download aus. Um die Synonymlücke eines rein lexikalischen Verfahrens zu überbrücken, ergänzt das Modell zu jedem Abschnitt die Begriffe, unter denen jemand ihn suchen würde, und expandiert die Testfragen genauso. Beide Seiten treffen sich dadurch im selben Vokabular (Doc2Query).

Zwei getrennte Vektorräume, mit Absicht: Fragen-Matching läuft mit IDF-Gewichtung, die Dublettenerkennung ohne. IDF gewichtet gerade die geteilten Begriffe ab und macht damit echte Paraphrasen unsichtbar — im Test kamen zwei klare Paraphrasen mit IDF auf 15 %, ohne auf 44 %.

Schwellen sind relativ, nicht absolut: Eine Frage gilt als unbeantwortet, wenn ihr bester Treffer unter 45 % des Medians aller Bestwerte liegt. Absolute Kosinuswerte sind zwischen Texten nicht vergleichbar.

**Grenzen:** maximal 30 Abschnitte pro Durchlauf. Wettbewerbertexte müssen eingefügt werden, weil der Browser fremde Seiten nicht laden darf. Bei sehr kurzen Texten oder wenigen Fragen sind die relativen Schwellen instabil.
