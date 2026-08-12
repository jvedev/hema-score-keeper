# UI-ontwerp voorstel: Toernooi Organisatie Desktop App

## 1. Navigatie-filosofie

Master-detail met een "breadcrumb-drill-down" die ALTIJD zichtbaar blijft als
kolommen (multi-pane), passend bij een desktop app met veel schermruimte.
Elke stap in de hiërarchie krijgt een eigen kolom/paneel die je kunt
in- en uitklappen. Zo zie je Event → Tournament → Stage tegelijk, zonder
dat je continu heen en weer moet klikken.

┌─────────────┬──────────────────┬───────────────────┬─────────────────────┐
│ EVENTS │ EVENT DETAIL │ TOURNAMENT │ STAGE DETAIL │
│ (lijst) │ (tabs) │ DETAIL (tabs) │ (context afhankelijk)│
├─────────────┼──────────────────┼───────────────────┼─────────────────────┤
│ • HEMA Open │ Tabs: │ Tabs: │ afhankelijk van type:│
│ • Winterc. │ - Tournooien │ - Deelnemers │ - Pool indeling │
│ • Spring... │ - Arena's │ - Vrijwilligers │ - Bracket │
│ │ - Vrijwilligers │ - Stages │ - Speelschema │
│ [+ Nieuw] │ - Inschrijvingen │ [+ Stage] │ - Staff toewijzing │
└─────────────┴──────────────────┴───────────────────┴─────────────────────┘


Elke kolom is een vaste breedte, scrollbaar, en klapt samen tot een smalle
strip als je verder de diepte in gaat (zoals Finder/Miller-columns op
macOS). Dat past bij "veel tegelijk zien" op een desktop.

---

## 2. Scherm: Events overzicht (kolom 1)

- Kaartjes of rijen per Event: naam, ruleset, aantal tournooien, datum
  (indien later toegevoegd aan schema), aantal arena's.
- Knop **"+ Nieuw event"**.
- Klik op event → vult kolom 2.

---

## 3. Scherm: Event detail (kolom 2) — tabs

### Tab "Tournooien"
- Lijst van tournooien binnen dit event, met volgorde (drag to reorder,
  gebruikt `order` veld).
- Per tournooi: naam, ruleset, aantal ingeschreven deelnemers, status
  van stages (bv. "Poules bezig", "Bracket klaar").
- Knop **"+ Nieuw tournooi"**.
- **Belangrijk:** hier ook een mini-overzicht "welke tournooien lopen
  gelijktijdig op welke arena" — een tijdlijn/Gantt-achtige balk per
  arena, zodat organisatoren meteen zien: Arena 1 = Dames Nylon,
  Arena 2 = Heren Staal, tegelijkertijd.

### Tab "Arena's"
- Lijst van arena's (`Arena` model), met volgorde.
- Per arena: welke stages/tournooien er momenteel aan gekoppeld zijn
  (via `StageArena`), en de bemensing (scheids, 2x tafel, 1-4 jury)
  voor de actieve stage op dat moment.
- Knop **"+ Arena toevoegen"**.

### Tab "Vrijwilligers"
- Alle `Entry` met `kind = OFFICIAL` voor dit event, geaggregeerd over
  alle tournooien (een vrijwilliger kan bij meerdere tournooien horen).
- Kolom: naam, rollen die hij/zij kan vervullen, huidige toewijzingen
  (stage + rol), beschikbaarheid indicator (vrij / ingedeeld / conflict).
- Filter op rol (Scheids / Tafel / Jury).

### Tab "Inschrijvingen"
- Alle `Entry` (fighters) voor het hele event, met filter per
  tournooi.
- Snel bulk-acties: bevestigen, verwijderen, verplaatsen naar ander
  tournooi.
- Kolommen: naam, tournooi, seed, status.

---

## 4. Scherm: Tournooi detail (kolom 3) — tabs

### Tab "Deelnemers"
- Lijst `Entry` (FIGHTER) voor dit tournooi, met `seed`.
- Drag-to-reseed of "auto-seed" knop (bv. op basis van `Skill.skillLevel`
  uit het User-model — mooie link naar je Skill-tabel!).

### Tab "Vrijwilligers"
- Vrijwilligers specifiek toegewezen aan stages van dit tournooi.
- Snelkoppeling naar de globale vrijwilligerspool (tab in Event-kolom)
  om iemand toe te voegen.

### Tab "Stages"
- Lijst van `Stage` binnen dit tournooi (Poule, Eliminatie, Finale),
  met volgorde en status (Concept / Ingedeeld / Bezig / Afgerond).
- Klik op stage → vult kolom 4.
- Knop **"+ Stage toevoegen"** met type-keuze (POOL / ELIMINATION / FINAL).

---

## 5. Scherm: Stage detail (kolom 4) — afhankelijk van `StageType`

### 5a. Type = POOL

**Sub-tab "Indeling"**
- Drag-and-drop poule-indeling: deelnemers links, poule-vakken rechts.
- Knop **"⚡ Automatisch indelen"** (bv. op seed, snake-verdeling over
  N poules — N instelbaar).
- Knop **"⚡ Automatisch staff toewijzen"**: wijst per arena/poule een
  scheidsrechter, 2 tafelmedewerkers en 1-4 jury toe op basis van
  beschikbare vrijwilligers uit de Event-vrijwilligerspool
  (respecteert dat iemand niet op twee plekken tegelijk kan staan).
- Arena-koppeling per poule (welke poule speelt op welke arena,
  via `StageArena`).

**Sub-tab "Speelschema"** (verschijnt zodra poule-indeling + arena
gekoppeld is)
- Knop **"📅 Speelschema genereren"** → maakt `Round`/`Match` records
  (round-robin binnen de poule).
- Overzicht per poule: wedstrijdtabel (wie tegen wie, op welke arena,
  in welke ronde).
- Knop **"🖨️ Printen"** → nette printvriendelijke weergave (zie §7).

### 5b. Type = ELIMINATION / FINAL

**Sub-tab "Bracket"**
- Visuele bracket-boom (rondes horizontaal, matches verticaal
  verbonden met lijnen).
- Namen worden automatisch doorgezet: zodra een `Match.winnerEntryId`
  is ingevuld, verschijnt die naam automatisch in de volgende ronde
  se slot (client-side of via server logica die `Round`/`Match`
  aanmaakt/bijwerkt).
- Klik op een match-node → mini-paneel met score-invoer (handmatig,
  zie 5c) en arena-toewijzing.
- Knop **"⚡ Bracket genereren"** (seed-gebaseerd, incl. eventuele
  "bye"-slots bij oneven aantal).

**Sub-tab "Speelschema per ronde"**
- Net als bij Pool: lijstweergave per ronde, met arena en tijdstip.
- Print-knop.

**Sub-tab "Staff"**
- Zelfde automatische toewijzing als bij Pool, maar dan per ronde/arena.

### 5c. Score-invoer (overal waar een Match voorkomt)
- Primair: scores komen uit externe app (niet in scope hier), maar
  een handmatig invoerveld per Match (scoreA / scoreB) + eventueel
  uitklapbare `Exchange`-lijst voor detail-scores, met een
  "Winnaar bepalen" knop die `winnerEntryId` zet.

---

## 6. Scherm: Live Arena-overzicht (los, event-niveau)

Een aparte view (bereikbaar vanuit Event-kolom, knop "Arena's live"),
losstaand van de drill-down, omdat dit een *cross-tournooi* overzicht
is:

┌───────────────────────┬───────────────────────┐
│ ARENA 1 — Dames Nylon │ ARENA 2 — Heren Staal │
│ Scheids: Jan │ Scheids: Piet │
│ Tafel: Ana, Bo │ Tafel: Kim, Lu │
│ Jury: Els, Tom │ Jury: Sam, Nora, Ray │
│ ───────────────────── │ ───────────────────── │
│ Nu: Match 4 (Poule B) │ Nu: Kwartfinale 2 │
│ Volgende: Match 5 │ Volgende: Kwartfinale 3│
└───────────────────────┴───────────────────────┘

Dit is het scherm dat je op een groot scherm/beamer in de zaal zou
kunnen tonen, en helpt organisatoren zien welke arena's tegelijk
draaien (koppelt direct aan je vraag over gelijktijdige tournooien
op meerdere arena's).

---

## 7. Print-weergave

Aparte, sobere layout (géén kolommen, géén UI-chrome):
- **Poule-schema print**: tabel per poule met kolommen Ronde / Arena /
  Speler A / Speler B / Score (leeg in te vullen indien nog niet gespeeld).
- **Bracket print**: verticale lijst per ronde i.p.v. boomstructuur
  (printvriendelijker dan een breedbeeld bracket).
- **Arena-dagschema print**: alle matches op één arena, chronologisch.
- Alles via "Print preview" modal met een knop **"🖨️ Print"** /
  **"Exporteer als PDF"**.

---

## 8. Terugkerende UI-componenten

| Component | Gebruikt in |
|---|---|
| Drag-and-drop lijst | Poule-indeling, seed-volgorde, tournooi-volgorde |
| "⚡ Auto-toewijzen" knop met instelbare parameters (modal) | Pools, Staff, Bracket |
| Status-badge (Concept/Ingedeeld/Bezig/Afgerond) | Stage, Tournooi |
| Beschikbaarheid-indicator vrijwilliger | Vrijwilligers-tab, Auto-toewijzen modal |
| Bracket-node component (klikbaar, toont score inline) | Eliminatie/Finale |
| Print-preview modal | Overal waar een schema getoond wordt |

---

## 9. Samenvatting navigatie-flow

Events
└─ Event (tabs: Tournooien | Arena's | Vrijwilligers | Inschrijvingen)
└─ Tournooi (tabs: Deelnemers | Vrijwilligers | Stages)
└─ Stage
├─ POOL: Indeling → Staff → Speelschema → Print
└─ ELIMINATION/FINAL: Bracket → Staff → Speelschema → Print


Plus een losstaand **Live Arena-overzicht** dat dwars door alle
tournooien van een event heen kijkt — nodig omdat arena's gedeeld
worden tussen tournooien die tegelijk lopen.
