# Entwurf: nachvollziehbare Konfliktentscheidungen

Status: **in Arbeit, nicht integriert.** Die Freigabe zur Ausarbeitung und Umsetzung liegt vor; dieser Text ist keine Freigabe zur Veröffentlichung.

## Problem und Ziel

Eine Konfliktentscheidung im Journal der Version 1 enthält einen Vorher- und einen Nachherzustand, aber keinen eindeutigen Nachweis beider konkurrierender Operationen. Ein drittes Gerät kann die Entscheidung deshalb nicht sicher von einer gewöhnlichen Bearbeitung unterscheiden. Gleiche Datensatzinhalte sind kein Nachweis für gleiche Vorgeschichte. Der Import bewahrt die Sicherheit durch einen erneuten Konflikt, was die Weitergabe einer bereits getroffenen Entscheidung erschwert.

## Vorgeschlagenes Format

- Änderungspakete der Version 2 ergänzen eine ausdrückliche Entscheidungsoperation um zwei verschiedene Vorgänger-Operationskennungen und die getroffene Entscheidung. Beide Vorgänger müssen denselben Tabellennamen und dieselbe Datensatzkennung betreffen. Die Operationen selbst bleiben im kumulativen Journal erhalten; ein Verweis allein ist kein Beweis für ihren Inhalt.
- Der Validator prüft Struktur, Kennungen, Eindeutigkeit, Prüfsummen und Medien wie bisher. Zusätzlich lehnt er Selbstverweise, widersprüchliche oder fehlende Vorgänger und Zyklen ab. Die zwei Vorgänger müssen im Paket beziehungsweise im bereits geprüften lokalen Journal eindeutig vorliegen. Dass diese Regeln auch bei Paketkombinationen gelten, muss vor der Implementierung geklärt und getestet werden.
- Format 1 wird unverändert importiert. Neue Pakete ohne Entscheidungsoperation sollen weiterhin als Version 1 exportiert werden. Sobald eine Entscheidung mit zusätzlicher Kausalität enthalten ist, wird Version 2 exportiert; ältere Apps müssen diese Version klar zurückweisen, statt sie teilweise zu importieren. Format 1 und 2 dürfen nicht unter derselben Paketkennung mit unterschiedlichem Inhalt erscheinen.
- Die zusätzlichen Felder im Journal wären additiv und benötigen keinen neuen IndexedDB-Index. Bereits bestehende Einträge bleiben unverändert lesbar; sie erhalten keine nachträglich erratenen Vorgänger. Eine Versionsänderung des Dexie-Schemas ist dafür voraussichtlich nicht nötig, muss aber anhand echter Upgrade-Tests bestätigt werden.

## Sicherheitsbedingungen für die Übernahme

Ein isolierter, noch nicht im Import verwendeter Baustein in `src/features/settings/resolutionGraph.ts` prüft doppelte Kennungen, fehlende oder fremde Vorgänger, Selbstverweise und Zyklen. Die Strukturprüfung ist kein Nachweis der Historie oder der zulässigen Übernahme; sie ersetzt weder Paketvalidierung noch Transaktions- und Konflikttests.

Ein weiterer isolierter Baustein in `src/features/settings/resolutionProof.ts` prüft notwendige Bedingungen für zwei direkt auseinandergehende Versionen, darunter Datensatzidentität, bekannte Zweigspitze, aktuellen Zustand und gewählte Fassung. Die Zweigspitze muss aus überprüfter Historie ermittelt werden; der Baustein leitet sie nicht aus Wertgleichheit ab und beweist keine gemeinsame Kausalität. Der ursprüngliche Fall mit einem dritten Gerät, das nur den gemeinsamen Ausgangszustand kennt, wird damit noch nicht gelöst. Auch dieser Baustein wird vom Import nicht verwendet.

Der ebenfalls isolierte Baustein `src/features/settings/causalHeads.ts` ermittelt Zweigspitzen nur aus explizit angegebenen Vorgängern. Fehlende Vorgängerangaben werden nicht als Wurzel interpretiert; fehlende oder fremde Verweise und Zyklen werden abgelehnt. Er kann nicht nachweisen, dass die übergebene Historie vollständig ist, und ist nicht mit Export oder Import verbunden. Alte Version-1-Journale enthalten die dafür notwendige ausdrückliche Vorgeschichte nicht.

Eine Entscheidung darf nur automatisch verarbeitet werden, wenn ihre zwei Vorgänger, deren kausaler Zusammenhang, die gewählte Fassung und der aktuelle lokale Stand eindeutig überprüfbar sind. Unbekannte lokale Folgeoperationen, mehrdeutige gleiche Zustände, fehlende Historie nach einem vollständigen Snapshot oder ein bereits abweichend aufgelöster Konflikt dürfen nicht durch Wertgleichheit als erledigt gelten. In diesen Fällen bleibt der bisherige explizite Konflikt erhalten.

Alle verarbeiteten Operationen, die Entscheidung und der endgültige Datensatz müssen zusammen mit Paketmarkern und Konfliktarchiv innerhalb derselben Transaktion geschrieben oder vollständig zurückgerollt werden. Bereits bekannte Operationen müssen inhaltlich einschließlich der neuen Felder identisch sein. Wiederholte Importe dürfen keine zusätzlichen Operationen erzeugen.

## Noch vor der Implementierung zu klären

1. Wie die beiden tatsächlich aktuellen Vorgänger bestimmt werden, wenn eine Seite bereits mehrere aufeinanderfolgende Änderungen oder eine frühere Entscheidung enthält. Ein beliebiger Treffer mit gleichem Nachherzustand wäre unsicher.
2. Wie sich eine Entscheidung verhält, wenn ein drittes Gerät nur den gemeinsamen Ausgangszustand, nur einen der Vorgänger oder eine eigene unabhängige Änderung kennt. Insbesondere darf kein lokaler Zweig stillschweigend überschrieben werden.
3. Wie Löschungen, Wiederanlagen, Medien-BLOBs, identische Zustände und mehrfach aufgelöste Konflikte kausal eindeutig repräsentiert werden.
4. Wie archivierte Pakete und Backups mit alten und neuen Änderungspaketen umgehen. Bestehende Vollpaket- und Backupformate dürfen nicht unbemerkt inkompatibel werden.
5. Wie Bestandsgeräte vor dem Austausch über die Version informiert werden und wie ein Versions-1-Export bei gemischten Historien sicher verhindert wird.

Die Durchsicht der Schreibpfade zeigt, dass sowohl normale Repositoryänderungen als auch Backup-Wiederherstellung, vollständige Importe, Konfliktentscheidungen und `reconcileChanges` Operationen erzeugen. Eine verlässliche Vorgängerkette muss alle diese Pfade und direkte Journalübernahmen im Änderungsimport einbeziehen. Version-1-Operationen enthalten diese Information nicht; sie darf nicht allein aus übereinstimmenden Datensatzwerten ergänzt werden. Ein Regressionstest bestätigt den aktuellen Zustand: Ein als Version 2 gekennzeichnetes Paket wird vor Datenbankänderungen zurückgewiesen. Sobald Version 2 implementiert wird, muss dieser Test in eine Prüfung unbekannter zukünftiger Versionen und separate Version-2-Kompatibilitätstests überführt werden.

## Erforderliche Tests

- Drei und mehr getrennte Datenbanken: beide Konfliktentscheidungen, Import in unterschiedlicher Reihenfolge, mehrfacher Import und Weitergabe an weitere Geräte.
- Lokaler Ausgangszustand, je ein bekannter Vorgänger, unabhängige lokale Folgeänderung, mehrere aufeinanderfolgende Änderungen und wiederholte Konfliktlösung.
- Gleichzeitiges Löschen und Bearbeiten, Wiederanlage, Medienänderungen, identische Inhalte mit unterschiedlicher Vorgeschichte und bereits importierte Operationen.
- Fehlende, doppelte, vertauschte, fremde, zirkuläre und manipulierte Vorgänger; derselbe Operations- oder Paketschlüssel mit anderem Inhalt; unvollständige Sequenzen und Rollback bei Transaktionsfehlern.
- Unveränderte Version-1-Pakete, verständliche Ablehnung von Version 2 durch alte Validatoren und Konfliktarchive innerhalb unterstützter vollständiger Exporte.
- Migration bestehender Datenbanken und Tests mit echtem IndexedDB in mehreren Browsern, insbesondere nach Unterbrechung und erneutem Start.

Bereits ergänzt: Die bisherigen Importpfade wurden mit drei isolierten Datenbanken für beide Entscheidungen sowie einen Löschkonflikt geprüft, während das dritte Gerät eine eigene Änderung besitzt. Der erneute Konflikt erhält diese Änderung und rollt die Journalübernahme zurück; ein wiederholter Import erzeugt kein weiteres Konfliktpaket. Diese Tests sichern das bisherige konservative Verhalten ab und belegen noch keine automatische Weitergabe einer Entscheidung.

Solange diese Bedingungen nicht implementiert und geprüft sind, bleibt der erwartete Fehlschlag in `multiDeviceChanges.test.ts` erhalten und die automatische geräteübergreifende Konfliktauflösung offen.
