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
  ruleset

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
  ruleset

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
  ruleset


round
  roundID
  stageID
  roundNumber


exchange
  exchangeID
  matchID
  scoreA
  scoreB
  details  json
