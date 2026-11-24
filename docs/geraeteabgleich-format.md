# Bestehende ZIP-Formate des Geräteabgleichs

Diese Beschreibung betrifft den aktuellen Implementierungsstand und ist keine Freigabe für einen zuverlässigen Abgleich konkurrierender Änderungen. Die bekannten offenen Arbeiten stehen im [Arbeitsstand](./geraeteabgleich-arbeitsstand.md).

## Vollständiger Datenbestand

Das Manifest `manifest.json` bezeichnet das Format `welliathome-device-snapshot` und die Version 2. Es enthält Paketkennung, Gerätekennung, Erstellungszeit und SHA-256-Prüfsummen der übrigen Dateien. `data.json` enthält die persönlichen Tabellen, den Initialisierungsmarker und gegebenenfalls Konfliktarchive. Medien stehen unter `media/<index>`; archivierte Versionen und Quellpakete unter `conflicts/`. Größen von Medien werden gegen ihre Datensatzangaben geprüft. Die Prüfsummen beziehen sich auf die entpackten Bytes, nicht auf das ZIP als Ganzes.

Version 1 ohne Konfliktarchive bleibt importierbar. Eine Datenbestandskennung oder Operationshistorie ist in diesen Versionen nicht enthalten; ein vollständiges Paket allein richtet daher noch keine vollständige Synchronisationshistorie auf einem neuen Gerät ein. Konfliktarchive dürfen höchstens acht Ebenen tief verschachtelt sein.

## Änderungspaket

Das Manifest bezeichnet `welliathome-device-changes`, Version 1, mit denselben Manifestfeldern. `operations.json` enthält die Operationen mit Gerätekennung, Sequenz, Datensatzkennung und Vorher-/Nachherzustand. Binäre Medienversionen stehen unter `media/<index>-before` beziehungsweise `media/<index>-after`. Das vorhandene Journal wird kumulativ exportiert; der Export bestätigt keine Zustellung und löscht keine Operationen.

## Grenzen und Prüfung

Ein Paket darf höchstens 100 MiB komprimiert und höchstens 100 MiB entpackt sein; das Manifest ist auf 1 MiB begrenzt. Je Paket sind höchstens 10.002 ZIP-Einträge zugelassen. Für eine gemeinsame Auswahl von Änderungspaketen gelten höchstens 20 Dateien, zusammen höchstens 100 MiB komprimiert und entpackt sowie höchstens 10.002 ZIP-Einträge. Die Validatoren prüfen erlaubte Pfade, doppelte Einträge, Struktur, Datensätze, Medien und Prüfsummen. Beim Import werden außerdem Operationskennungen und geräteweise Sequenzen geprüft. Die 100-MiB-Grenze begrenzt die Eingabe, garantiert aber keinen ausreichend großen freien Arbeitsspeicher: Für ZIP-Verarbeitung, Medien und Validierung entstehen zusätzliche Kopien.

Das separate persönliche Backup verwendet das Format `welliathome-backup` als JSON und ist kein Synchronisationspaket. Beide Formate werden getrennt verarbeitet.
