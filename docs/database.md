# Database

```mermaid
erDiagram
  User ||--o{ Skill : has
  User ||--o{ Entry : owns

  Event ||--o{ Tournament : contains
  Event ||--o{ Arena : has
  Event ||--o{ Ruleset : defines

  Tournament ||--o{ Entry : groups
  Tournament ||--o{ Stage : contains

  Entry ||--o{ StageOfficial : assigned_as

  Arena ||--o{ StageArena : linked_through
  Stage ||--o{ StageArena : linked_through

  Stage ||--o{ Round : has
  Stage ||--o{ StageOfficial : uses

  Round ||--o{ Match : has
  Arena ||--o{ Match : hosts

  Entry ||--o{ Match : entry_a
  Entry ||--o{ Match : entry_b
  Entry ||--o{ Match : winner

  Match ||--o{ Exchange : has

  Ruleset ||--o{ Tournament : selected_by
  Ruleset ||--o{ Stage : selected_by
  Ruleset ||--o{ Match : selected_by

  User {
    string id PK
    string username UK
  }

  Skill {
    string id PK
    string userId FK
    string skillName
    int skillLevel
  }

  Event {
    string id PK
    string eventName
    string rulesetId FK
  }

  Ruleset {
    string id PK
    string eventId FK
    string name
    int version
  }

  Tournament {
    string id PK
    string eventId FK
    string name
    string rulesetId FK
    int order
  }

  Entry {
    string id PK
    string tournamentId FK
    string userId FK
    string kind
    int seed
  }

  Arena {
    string id PK
    string eventId FK
    string name
    int order
  }

  Stage {
    string id PK
    string tournamentId FK
    string type
    string name
    string rulesetId FK
    int minPoolSize
    int maxPoolSize
    int preferredPoolSize
    int eliminationParticipantCount
    int timeBetweenMatchesMinutes
  }

  StageArena {
    string id PK
    string stageId FK
    string arenaId FK
  }

  StageOfficial {
    string id PK
    string stageId FK
    string entryId FK
    string role
  }

  Round {
    string id PK
    string stageId FK
    int roundNumber
  }

  Match {
    string id PK
    string roundId FK
    string arenaId FK
    string entryAId FK
    string entryBId FK
    string winnerEntryId FK
    int scoreA
    int scoreB
    string rulesetId FK
  }

  Exchange {
    string id PK
    string matchId FK
    int scoreA
    int scoreB
    json details
  }
```

## Notes

- One event can contain multiple tournaments.
- Entries are unique per tournament, so the same user can appear in multiple tournaments inside one event.
- Stages belong to a tournament, while arenas still belong to an event.
- Match is the canonical fight/result record; "bout" is a compatibility label in the competition UI.
- Round is a tournament-planning concept, not a per-hit fight round.
- Match event details stay in JSON for now so exchanges, warnings, timeouts and disqualifications can be refined later.
- Rulesets are event-scoped and versioned; stages own pool sizing and timing, and matches reference a specific ruleset version snapshot.
