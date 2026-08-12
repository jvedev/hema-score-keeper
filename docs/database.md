# Database

```mermaid
erDiagram
  User ||--o{ Skill : has
  User ||--o{ Entry : owns

  Event ||--o{ Tournament : contains
  Event ||--o{ Arena : has

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
    string ruleset
  }

  Tournament {
    string id PK
    string eventId FK
    string name
    string ruleset
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
    string ruleset
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
    string ruleset
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
