# Trust Score System

## Overview

The Trust Score System is a shared reliability system for the app.

Its job is to show how reliable, respectful, and trustworthy a user's activity has been across features.

This system does **not** belong only to Walking Groups. Walking Groups use it, but other parts of the app can also increase, decrease, or read the same score when making decisions.

---

## Core Rules

- Every user starts at **50**.
- The score is always kept between **0** and **100**.
- The score is stored as a whole number.
- A user's trust **tier** is based on their current score.

---

## Trust Tiers

| Score Range | Tier |
| --- | --- |
| 0 - 15 | Flagged |
| 16 - 31 | Watchlist |
| 32 - 46 | Low Trust |
| 47 - 61 | Neutral |
| 62 - 76 | Trusted Peer |
| 77 - 91 | Campus Ally |
| 92 - 100 | Guardian |

---

## What Users See

The trust score is meant to be readable by normal users, not just developers.

Right now, users can see trust information in places such as:

- the **Profile** page
- **Walking Group** participant cards

In Walking Groups, the participant card shows both:

- the user's trust percentage
- the user's trust tier

This helps other users quickly understand who they may feel more comfortable walking with.

---

## Walking Group Behavior

Walking Groups use the shared trust system in the following ways:

### Downvotes

Active members of a walk group can downvote another active member.

Rules:

- a user cannot downvote themselves
- one voter cannot downvote the same target more than once in the same group
- only active members can downvote

Score impact:

- **1 downvote = -5 trust points**
- **2 downvotes = -10 trust points**

The score is still clamped to the normal **0 to 100** range.

### Removing Members

The creator of a Walking Group can remove another member from the group.

Rules:

- only the creator can remove members
- creators cannot remove themselves through this action
- the group must still be active

---

## Other Trust Changes Already Supported

The system is designed so that more than one feature can affect trust.

Current examples already in the app:

### Walking Ratings

Walking ratings can change trust by the following amounts:

| Rating | Trust Change |
| --- | --- |
| 5 stars | +4 |
| 4 stars | +2 |
| 3 stars | 0 |
| 2 stars | -2 |
| 1 star | -5 |

### Class Reporting

The class reporting feature also uses trust.

Current score changes there are:

| Event | Reporter | Correct Voter | Incorrect Voter |
| --- | --- | --- | --- |
| Report verified | +2 | +1 | -1 |
| Report rejected | -5 | +1 | -1 |
| Report expired | -2 | - | - |

This means the trust system is already shared across multiple parts of the app, which is the intended design.

---

## Why It Is Reusable

The system is reusable because the important rules are shared in one place:

- the score range is shared
- the default score is shared
- the tier definitions are shared
- features only need to apply a score change

That lets different features do things like:

- decrease trust for harmful or unreliable behavior
- increase trust for accurate or helpful behavior
- read a user's tier before showing feature-specific actions

The app does not need to rebuild the trust rules separately for each feature.

---

## Data Model in Plain Language

At a high level, the system works like this:

- the user's main trust score is stored in a trust profile
- walking-group downvotes are stored as feedback records
- some server-side trust changes are also recorded in audit history

This makes it possible to both:

- show the current trust score to users
- understand why that score changed over time

---

## Summary

The Trust Score System is a shared app-wide reputation system.

It starts every user at **50**, keeps scores between **0 and 100**, maps those scores into clear tiers, and already supports multiple features changing the same score in different ways.

Walking Groups use it for visibility, downvotes, and safer group decisions, but the system is flexible enough for future features to use the same trust score without creating a second reputation system.
