# Vorschlag für strukturierte WordPress-REST-Felder

Die App liest derzeit Pflanzengruppen und Futterangaben aus dem WordPress-HTML. Ein späterer REST-Vertrag kann stabile Daten für die Synchronisierung liefern und die Abhängigkeit vom Theme-Markup reduzieren.

| Feld | REST-Typ | Inhalt |
|---|---|---|
| `plant_groups` | Taxonomie-Term-IDs | Mehrfachzuordnung zu Krautige Pflanzen, Süßgräser, Bäume & Sträucher sowie Gemüse, Salat & Obst |
| `meta.scientific_name` | String | Wissenschaftlicher Name als Klartext |
| `meta.food_parts` | Array aus Strings | Redaktionell gepflegte Futterteile, etwa Blätter und Blüten |
| `meta.warning_notes` | Array aus Strings | Einzelne Warnhinweise und Verwechslungsrisiken |

Registriere die Taxonomie für den vorgesehenen Pflanzen-Inhaltstyp mit `show_in_rest` und einem stabilen `rest_base`. Registriere die Metadaten für denselben Typ mit `register_post_meta`, einem eindeutigen Standardwert und einem REST-Schema für beide Arrays. Die veröffentlichten Inhalte sind öffentlich lesbar. Schreibzugriffe bleiben an die Bearbeitungsrechte des Beitrags gebunden. [Taxonomien](https://developer.wordpress.org/reference/functions/register_taxonomy/) · [REST-Metadaten](https://developer.wordpress.org/reference/functions/register_meta/)

Pflege die Felder zunächst parallel in einer Testumgebung und vergleiche IDs, Gruppen und Warnhinweise mit dem aktuellen Import. Die App kann später nach vollständiger redaktioneller Prüfung auf die strukturierten Felder wechseln. Beitrags-HTML bleibt für den Artikelkörper verfügbar und wird weiterhin bereinigt.
