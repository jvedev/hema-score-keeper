# determen the winner in a pool

```json
{
  "tournament": "NHK Longsword",
  "phase": "pools",
  "ranking_rules": {
    "primary_sorting": [
      {
        "metric": "match_points",
        "order": "desc",
        "description": "Match points (Win = 3, Draw = 1, Loss = 0)"
      }
    ],
    "tie_breakers": [
      {
        "priority": 1,
        "rule": "head_to_head",
        "description": "Head-to-head result between tied fighters"
      },
      {
        "priority": 2,
        "rule": "net_score",
        "formula": "hits_given - hits_received",
        "order": "desc",
        "description": "Net score (Indicator / Net hits)"
      },
      {
        "priority": 3,
        "rule": "hits_given",
        "order": "desc",
        "description": "Total hits given (Most points scored)"
      },
      {
        "priority": 4,
        "rule": "hits_received",
        "order": "asc",
        "description": "Total hits received (Fewest points conceded)"
      },
      {
        "priority": 5,
        "rule": "tie_breaker_exchange",
        "description": "Deciding tie-breaker exchange or coin toss if all metrics remain equal"
      }
    ]
  }
}
```
