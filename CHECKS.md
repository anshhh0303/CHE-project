# EcoQuest readiness checks

Verified on 12 October 2026 after completing the arcade redesign.

## Automated checks

- `node --check server.js`, `node --check public/app.js`, and `node --check public/arcade.js` passed.
- `npm test` passed using an isolated database: registration/login, duplicate usernames, private quiz access, ten unique questions with a 4/4/2 difficulty mix, concealed answer keys, lifeline limits including concurrent requests, blocked skip, server-side scoring, idempotent submission, tied ranks, XP, password hashing, restart persistence and logout.
- `git diff --check` passed.

## Browser checks

- Planet scanner reveals facts and advances its five-signal counter.
- Eco cards reveal and hide their side quests.
- FX pause persists after reload and stops CSS animations.
- A test account completed a second ten-question quiz with both lifelines. Exactly two wrong options were removed, and both lifelines remained consumed after reload.
- Keyboard answer selection retains focus on the selected choice.
- The quiz resumed at question two after reload; all ten review entries appeared after submission.
- Latest quiz score was 30/100; the existing best remained 40/100, and total XP became 70. Leaderboard search and history review showed these values correctly.
- Animated result score settled at its actual score. Optional sound enabled and muted without console errors.
- Desktop, tablet and phone viewport checks at 1440, 768, 390 and 320 pixels had no horizontal document overflow. Mobile navigation remains visible above the content.
- Browser console contained no errors or warnings during the audited flows.

## Issue fixed during the audit

The decorative canvas could increase the hero height after repeated viewport changes because its intrinsic dimensions participated in layout. The globe button and canvas now use absolute positioning within their existing container. Repeating desktop/phone/tablet/desktop resizing kept the desktop hero height stable at approximately 458 pixels and the tablet hero at 410 pixels.

## Readiness scope

The local educational prototype is ready for demonstration. Public internet hosting is a separate deployment step; the question bank and approximate difficulty labels still benefit from teacher review before formal assessment. Test accounts used for browser checks are kept in a separate ignored database, not in the main leaderboard.
