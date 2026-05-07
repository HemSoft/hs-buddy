param(
    [Parameter(Mandatory)][int]$PRNumber
)

pr-reviewer -PRNumber $PRNumber -Provider opencode -Model kimi-k2.6 -Mode All