# Ontwerp

## Apps

- `tournament-admin`: beheer van events, tournaments, arenas, stages en inschrijvingen.
- `score-keeper`: aparte live score-app voor 1 arena/match tegelijk.

## Domeinmodel

- **Event**: bevat tournaments en arenas.
- **Tournament**: bevat entries en stages.
- **Entry**: uniek per tournament.
- **Stage**: heeft optioneel een regelsysteem, tijdslot en gekoppelde arenas.
- **StageOfficial**: stage-gebonden officials/vrijwilligers.
- **Match / Exchange**: live scoring in de score-keeper-app.

## Regelsysteem

De ruleset is hiërarchisch:

1. `Stage.ruleset`
2. `Tournament.ruleset`
3. `Event.ruleset`

Als een stage een ruleset heeft, wint die dus altijd van tournament- of event-niveau. Als een tournament een ruleset heeft en de stage niet, dan wint het tournament. Event is alleen de fallback.

## Navigatievoorstel

### `tournament-admin`

- `/events` - event-overzicht met aanmaken, bewerken en verwijderen.
- `/events/:eventId` - event detail met arenas en tournaments op 1 pagina.
- `/events/:eventId/tournaments/:tournamentId` - tournament detail met entries, officials en stages.
- `/events/:eventId/tournaments/:tournamentId/stages/:stageId` - stage detail met tijdslot, ruleset, arena-koppelingen en live data.

### `score-keeper`

- Start op arena-niveau: kies event/arena of open direct met `arenaId`.
- Toon eerst een lijst met beschikbare bouts.
- Open daarna de actieve score-view voor 1 bout.
- Navigatie binnen de app blijft minimaal: `bout list -> bout view -> next bout`.
- Gebruik fullscreen/portrait als standaard voor live gebruik.

## Opmerking

De term "vrijwilligers" in het oude ontwerp past beter als "officials". Als er echt event-brede vrijwilligers nodig zijn, is daar later een aparte event-staff laag voor nodig.

# event admin
in deze admin app kan je events beheren en alle bijbehoorende


