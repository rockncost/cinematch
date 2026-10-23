# 🎬 CineMatch — Bayesian Movie Akinator for Amazon Fire TV
### *Amazon Hackathon 2026 Submission*

> **"Stop scrolling. Start watching."**  
> CineMatch transforms the 20-minute Fire TV browsing paralysis into an intuitive **45-second interactive guessing game**. Upgraded from a rigid binary decision tree to a **Probabilistic Bayesian Soft-Scoring Engine with Temperature Softmax**, CineMatch reads your movie taste with noise-tolerant math and serves the exact film you crave, ready to stream on Prime Video.

---

## 🌟 What's New & Upgraded (Roadmap 1 Implementation)

1. **Probabilistic Bayesian Soft-Scoring (True Akinator Engine)**:
   - Replaced hard elimination (`candidates = [m for m in candidates if m[tag] == 1]`) with **continuous evidence accumulation**.
   - If TMDB is missing a tag or the user is unsure, movies are never permanently deleted — their probabilities simply shift via temperature-scaled **Softmax**:
     $$P(M_i) = \frac{e^{\text{Score}(M_i)/\tau}}{\sum_j e^{\text{Score}(M_j)/\tau}}$$
2. **5-Point Likert Scale D-Pad Controls**:
   - `YES` ($+1.0$)
   - `PROBABLY` ($+0.5$)
   - `DON'T KNOW / SKIP` ($0.0$)
   - `UNLIKELY` ($-0.5$)
   - `NO` ($-1.0$)
   - Dedicated `▲ UNDO` and `🔄 RESTART` recovery buttons.
3. **The "AI Thought Stream" (Perceived Cognition UI)**:
   - Live algorithmic sub-caption beneath every question translating probability math into natural language (e.g. *"Deducing... High correlation with 1990s Sci-Fi. Targeting 88% probability convergence."*).
4. **Upfront Hard Dealbreakers (1-Click Filters)**:
   - Toggleable TV pills for `⏱ Under 2h` and `🛡 Family Safe` (excludes horror and dark content) to eliminate noise before evidence gathering starts.
5. **Couch / Duo Mode (Multi-User TV Logic)**:
   - Toggle between **Solo Mode** and **Couch Duo Mode**, where Player 1 and Player 2 take turns with the remote (`🎮 Player 1's Turn` ➔ `🎮 Player 2's Turn`) while the engine optimizes for shared taste.
6. **Dynamic "Poster Unblur" Reveal (Visual Suspense)**:
   - Ambient fanart backdrop blur dynamically clears as confidence rises from $18\%$ to $98\%$.
7. **Quality-Weighted TMDB Ranking**:
   - Combines Bayesian probability with TMDB star ratings so critically acclaimed masterpieces (8.0+) are favored over mediocre titles.
8. **Native Fire TV Deep-Linking**:
   - Attempts `amzn://apps/android?p=com.amazon.avod` with fallback to Amazon Prime Video web search.

---

## 📐 Algorithmic Flow

```
  ┌─────────────────────────────────────────────────────────────┐
  │                   Fire TV Remote / Client                   │
  │     (HTML5 10-Foot UI • Silk Browser • Web App Tester)      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ 5-Point Likert Choice (YES/PROBABLY/SKIP/UNLIKELY/NO)
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │            Bayesian Soft-Scoring Decision Engine            │
  │                                                             │
  │    Score(M_i) = Score(M_i) + Weight * Feature(M_i, Tag)     │
  │    P(M_i) = exp(Score / tau) / sum(exp(Score / tau))        │
  │                                                             │
  │    Information Gain on Unasked Features:                    │
  │    H(f) = - P_yes * log2(P_yes) - P_no * log2(P_no)         │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                 Quality-Weighted Ranking                    │
  │    FinalScore(M_i) = P(M_i) * 0.65 + (Rating / 10) * 0.35   │
  │    • Top Pick + 3 Alternatives + YouTube Trailer + Prime Link│
  └─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start & Testing

### Option 1: One-Line Demo Runner
```bash
python scripts/start_demo.py
```
This runs on port `8000` and displays your **Local LAN IP** to open on your Fire TV.

### Option 2: Run with FastAPI & Uvicorn
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### Option 3: Standalone Zero-Server Mode
Open `index.html` directly in any web browser or deploy statically to Netlify / Vercel.

---

## 🎮 Fire TV Remote Controls

| Remote Button | Question Screen Action | Result Screen Action |
|:---:|:---:|:---:|
| **◄ Left** | Navigate left across Likert choices | Move Left |
| **Right ►** | Navigate right across Likert choices | Move Right |
| **▼ Down** | Jump to **UNDO / RESTART** | Move to **Alternative Matches** |
| **▲ Up** | Jump to **DON'T KNOW** | Return to **Hero Actions** |
| **● Select / OK** | Confirm focused choice | Launch / Play / Swap Movie |
| **↩ Back** | Undo last question | Play Again / Restart |

*(Keyboard shortcuts for testing: `Y` = YES, `P` = PROBABLY, `S` = SKIP, `N` = NO, `U` = UNDO).*
