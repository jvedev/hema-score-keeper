user
  userID
  username

skills
  skillID
  userID
  skillName judge | jury | ehbo
  skillLevel

event
  eventID
  eventName
  rulesetID

arena
  arenaID
  eventID
  name
  order

entry
  entryID
  eventID
  userID
  kind fighter | official
  seed

stage
  stageID
  eventID
  type pool | elimination | final
  name
  rulesetID

stageOfficial
  stageOfficialID
  stageID
  entryID
  role judge | jury | teller | table

stageArena
  stageArenaID
  stageID
  arenaID




match
  matchID
  roundID
  arenaID
  entryAID
  entryBID
  winnerEntryID
  scoreA
  scoreB
  rulesetID

ruleset
  rulesetID
  eventID
  name
  version


round
  roundID
  stageID
  roundNumber

stage
  stageID
  tournamentID
  type pool | elimination | final
  name
  rulesetID
  minPoolSize
  maxPoolSize
  preferredPoolSize
  eliminationParticipantCount
  timeBetweenMatchesMinutes


exchange
  exchangeID
  matchID
  scoreA
  scoreB
  details  json
