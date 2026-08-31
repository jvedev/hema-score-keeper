# Competition app → existing backend plan

## Doel
De `competition` app loskoppelen van Google Docs en laten praten met de bestaande backend.
Dit is een **competition-first** integratie: de app werkt op een competition, niet op een event-overview.

## Huidige status
- Backend competition read-endpoints staan live.
- De competition app praat nu via een gedeeld `@hema/competition-api` package met backend/mock/sheets-adapters.
- De selector toont nu tabs voor **My competitions**, **Archive** en **Public competitions**.
- Write-flows blijven nog gefaseerd open voor de volgende stap.

## Wat nu al duidelijk is
- De competition app is een mobiele PWA met shared UI-componenten.
- De app doet nu veel client-side: selectie, bouten, score flow, publish/decline.
- De bestaande backend heeft al veel van de nodige data: tournaments, entries, matches, rounds, rulesets.
- OAuth afbouwen komt later; die wijziging koppelen we niet aan deze eerste integratiestap.

## Jouw keuzes
- Competition krijgt een **eigen backend-entiteit**.
- Ranking komt in fase 1 al uit de backend.
- In fase 1 zijn **competities inlezen**, **deelnemers zien** en **ranking zien** read-only.
- Competition-selectie komt uit de backend.
- De app opent altijd via de selector.
- De Competition-entiteit krijgt minimaal: **naam, slug, status en datum**.
- Alle UI-teksten in de app zijn **Engels**; meertaligheid kan later apart worden toegevoegd.

## Aanbevolen aanpak
### 1. Introduceer een competition service-laag in `packages/`
- Maak per domein een losse service class.
- Voorbeeld: `CompetitionService`, `RankingService`, `BoutService`, `RulesetService`.
- De app gebruikt alleen services; geen directe fetch-calls door componenten.

### 2. Maak een competition-scoped data model
- De UI mag intern “competition” zeggen.
- Onder water krijgt de backend een eigen `Competition`-entiteit.
- De app hoeft geen event-selectie te kennen als primair concept.

### 3. Voeg een read-model toe voor de competition app
- competition selector
- deelnemers + ranking
- bouts per deelnemer
- bout-details
- settings/ruleset

### 4. Verplaats write-flows naar backend
- create bout
- publish bout
- decline bout
- ranking opnieuw berekenen / opslaan

### 5. Houd Google Docs tijdelijk als referentie, niet als bron van waarheid
- De competition app kan eerst de nieuwe backend lezen.
- Docs kunnen nog als fallback of import-export blijven bestaan.
- Pas daarna haal je OAuth/Docs echt weg.

## Hoe dit mooi ingepast kan worden
### Gekozen route
Voeg een aparte `Competition`-entiteit toe in de backend.
- Dat past beter bij de competition-app.
- Het voorkomt een verkapte tournament-vertaling.
- De app kan dan echt competition-first blijven.

## Faseplan
### Fase 1: read-only integratie
- competitions selecteren uit de backend
- deelnemers en ranking laden uit de backend
- bouts en bout-details tonen
- ruleset/settings laden
- app altijd via selector openen

### Fase 2: write-flow
- new bout
- score/publish/decline
- ranking opnieuw berekenen en opslaan

### Fase 3: scheiden van concerns
- rankinglogica naar apart package
- backend service classes herbruikbaar maken
- Docs/OAuth pas hier vervangen

## Suggesties
- Maak de competition app niet afhankelijk van event-UI.
- Deel alleen echte herbruikbare logica met score-keeper.
- Houd ranking-berekening los van de sheet/backend-adapter.
- Gebruik `competitionId` in de UI; verberg het backend-concept zo veel mogelijk.
- Maak de backend-client service-based, zodat later meerdere apps dezelfde domeinservices kunnen hergebruiken.
- Houd de eerste versie van de ranking simpel: backend als bron van waarheid, app alleen renderen.
- Laat de competition selector de entrypoint blijven; geen directe deep-link naar ranking als startscherm.

## Eerste concrete werkvolgorde
1. Competition-entiteit en selector/read-endpoints in de backend.
2. Service classes in `packages/` voor competition, ranking, bouts en ruleset.
3. Competition app laten lezen van de backend.
4. Daarna pas write-flows: new bout, publish, decline.
5. Daarna ranking package los trekken als herbruikbare npm package.

## Besluiten uit het document
- Een competition is wezenlijk anders dan een tournament: het is **1 set van wedstrijden**.
- Ranking in fase 1 toont **alles**: lijst, score, plaats en tie-break info waar relevant.
- De selector krijgt drie weergaven:
- **Mijn competities** als startup/tab.
- **Speelde competities** als archief, met filter op alleen competities waar de gebruiker aan deelnam.
- **Alle competities** als openbaar overzicht voor competities waar de gebruiker nog niet voor is ingeschreven.
