# Geräteabgleich: Arbeitsstand

Der Geräteabgleich ist noch nicht fertiggestellt. Er ist für den zuverlässigen Austausch zwischen Geräten mit konkurrierenden Änderungen noch nicht freigegeben.

## Änderungen in dieser Arbeit

- `src/features/settings/importChangesExport.ts`: Eine Entscheidung für die Paketversion wird zusätzlich im vorhandenen Operationsjournal festgehalten; Mehrfachimporte begrenzen die Gesamtzahl und die tatsächlich entpackte Größe der ZIP-Einträge.
- `src/features/settings/validateChangesExport.ts`: Der Validator liefert die tatsächlich gemessenen ZIP-Größen und die Anzahl der Einträge zurück.
- `src/features/settings/changesExport.test.ts`: Tests für die protokollierte Entscheidung und die gemeinsamen Importgrenzen.
- `src/features/settings/SettingsPage.tsx`: Hinweise zu persönlichen Daten und zur manuellen Ordnerauswahl.
- `src/features/settings/importFullExport.ts` und `fullExport.test.ts`: Bei aktiver oder bereits begonnener Historie wird auch die Entscheidung für die lokale Version eines Vollpaketkonflikts protokolliert und getestet.
- Dieselben Dateien: Unabhängige Futterempfehlungen mit verschiedenen IDs bleiben erhalten. Favoriten mit unterschiedlichen IDs, aber gleichem eindeutigem fachlichen Schlüssel, werden zur Entscheidung als Konflikt angezeigt.
- `src/features/backup/backupService.test.ts`: Ein simulierter Journalfehler prüft den gemeinsamen Rollback von Daten und Journal bei der Wiederherstellung.
- `src/data/database/appDatabase.ts` und `src/features/settings/changeJournal.ts`: Das Journal kann für Tests auf getrennte Datenbanken zugreifen.
- `src/features/settings/changesExport.ts`, `importChangesExport.ts` und `multiDeviceChanges.test.ts`: Ein erster Austausch von Änderungspaketen zwischen drei isolierten Datenbanken prüft unabhängige Änderungen, unterschiedliche Reihenfolge und Wiederholung. Vollpakete, Medien und die erfolgreiche Übertragung von Konfliktentscheidungen sind noch nicht abgedeckt.
- Der Konflikttest prüft Archivierung und Export einer Entscheidung. Ein zusätzlicher Versuch, diese Entscheidung auf Gerät C anzuwenden, meldete dort erneut einen Konflikt: Die kausale Abhängigkeit der Entscheidung von beiden Versionen fehlt weiterhin. Der Versuch ist daher kein erfolgreicher Übertragungstest.
- Der Mehrgerätetest prüft, dass ein Paket mit einer fehlenden Vorgängeroperation abgelehnt wird und bestehende Datensätze, Journal und Importstatus unverändert bleiben.

Es wurde keine Datenbankmigration und kein neues Paketformat eingeführt. Bestehende Backups bleiben unabhängig; das vorhandene Backupformat wurde nicht verändert. Das vollständige Synchronisationspaket bleibt Version 2, das Änderungspaket Version 1.

## Offene Abschlusskriterien

- Gemeinsamer Ordner mit dauerhaft gespeichertem Handle, Berechtigungen, Auflistung, verifiziertem Schreiben und sicherer Behandlung konkurrierender Zugriffe.
- Gemeinsame Datenbestandsidentität, sichere neue Geräteidentität und kontrollierte Zusammenführung unabhängiger Datenbestände.
- Vollständige Pakete mit Operationshistorie und entsprechender sicherer Migration.
- Kausale Abstammung und übertragbare Konfliktentscheidungen für beide Paketarten, einschließlich einzelner Konflikte und Medien. Ein bloßer Wertvergleich reicht nicht aus.
- Vollständige Prüfung sämtlicher Schreibpfade, Sicherheitsgrenzen und Vorschauen sowie Integrationstests mit drei unabhängigen Geräteumgebungen.
- Vollständige Format-, Speicher- und Browserdokumentation sowie Plattformtests.

Die File System Access API stellt keine allgemeine atomare Exklusiverstellung über konkurrierende Geräte bereit; die Implementierung muss diese technische Grenze ausdrücklich berücksichtigen und darf kein verlustfreies Überschreiben suggerieren.

## Plattformen

Windows/Chrome oder Edge, Android/Chrome, iOS Safari und installierte iOS-PWA wurden für diese Änderungen nicht auf den jeweiligen Plattformen getestet.
