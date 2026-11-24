# Manueller Geräteabgleich

Der Geräteabgleich wird auf jedem Gerät in den Einstellungen gesondert aktiviert. Er verwendet lokal erstellte ZIP-Dateien; eine automatische Übertragung findet nicht statt. Änderungen bleiben im Änderungsprotokoll erhalten, auch wenn ein Paket nicht auf einem anderen Gerät importiert wird.

Mehrere Änderungspakete können gemeinsam ausgewählt und vor dem Übernehmen geprüft werden. Die Vorschau simuliert den Import in einer zurückgerollten Transaktion; beim Übernehmen werden alle Pakete erneut geprüft und gemeinsam übernommen. Enthält eine Auswahl Konflikte, müssen die Pakete einzeln bearbeitet werden. Die Auswahl ist auf 20 Dateien und insgesamt 100 MB komprimierte beziehungsweise entpackte Daten begrenzt. Vollständige Datenpakete werden einzeln geprüft und importiert. Bei Konflikten zeigt die Vorschau deren Anzahl; die Entscheidung erfolgt nach dem Anlegen des Konfliktarchivs.

Für ein neues Gerät kann ein vollständiger Datenbestand exportiert und dort importiert werden. Der Import führt Datensätze zusammen und hält bei konkurrierenden Versionen zur Konfliktauflösung an. Die bestehende JSON-Datensicherung bleibt unabhängig davon verfügbar.

Nach der ersten Aktivierung werden Änderungen über die Repository-Schreibwege auch bei ausgeschaltetem Geräteabgleich lokal protokolliert. Beim Ausschalten wird zusätzlich eine lokale Vergleichsbasis gespeichert; beim erneuten Aktivieren werden Abweichungen davon erfasst. Änderungen aus der Zeit vor der ersten vorhandenen Vergleichsbasis können nicht rückwirkend rekonstruiert werden und müssen anhand eines vollständigen Datenbestands manuell geprüft werden. Die Wiederherstellung einer Sicherung verwendet eigene Schreibwege und wird über die Vergleichsbasis erfasst.

Gespeicherte Konfliktarchive werden mit ihren Versionen, Medien und dem ursprünglichen Paket im vollständigen Datenbestand übertragen. Bei einer abweichenden bereits vorhandenen Archivkennung wird der Import angehalten. Das aktuelle vollständige ZIP-Format ist Version 2; Version 1 bleibt importierbar. Verschachtelte Archive werden bis zu acht Ebenen geprüft.

## Implementierung

- [Einstellungen und Bedienung](../src/features/settings/SettingsPage.tsx)
- [Änderungsprotokoll](../src/features/settings/changeJournal.ts), [lokale Vergleichsbasis](../src/features/settings/reconcileChanges.ts)
- [Änderungsexport](../src/features/settings/changesExport.ts), [Validierung](../src/features/settings/validateChangesExport.ts), [Import und Konfliktauflösung](../src/features/settings/importChangesExport.ts)
- [Vollständiger Export](../src/features/settings/fullExport.ts), [Validierung](../src/features/settings/validateFullExport.ts), [Import und Zusammenführung](../src/features/settings/importFullExport.ts)
- [Konfliktarchiv-Download](../src/features/settings/conflictArchive.ts)
- [Dexie-Schema](../src/data/database/schema.ts)
- [Datenbankzugriff](../src/data/database/appDatabase.ts) und bestehende Repository-Schreibpfade unter [repositories](../src/data/repositories/)
- [Seitengestaltung](../src/features/settings/settings.css), [Kopfzeile](../src/shared/components/Header.tsx), [Info-Symbol](../public/welli-icons/Info.svg), [Einstellungssymbol](../public/welli-icons/Einstellungen.svg)
- [Offline-Budgetprüfung](../scripts/verify-dist.mjs)

## Prüfung

Die vollständige Testsuite bestand zuletzt mit 279 Tests; anschließend ergänzte Tests für die Archivzusammenführung und Formatversion 1 bestanden gezielt. Der Produktionsbuild einschließlich TypeScript-Prüfung und Offline-Prüfung sowie ESLint waren erfolgreich. Die Tests simulieren getrennte Gerätebestände in IndexedDB; ein Austausch zwischen zwei physischen Geräten wurde nicht durchgeführt. Die vorhandenen Datensicherungstests bestanden ebenfalls.
