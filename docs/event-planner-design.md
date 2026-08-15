# Event planner view

## Doel

`event-planner-view` is een beeldvullend web component op event-niveau. De
eerste versie maakt één dagplanning voor alle arenas en toernooifases zichtbaar en
bewerkbaar. Een fase kan op een of meer arenas en tijdvensters worden
ingepland. De planner is de bron voor arena-, vrijwilliger- en
deelnemerbeschikbaarheid.

De view heeft twee selecteerbare linkerpanelen:

1. **Toernooifases**: fases die op de tijdlijn kunnen worden geplaatst.
2. **Vrijwilligers**: beschikbare personen die aan een ingeplande arena en
   fase kunnen worden toegewezen.

## Schermindeling

```text
+--------------------+----------------------------------------------------------+
| Event Planner      | datum | zoom - / + | terug | vooruit | instellingen     |
+--------------------+----------------------------------------------------------+
| Toernooifases [Vrijwilligers] | tijdslots: Instructie | Gearcheck | Pool ... |
|                                +------------------------------------------------+
| [blauw] Longsword  | Arena 1 | [Pool] [Pool]       [Eliminatie]             |
|   Pool              +---------+------------------------------------------------+
|   Eliminatie         | Arena 2 |        [Pool] [Pool] [Pauze]                |
|   Halve finale       +---------+------------------------------------------------+
|   Finale             | Arena 3 | [Pool] [Pool]                  [Finale]     |
| [groen] Rapier      +---------+------------------------------------------------+
|   Pool               | ...                                                    |
+----------------------+---------------------------------------------------------+
```

- De kop blijft zichtbaar tijdens horizontaal en verticaal scrollen.
- Elke kolom is één eventbreed tijdslot met een zichtbare begin- en eindtijd,
  label en optionele kleur. De kolombreedte is evenredig aan de duur.
- Een fasebalk vult precies één tijdslot op één arena. Bij slepen naar een
  arena/kolom krijgt de fase direct dat tijdslot; er is geen fasepopup nodig.
- Elke arena is een rij. Een fase die op meerdere arenas draait heeft een
  afzonderlijke balk per arena, met hetzelfde fase- en toernooikleuraccent.
- Het linker tabblad **Toernooifases** toont fasen gegroepeerd per toernooi.
  Elke groep en balk gebruikt de persistente kleur van het toernooi.
- Een eigen tabblad **Vrijwilligers** vervangt de fasedeselectie zonder de
  tijdlijn te verlaten.

## Planningsobjecten

Een `Stage` beschrijft het toernooi-onderdeel (bijvoorbeeld de Poolfase), maar
is onvoldoende om meerdere arenas en tijden te plannen. De planner introduceert
daarom de volgende concepten:

| Object | Betekenis |
|---|---|
| `EventSchedule` | Planning voor één event en kalenderdag, met de begintijd van het eerste slot. |
| `ScheduleTimeSlot` | Eén opeenvolgend eventbreed tijdslot met duur in minuten, label, optionele kleur en volgorde. Het begin en einde worden uit de voorgaande slots berekend. |
| `ScheduledPhase` | Een concrete plaatsing van één `Stage` op één arena en één `ScheduleTimeSlot`. Een stage kan meerdere plaatsingen hebben. |
| `ScheduledAssignment` | Vrijwilligerstoewijzing voor één `ScheduledPhase` en rol `JUDGE`, `JURY` of `TABLE`. |
| `EventVolunteer` | Beschikbaarheid van een gebruiker als vrijwilliger binnen het event, optioneel beperkt tot één toernooi. Zonder beperking is de vrijwilliger eventbreed beschikbaar. |
| `Pool` | Een poule binnen een poolfase. Bij elke nieuwe poolfaseplaatsing maakt de server een aparte pool voor die arena en dat tijdvenster. |

`ScheduledPhase` is bewust niet hetzelfde als `StageArena`: de laatste geeft
alleen aan dat een fase een arena mag gebruiken; de eerste legt vast *wanneer*
dat gebeurt via zijn `ScheduleTimeSlot`. Bestaande `StageArena`-koppelingen worden in de planner vervangen
door of gemigreerd naar concrete `ScheduledPhase`-records. Voor een pool moet ook de toewijzing van entries aan
die specifieke pool worden opgeslagen, zodat beschikbaarheid op concrete
pooltijden kan worden berekend.

## Tijdslots opbouwen en bewerken

De planner start met een invoerveld voor de **starttijd van het event** en een
actie **Tijdslot toevoegen**:

1. De organisator vult bijvoorbeeld `09:00` als starttijd en `60` minuten in.
2. Met **Tijdslot toevoegen** ontstaat het eerste slot van `09:00` tot `10:00`.
3. Bij nogmaals toevoegen met `60` ontstaat direct aansluitend het tweede slot
   van `10:00` tot `11:00`.
4. Elk slot krijgt een vrij label, zoals `Instructie`, `Gearcheck`, `Pool`,
   `Halve finale` of `Pauze`, en optioneel een kleur.

Slots vormen altijd één aansluitende tijdlijn zonder gaten of overlappingen.
De gebruiker kan achteraf de starttijd van het event, de duur, het label en de
kleur van ieder slot wijzigen, een slot invoegen of verwijderen. Een wijziging
in een duur herberekent de begin- en eindtijd van alle volgende slots en
verplaatst de eraan gekoppelde fases automatisch mee.

Een slot met het labeltype **Pauze** is een eventbrede pauze: er kunnen geen
fases of vrijwilligerstoewijzingen in worden geplaatst. Andere labels zijn
informatief en beperken niet welke fase in het slot mag worden ingepland.

## Fases plannen

1. De gebruiker sleept een fase vanuit het linker paneel naar een arena en
   tijdslot.
2. De server maakt direct een `ScheduledPhase` met de doelarena en het gekozen
   slot. Fase, begin- en eindtijd worden dus niet opnieuw in een popup gevraagd.
3. De geplaatste balk kan naar een andere arenarij of tijdslot worden
   versleept. De duur volgt altijd de duur van het gekozen slot.
4. Voor elke wijziging valideert de server arena-overlap, pauzes en
   deelnemer-/vrijwilligersconflicten. Ongeldige plaatsingen worden niet
   opgeslagen en tonen de conflicterende personen en tijdvakken.

Meerdere geselecteerde fases kunnen in één handeling naar hetzelfde tijdslot
op verschillende arenas worden gesleept. De planner maakt dan per
fase-arena-combinatie een afzonderlijke `ScheduledPhase`.

### Poolfase

Wanneer een `POOL`-fase voor een arena en tijdslot wordt opgeslagen, maakt
de server automatisch precies één `Pool` voor die plaatsing. De pool bevat
vervolgens de wedstrijden van die arena/tijd. Het verwijderen van zo'n
plaatsing verwijdert alleen de automatisch aangemaakte, nog ongespeelde pool;
voor een pool met uitslagen is expliciete bevestiging nodig.

## Vrijwilligersmodus

Bij selectie van **Vrijwilligers** blijven de arena's en tijdschaal zichtbaar.
Voor iedere ingevulde faseplaatsing verschijnt in de arena-/fasebalk precies
één dropzone voor **Judge**, **Jury** en **Table**. Een balk is pas volledig
bezet wanneer alle drie de rollen zijn toegewezen. Er worden geen dropzones
getoond voor lege tijdvakken of pauzes.

Het linker paneel bevat:

- een filter: **alle**, **judge**, **jury**, **table** en **deelnemers**;
- een lijst met vrijwilligers, gegroepeerd of filterbaar op bereidheid voor
  judge, jury en table;
- vaardigheidsbadges: één ster per rol met het vaardigheidsniveau voor judge
  en jury;
- bereidheidsbadges voor judge, jury en table;
- de toernooikleur als achtergrond wanneer een persoon deelnemer is van exact
  één toernooi binnen het event.

De planning gebruikt de bestaande vrijwilliger-voorkeuren (`JUDGE`, `JURY`,
`TABLE`, `OTHER`) als bereidheid, niet als een garantie dat iemand verplicht
beschikbaar is.

Een vrijwilliger wordt vanuit de lijst naar een roldropzone gesleept. De server
maakt een `ScheduledAssignment` en controleert alle tijdsconflicten. Een badge
in de dropzone toont de toegewezen naam; verwijderen gebeurt via een
verwijdericoon met bevestiging.

## Beschikbaarheids- en conflictregels

Tijdvakken worden behandeld als halfopen intervallen: `[start, einde)`.
Daarmee mogen aansluitende blokken elkaar raken, maar nooit overlappen.

| Persoon | Regel |
|---|---|
| Iedere deelnemer | Mag hoogstens eenmaal in een overlappend tijdslot zijn ingepland, ongeacht arena of rol. |
| Vrijwilliger die ook vechter is | Mag niet als vrijwilliger zijn ingepland wanneer die in hetzelfde tijdslot een poolwedstrijd van zijn/haar toernooi heeft. |
| Vrijwilliger die geen vechter is | Mag op elk tijdslot worden ingepland, tenzij een concrete vrijwilligerstoewijzing of toernooibeperking dat uitsluit. |
| Toernooigebonden vrijwilliger | Is alleen beschikbaar voor plaatsingen van het optioneel gekozen toernooi; zonder keuze is de vrijwilliger eventbreed beschikbaar. |
| Vechter buiten poolfase | Standaard niet automatisch geblokkeerd voor eliminatie, halve finale of finale, omdat deelname van tevoren onbekend is. |

De instelling **“Vechters uitsluitend tijdens poolfases blokkeren”** staat
standaard aan en bestaat op event-niveau. Als deze aan staat, wordt een
vechter alleen voor wedstrijden in geplande `POOL`-fases als bezet gezien.
Later kan de uitslagverwerking vastleggen welke entries zijn uitgeschakeld; de
beschikbaarheidsberekening neemt dan automatisch eliminatie-, halve finale- en
finalewedstrijden mee voor entries die nog door kunnen gaan.

Voor een vrijwilliger die ook vechter is, geldt de wedstrijdconflictcontrole
altijd voor geplande poolwedstrijden, onafhankelijk van de instelling. Zo kan
iemand niet tegelijk scheidsrechter en vechter zijn.

## Validatie en serververantwoordelijkheid

Alle conflictcontrole gebeurt server-side in één transactie. De UI toont
conflicten direct als voorcontrole, maar is niet de autoriteit.

1. Controleer overlap tussen `ScheduledPhase` en `ScheduleBreak`.
2. Controleer dat een fase niet in een pauzeslot valt en dat er per arena slechts
   één fase per tijdslot staat.
3. Controleer bij vrijwilligerstoewijzing overlap met andere
   `ScheduledAssignment`-records voor die gebruiker.
4. Controleer de concrete pooltoewijzingen en relevante wedstrijden van een
   fighter. Een nog niet ingedeelde vechter blokkeert geen pooltijd.
5. Controleer de eventuele toernooibeperking van de vrijwilliger.
6. Sla alleen op als alle controles slagen; retourneer bij een conflict een
   gestructureerde lijst met persoon, oorzaak en overlappend tijdvak.

Wijzigt een poolindeling nadat vrijwilligers al zijn ingepland, dan valideert de
server opnieuw alle raakvlakken. Een ontstane botsing wordt direct gemarkeerd
en moet worden opgelost voordat de planning als volledig kan gelden.

## Component- en API-grenzen

De planner wordt modulair toegevoegd aan `@hema/ui`:

- `event-planner-view`: beeldvullende host met laden, navigatie en tijdlijn.
- `planner-phase-sidebar-view`: faseselectie met toernooikleuren.
- `planner-volunteer-sidebar-view`: vrijwilligerfilters, vaardigheden en drag
  sources.
- `planner-timeline-view`: tijdslots, arena's, fasen en roldropzones.
- `schedule-time-slot-editor-view`: editor voor starttijd, duur, label,
  kleur en pauzetype van een tijdslot.

Deze componenten importeren uitsluitend hun benodigde typen en API-methoden uit
`@hema/event-admin-api`. De app importeert alleen
`@hema/ui/event-planner-view`, net zoals event-admin alleen zijn view
importeert.

De API breidt uit met eventplanning-eindpunten, bijvoorbeeld:

- `GET /events/:eventId/schedule`
- `POST/PATCH/DELETE /schedule-time-slots`
- `POST/PATCH/DELETE /scheduled-phases`
- `POST/DELETE /scheduled-assignments`

De exacte routevorm volgt de bestaande REST-conventies. API-antwoorden bevatten
altijd arena, stage, tournamentkleur, toegewezen vrijwilligers en voldoende
wedstrijd-/entryinformatie voor conflictweergave zonder extra per-balk requests.

`EventVolunteer` staat los van een toernooi-entry. Daardoor kan iemand alleen
vrijwilliger zijn voor het event, tegelijk vrijwilliger en fighter zijn, of
vrijwilliger zijn met een vrijwillige beperking tot één toernooi zonder dubbele
entries te maken.

## Gefaseerde oplevering

1. Datamodel, migratie en API voor tijdslots, fases en vrijwilligerstoewijzingen.
2. Tijdsloteditor met eventstarttijd, duur, label, kleur en pausestatus.
3. Leesbare planner met tijdslots, toernooifasepaneel en direct slepen.
4. Automatische poolcreatie per geplande poolfase.
5. Vrijwilligersmodus, filters, vaardigheden en roldropzones.
6. Volledige beschikbaarheidsregels, inclusief uitslaggestuurde eliminatie- en
   finalebeschikbaarheid.

## Vastgelegde keuzes

1. De eerste versie plant één dag per event.
2. Judge en jury tonen ieder één vaardigheidsster met het niveau; bereidheid
   blijft een afzonderlijke badge.
3. Elke geplande arena/fase heeft precies één Judge, één Jury en één Table
   nodig.
4. Een fighter blokkeert pas een tijdvenster zodra die aan een concrete pool is
   toegewezen; poolwijzigingen hercontroleren bestaande vrijwilligerstoewijzingen.
5. Vrijwilligers zijn standaard eventbreed en kunnen optioneel tot één
   toernooi worden beperkt.
6. Tijdslots blijven aaneengesloten: een duurwijziging verschuift alle volgende
   slots en hun gekoppelde fases automatisch.
