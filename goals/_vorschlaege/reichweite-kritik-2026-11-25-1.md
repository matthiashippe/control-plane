# Vorschlag: Kleinigkeiten an ops/breaker-comments.sh

Aus der Kritik an reichweite 05 (Tech Lead, 25.11.2026), kein Done-Punkt.

- Der Kopfkommentar sagt „so he only has to approve it“: neutral formulieren („so the Tech Lead only has to approve it“).
- Die Suche nach dem offenen Issue verlässt sich darauf, dass `GET /api/companies/<id>/issues` den Filter `status=` anwendet.
  Am 25.11.2026 liefert er im Projekt Control Plane 5 offene Issues; ohne Filter kommen genau 500 zurück, die Liste ist also
  gedeckelt. Fällt der Filter je weg, kann das offene Issue jenseits der 500 liegen und ein zweites entsteht. Vorschlag: im Test
  festhalten, dass die Anfrage `status=` trägt, und bei genau 500 Einträgen `unreadable` melden statt ein Issue anzulegen.
