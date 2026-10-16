# Ship checklist — Fridge Door Companion

Working checklist for the `6-ship` stage. The app itself is done and verified (four harnesses green, 117 assertions; final review signed off 2026-10-16); what remains is sharing and submitting, and the form answers are yours to write.

## Already done (technical mechanics)

- [x] **Proof of concept verified** — `node verify/slice-1.js` … `slice-4.js` all pass (117 assertions); served as the README documents (`python3 -m http.server 8000` → all assets HTTP 200); the core journey is covered end to end by slice 4's harness.
- [x] **Public repository exists and is pushed** — https://github.com/tilaboy/fridge-door-companion
  - Checked for private material: no secrets or credentials in any tracked file; `devpost/learner-profile.md` (personal context) is gitignored and was never committed; the planning documents (`scope.md`, `prd.md`, `spec.md`, `checklist.md`, `app-map.html`) are tracked on purpose — they show the process and help you come back to the project.
  - Run instructions for reviewers are in `README.md` (any static file server works; no build step, no dependencies, no backend).

## Yours to do (learner-owned by design)

- [ ] **Demo video** — record it from the beat sheet in `devpost/demo-beats.md` (~60 s; check the exact limit on your submission form), upload it where reviewers can open it **without logging in**, and verify the link in a private window.
  - Video URL: `____________________________`
- [ ] **Project name and short description** — you write these. I can help you think them through and spot missing information, and correct spelling/grammar once written, but I won't draft or rewrite them. The name is already settled: **Fridge Door Companion**.
- [ ] **Other required form fields** — also yours; read the actual form and answer in your own words.
- [ ] **Exit survey** — your own reflections, answered by you.
- [ ] **Submit on Devpost** — the final click is yours.

## Optional (not required for submission)

- [ ] **Live deployment** — the app is pure static files, so any static host works (GitHub Pages from this repo is the shortest path). Only if you want others to try it directly; a deployed link never replaces the required video.
- [ ] **Peer feedback** — optional per the hackathon rules; if you choose to, your posts and reviews are your own writing.

## Handoff

Once the video link is verified, the repository is public (it already is), and the form fields and exit survey are complete, submit on Devpost. Congratulations on building your proof of concept — that's the end of the guided walkthrough; this checklist shows anything still open.
