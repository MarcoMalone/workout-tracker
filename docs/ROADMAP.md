# Workout Tracker — Rolling Feature Log

Ideas and changes to build/discuss later. Newest first. Move items to BUILD-LOG.md
when shipped.

## Coach

- **Coach builds the workout (structured prescription → template).** Today the
  pre-workout "→ Start Workout" button only carries your free-text note to the Log
  tab and asks you to tap an *existing* template. It does **not** turn Coach's
  prescribed exercises into a workout. Feature: have Coach return a *structured*
  workout (exercises + sets/reps, e.g. via Claude structured output / tool use),
  then offer "Add as today's workout" that creates a real template/session from it.
  Medium effort — needs a schema'd Claude call + a build-from-prescription path
  that reuses the template data model (incl. supersets now that they exist).
- **Rename / rebrand "Coach" framing.** "Pre-Workout Check-In" is too narrow — Coach
  now also does the body check-in, post-workout debrief, goal coach, and health-
  project export. Consider just calling the whole tab's assistant "Coach" and
  reframing the section headers so it's clear he's not only pre/post-workout.
  (Marco: back-burner, wanted noted so it isn't forgotten.)
- **Document "talk to Coach to build a workout"** in About / Features / the
  tutorial/onboarding — once the structured-prescription feature above ships.
