# mqcarpark-data

Every 15 minutes, day and night, a GitHub Action reads the Macquarie
University car park numbers published on
[vpermit](https://vpermit.com.au/parkavail/mq) and records which ones are
actually changing.

Many of those numbers never move. Either a sensor has stopped reporting or
nothing is counting that car park at all. Either way, the number isn't real,
and drivers can't plan around it.

## The rule

A university car park is busy at all hours: students and staff come and go
through the day, and the hospital and sports facilities run in the evenings
and at weekends. So there is no time-of-day window. Each car park is judged
on the last 24 hours of readings:

| Status | Shown on the page as | Meaning |
|---|---|---|
| `counting` | the live number | Changed at least 3 times in the last 24 hours |
| `no-real-count` | **no real count** | Watched for 24 hours with fewer than 3 changes: a number that never moves, sits at 0, jumps once, or is blank |
| `watching` | the live number | First seen less than 24 hours ago and not yet counting |

A "no real count" flag clears as soon as the car park reaches 3 changes
within 24 hours, which is usually within the hour once it really starts
counting.

## Where the result goes

`reliability.json` is published on the **`data`** branch. That branch is
overwritten on every run, so the repo doesn't grow. The page at
https://i47.solutions/MQCarPark/ reads it from there.

You can run a check by hand from **Actions → Counting check → Run workflow**.

Independent project, not affiliated with or endorsed by Macquarie University.
