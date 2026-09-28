# Mutex locks

One file per active slice: `<slice-id>.lock`

```json
{"agent":"<runtime-or-agent-id>","started":"<ISO-8601>","slice":"<slice-id>"}
```

Delete the lock on handoff or when the slice reaches `DONE` / `PARKED` / `ABANDONED` and no agent is writing.
