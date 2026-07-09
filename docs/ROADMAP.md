# Workout Tracker — Rolling Feature Log

Ideas and changes to build/discuss later. Newest first. Move items to BUILD-LOG.md
when shipped.

## ⚠ Pending Marco's on-device testing (remind him)

- **Ad-hoc superset link/unlink** — mid-workout ⛓ on a card links it with the one
  above; "unlink" on the block dissolves the group. Confirm the gesture feels
  discoverable and that "unlink" (dissolves the whole group, not one member) reads
  right.
- **Full superset loop** — build Bench⛓Push-ups in the editor → log in rounds with
  a drop set → finish → open in History and confirm the rounds read as expected.
- **WS-B changes** — confirm the Progress tab now switches instantly, Settings
  sections collapse cleanly, tap-backdrop closes sheets, and the Progress jump
  chips scroll correctly.
- **Coach builds a workout** — on the Coach tab (needs your API key), describe a
  workout and confirm the preview → "Start this workout" flow: sensible exercises
  from your library, any new ones created cleanly, supersets grouped right, and it
  saved to Workouts. This is the one to poke hardest — it's a live Claude call.

## Deferred — needs on-device testing to build well

- **Swipe-to-dismiss for sheets** — last WS-B item. Pure device-feel (drag
  velocity, dismiss threshold, not fighting content scroll), so best built when it
  can be felt on a phone. Backdrop-tap-to-close already ships as the safe fallback.

## Coach

- ✅ **Coach builds the workout (structured prescription → template).** SHIPPED —
  "Build Me a Workout" card on the Coach tab: describe what you want, Claude returns
  a structured workout (mapped to your library, adding new exercises as needed, with
  supersets), previewed, then "Start this workout" saves it as a template and
  launches it. `buildPrescribedWorkout` + pure `parsePrescribedWorkout` /
  `buildTemplateFromPrescription` in claude-api.js.
- **Rename / rebrand "Coach" framing.** "Pre-Workout Check-In" is too narrow — Coach
  now also does the body check-in, post-workout debrief, goal coach, and health-
  project export. Consider just calling the whole tab's assistant "Coach" and
  reframing the section headers so it's clear he's not only pre/post-workout.
  (Marco: back-burner, wanted noted so it isn't forgotten.)
- **Document "talk to Coach to build a workout"** in About / Features / the
  tutorial/onboarding — once the structured-prescription feature above ships.
