# EcoQuest

A working environmental quiz and gamification website for CHE110 topic 16.

## Run locally

Install Node.js 24 LTS (or Node.js 22.13+), then run:

```powershell
npm start
```

Open **http://127.0.0.1:3000**. There are no npm dependencies to install. The app creates its SQLite database in `data/ecoquest.sqlite` on first run. Keep that file to preserve accounts and scores. Do not commit it or expose it through a web server.

## Features

- Unique usernames and passwords; salted scrypt password hashes, HTTP-only session cookies, login throttling.
- 838 unique English questions, filtered from the SciQ training set for environmental and related Earth science subjects.
- Ten random questions per quiz: four easy, four medium, two hard. Shuffled answers, no repeated question within a quiz.
- Exactly two lifelines: **50:50** and **Eco Hint**, each available once per quiz. No skip and no score penalty.
- Ten points per correct answer, maximum 100. Server computes scores; answer keys stay off the browser until submission.
- Shared leaderboard based on each player's best quiz score. Equal scores share a competition rank (1, 1, 3).
- Saved quiz progress, total XP, levels, four achievement badges, recent history, and explanation review.
- Responsive forest-green, cream, lime, and amber interface. Keyboard controls, native login dialog, reduced-motion support.

## Question provenance

**SciQ**, Johannes Welbl, Nelson F. Liu, and Matt Gardner (2017), *Crowdsourcing Multiple Choice Science Questions*.

- Dataset: https://huggingface.co/datasets/allenai/sciq
- Original archive: https://ai2-public-datasets.s3.amazonaws.com/sciq/SciQ.zip
- Paper: https://arxiv.org/abs/1707.06209
- License: **CC BY-NC 3.0**, https://creativecommons.org/licenses/by-nc/3.0/

This is a **noncommercial educational application**. Retain the dataset attribution and license notices if distributing the question bank. The included dataset card and archive license are in `data/SciQ-README.md` and `data/SciQ-license.txt`.

Modifications: filtering by environmental keywords in question text, excluding anatomy questions, dated statistics, figure-dependent items and an observed misleading acid-rain question, removing duplicates and invalid answer sets, assigning five topic categories, estimating difficulty from reading length, deriving hints from supporting text, and shuffling choices during play. Original questions, answers, and supporting explanations are retained. Filtering is heuristic; the resulting bank includes related Earth science and ecology. It has not been independently verified question by question. Teacher review is recommended before academic assessment. Difficulty is a reading-length heuristic rather than a calibrated rating. Hints exclude the exact answer text but may vary in usefulness.

Rebuild the bank using Python's standard library: save the original SciQ ZIP as `data/SciQ.zip`, then run `python scripts/import_questions.py`. The committed `data/questions.json` is sufficient to run the app; Python and the ZIP are not needed at runtime.

EnviroExam was evaluated initially but its downloaded question files were in Chinese; it is not used by the app. `data/EnviroExam-README.md` records that research.

## Validation

```powershell
npm test
```

Tests start an isolated server/database and exercise account creation, duplicate usernames, login, private quiz access, question mix, hidden answers, single-use lifelines including concurrent requests, blocked skip, server-side scores, idempotent submission, tied ranks, XP, hashed passwords, logout, and persistence after restarting the server.

## Sharing and deployment

The default server binds to localhost. For a classroom LAN demo, set `HOST=0.0.0.0` and use the host computer's local IP address (subject to its firewall). All players must connect to the same server to share a leaderboard.

For public deployment, use a Node host with a persistent volume for SQLite, HTTPS through a reverse proxy, and `COOKIE_SECURE=1`. Configure `DB_PATH`, `HOST`, and `PORT` as needed. Ephemeral or static hosting will not preserve the shared database. Account recovery, email verification, and distributed production abuse protection are outside this prototype's scope.

## Project structure

- `server.js`: HTTP API, authentication, database, quiz selection/scoring.
- `public/index.html`, `public/styles.css`, `public/app.js`: interface.
- `data/questions.json`: imported question bank.
- `scripts/import_questions.py`: reproducible import.
- `tests/app.test.js`: integration tests.

To demonstrate: create two accounts, finish a quiz with each, use both lifelines, compare the shared leaderboard, then open a profile and review the explanations. The group can use screenshots and explain this flow in its project report and video.
