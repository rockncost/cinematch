/**
 * CineMatch - Fire TV Bayesian Application Controller
 * Handles Bayesian Soft-Scoring, 5-point Likert D-Pad choices,
 * AI Thought Streams, Dynamic Poster Unblurring, Couch Duo Mode, and Dealbreaker Filters.
 */

(function () {
    'use strict';

    // Application State
    let useBackend = false;
    let backendUrl = 'http://localhost:8000';
    let clientEngine = null;
    let sessionId = null;
    let currentTag = null;
    let currentScreen = 'QUESTION'; // 'QUESTION' | 'RESULT' | 'TRAILER'
    let recommendations = [];
    let activeMovie = null;
    let focusableElements = [];
    let focusedIndex = 0;

    // Dealbreakers & Modes
    let dealbreakers = {
        underTwoHours: false,
        familySafe: false,
        primePreferred: true
    };
    let duoMode = false;

    // DOM Elements
    const questionScreen = document.getElementById('question-screen');
    const resultScreen = document.getElementById('result-screen');
    const questionTextEl = document.getElementById('question-text');
    const stepBadgeEl = document.getElementById('step-badge');
    const counterBadgeEl = document.getElementById('counter-text');
    const confBarEl = document.getElementById('conf-bar');
    const confPctEl = document.getElementById('conf-pct');
    const backdropEl = document.getElementById('backdrop');
    const thoughtTextEl = document.getElementById('thought-text');
    const playerBadgeEl = document.getElementById('player-badge');

    // Dealbreaker Buttons
    const dbRuntimeBtn = document.getElementById('db-runtime');
    const dbFamilyBtn = document.getElementById('db-family');
    const duoToggleBtn = document.getElementById('btn-duo-toggle');
    const duoLabelEl = document.getElementById('duo-label');

    // Result Screen Elements
    const heroTitleEl = document.getElementById('hero-title');
    const heroPosterEl = document.getElementById('hero-poster');
    const heroRatingEl = document.getElementById('hero-rating');
    const heroYearEl = document.getElementById('hero-year');
    const heroRuntimeEl = document.getElementById('hero-runtime');
    const heroGenresEl = document.getElementById('hero-genres');
    const heroTraitsEl = document.getElementById('hero-traits');
    const heroOverviewEl = document.getElementById('hero-overview');
    const altShelfEl = document.getElementById('alt-shelf');
    const resultConfidenceEl = document.getElementById('result-confidence');

    // Trailer Modal Elements
    const trailerModal = document.getElementById('trailer-modal');
    const trailerIframe = document.getElementById('trailer-iframe');
    const trailerTitleEl = document.getElementById('trailer-title');
    const btnCloseTrailer = document.getElementById('btn-close-trailer');

    // Toast
    const toastEl = document.getElementById('toast-notification');
    let toastTimeout = null;

    function showToast(msg) {
        if (!toastEl) return;
        toastEl.innerText = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toastEl.classList.remove('show');
        }, 3200);
    }

    // Dynamic Poster Unblur (Suspense Reveal)
    function updateBackdrop(imageUrl, confidencePct = 20) {
        if (!backdropEl) return;
        if (imageUrl) {
            backdropEl.style.backgroundImage = `url('${imageUrl}')`;
        }
        // As confidence increases, blur reduces from 24px down to 8px
        const blurAmount = Math.max(8, Math.round(24 - (confidencePct / 100) * 16));
        backdropEl.style.filter = `blur(${blurAmount}px) brightness(0.26) saturate(1.2)`;
    }

    // Set Focus with Audio
    function setFocus(newIndex, playSound = true) {
        if (!focusableElements || focusableElements.length === 0) return;

        focusableElements.forEach(el => el && el.classList.remove('focused'));
        focusedIndex = (newIndex + focusableElements.length) % focusableElements.length;
        const target = focusableElements[focusedIndex];
        if (target) {
            target.classList.add('focused');
            target.focus();
            if (playSound && window.soundFX) {
                window.soundFX.playFocus();
            }
        }
    }

    // Update Top HUD
    function updateHud(stepCount, candidatesCount, confidencePct, thoughtStream, currentPlayer) {
        if (stepBadgeEl) {
            stepBadgeEl.innerText = `Iteration ${String(stepCount).padStart(2, '0')} • Candidate Pool: ${candidatesCount} Titles`;
        }
        if (counterBadgeEl) {
            counterBadgeEl.innerText = `${candidatesCount} titles in play`;
        }
        if (confBarEl) confBarEl.style.width = `${confidencePct}%`;
        if (confPctEl) confPctEl.innerText = `${confidencePct}%`;
        if (thoughtTextEl && thoughtStream) {
            thoughtTextEl.innerText = thoughtStream;
        }

        // Duo Mode Player Turn Badge
        if (playerBadgeEl) {
            if (duoMode) {
                playerBadgeEl.style.display = 'flex';
                playerBadgeEl.innerHTML = `<span>🎮 Player ${currentPlayer || 1}'s Turn</span>`;
            } else {
                playerBadgeEl.style.display = 'none';
            }
        }
    }

    // Initialize or Restart Engine
    async function initEngine() {
        // Test FastAPI backend availability
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1200);
            const res = await fetch(`${backendUrl}/api/session/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    duo_mode: duoMode,
                    dealbreakers: {
                        under_two_hours: dealbreakers.underTwoHours,
                        family_safe: dealbreakers.familySafe,
                        prime_preferred: true
                    }
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                useBackend = true;
                sessionId = data.session_id;
                currentTag = data.question_tag;
                renderQuestion(data.question_text, data.step_count, data.candidates_count, data.confidence_pct, data.thought_stream, data.current_player);
                console.log('[CineMatch] Connected to Bayesian FastAPI backend.');
                return;
            }
        } catch (e) {
            console.log('[CineMatch] Backend unavailable, running client-side Bayesian engine.');
        }

        // Fallback to client-side Bayesian engine
        useBackend = false;
        clientEngine = new window.CineMatchEngine();
        const startData = clientEngine.startSession({
            duoMode: duoMode,
            dealbreakers: dealbreakers
        });

        currentTag = startData.questionTag;
        renderQuestion(
            startData.questionText,
            startData.stepCount,
            startData.candidatesCount,
            startData.confidencePct,
            startData.thoughtStream,
            startData.currentPlayer,
            startData.topCandidateBackdrop
        );
    }

    // Render Question Screen
    function renderQuestion(questionText, stepCount, candidatesCount, confidencePct, thoughtStream, currentPlayer, backdropUrl) {
        currentScreen = 'QUESTION';
        questionScreen.classList.add('active');
        resultScreen.classList.remove('active');
        trailerModal.classList.remove('active');

        questionTextEl.innerText = questionText;
        updateHud(stepCount, candidatesCount, confidencePct, thoughtStream, currentPlayer);

        if (backdropUrl) {
            updateBackdrop(backdropUrl, confidencePct);
        }

        // Setup 5-Button Likert focusable array:
        // [0: YES, 1: PROBABLY, 2: SKIP, 3: UNLIKELY, 4: NO, 5: UNDO, 6: RESTART]
        focusableElements = [
            document.getElementById('btn-yes'),
            document.getElementById('btn-probably'),
            document.getElementById('btn-skip'),
            document.getElementById('btn-unlikely'),
            document.getElementById('btn-no'),
            document.getElementById('btn-undo'),
            document.getElementById('btn-reset')
        ].filter(Boolean);

        setFocus(0, false);
    }

    // Process Likert Answer Choice
    async function handleAnswer(answer) {
        if (!currentTag) return;
        if (window.soundFX) window.soundFX.playSelect();

        questionTextEl.innerHTML = `<span style="opacity: 0.6;">Updating Bayesian evidence...</span>`;

        if (useBackend && sessionId) {
            try {
                const res = await fetch(`${backendUrl}/api/session/answer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: sessionId,
                        tag: currentTag,
                        answer: answer
                    })
                });
                const data = await res.json();
                if (data.is_final) {
                    showResults(data.recommendations);
                } else {
                    currentTag = data.question_tag;
                    renderQuestion(data.question_text, data.step_count, data.candidates_count, data.confidence_pct, data.thought_stream, data.current_player);
                }
                return;
            } catch (err) {
                console.error('[CineMatch] Backend error, switching to client Bayesian engine', err);
                useBackend = false;
                clientEngine = new window.CineMatchEngine();
                clientEngine.startSession({ duoMode, dealbreakers });
            }
        }

        // Pure JS Bayesian Entropy Execution (< 1ms)
        const stepResult = clientEngine.submitAnswer(currentTag, answer);
        if (stepResult.isFinal) {
            showResults(stepResult.recommendations);
        } else {
            currentTag = stepResult.questionTag;
            renderQuestion(
                stepResult.questionText,
                stepResult.stepCount,
                stepResult.candidatesCount,
                stepResult.confidencePct,
                stepResult.thoughtStream,
                stepResult.currentPlayer,
                stepResult.topCandidateBackdrop
            );
        }
    }

    // Undo Previous Choice
    async function handleUndo() {
        if (window.soundFX) window.soundFX.playSelect();

        if (useBackend && sessionId) {
            try {
                const res = await fetch(`${backendUrl}/api/session/undo?session_id=${sessionId}`, {
                    method: 'POST'
                });
                if (res.ok) {
                    const data = await res.json();
                    currentTag = data.question_tag;
                    renderQuestion(data.question_text, data.step_count, data.candidates_count, 45, data.thought_stream, data.current_player);
                    return;
                }
            } catch (e) {}
        }

        if (clientEngine) {
            const undoData = clientEngine.undo();
            if (undoData) {
                currentTag = undoData.questionTag;
                renderQuestion(
                    undoData.questionText,
                    undoData.stepCount,
                    undoData.candidatesCount,
                    undoData.confidencePct,
                    undoData.thoughtStream,
                    undoData.currentPlayer
                );
            } else {
                showToast("Already at first question.");
            }
        }
    }

    // Render Recommendation Screen
    function showResults(movieList) {
        currentScreen = 'RESULT';
        questionScreen.classList.remove('active');
        resultScreen.classList.add('active');
        trailerModal.classList.remove('active');

        recommendations = movieList || [];
        if (recommendations.length === 0) {
            showToast("No direct matches found. Restarting!");
            initEngine();
            return;
        }

        if (window.soundFX) window.soundFX.playSuccess();

        // Update HUD
        if (stepBadgeEl) stepBadgeEl.innerText = "Match Discovered!";
        if (counterBadgeEl) counterBadgeEl.innerText = `${recommendations.length} curated picks`;
        if (confBarEl) confBarEl.style.width = '100%';
        if (confPctEl) confPctEl.innerText = '98%';

        // Display Hero Movie (Top Match)
        setActiveHero(recommendations[0]);

        // Render Alternative Shelf (Movies 1, 2, 3)
        altShelfEl.innerHTML = '';
        const altMovies = recommendations.slice(1, 4);
        altMovies.forEach((m, idx) => {
            const card = document.createElement('div');
            card.className = 'alt-card';
            card.setAttribute('data-alt-index', idx + 1);
            card.innerHTML = `
                <img class="alt-card-poster" src="${m.poster_path || ''}" alt="${m.title}">
                <div class="alt-card-info">
                    <div class="alt-card-title">${m.title}</div>
                    <div class="alt-card-meta">
                        <span>★ ${m.vote_average || '8.0'}</span>
                        <span>•</span>
                        <span>${m.release_year || ''}</span>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => {
                setActiveHero(m);
                setFocus(0);
            });
            altShelfEl.appendChild(card);
        });

        // Setup Result Screen focusable elements:
        // [0: Prime, 1: Trailer, 2: Restart, 3..: Alt Cards]
        const actionBtns = [
            document.getElementById('btn-prime'),
            document.getElementById('btn-trailer'),
            document.getElementById('btn-restart')
        ];
        const altCards = Array.from(document.querySelectorAll('.alt-card'));
        focusableElements = [...actionBtns, ...altCards].filter(Boolean);

        setFocus(0, false);
    }

    // Set Active Movie on Hero Card
    function setActiveHero(movie) {
        activeMovie = movie;

        heroTitleEl.innerText = movie.title || 'Movie Title';
        heroPosterEl.src = movie.poster_path || '';
        heroRatingEl.innerText = `★ ${movie.vote_average || '8.2'}/10`;
        heroYearEl.innerText = movie.release_year || '2024';
        
        const runtimeMin = movie.runtime || 115;
        const hours = Math.floor(runtimeMin / 60);
        const mins = runtimeMin % 60;
        heroRuntimeEl.innerText = `${hours}h ${mins}m`;

        const genresList = (movie.genres || []).slice(0, 3).join(' • ');
        heroGenresEl.innerText = genresList || 'Featured Movie';

        heroOverviewEl.innerText = movie.overview || 'Enjoy this personalized cinema recommendation curated for your taste.';

        // Matched traits chips
        heroTraitsEl.innerHTML = '<span class="trait-label">Matched:</span>';
        if (movie.matched_traits && movie.matched_traits.length > 0) {
            movie.matched_traits.forEach(trait => {
                const chip = document.createElement('span');
                chip.className = 'trait-chip';
                chip.innerText = trait;
                heroTraitsEl.appendChild(chip);
            });
        } else {
            const chip = document.createElement('span');
            chip.className = 'trait-chip';
            chip.innerText = 'High Bayesian Affinity';
            heroTraitsEl.appendChild(chip);
        }

        // Full cinematic backdrop reveal
        if (movie.backdrop_path) {
            updateBackdrop(movie.backdrop_path, 100);
        }
    }

    // Launch on Amazon Prime Video (Native Fire TV Deep-Link)
    function launchPrimeVideo() {
        if (window.soundFX) window.soundFX.playSelect();
        showToast(`Launching "${activeMovie ? activeMovie.title : 'Movie'}" on Prime Video...`);

        if (activeMovie) {
            const query = encodeURIComponent(activeMovie.title);
            // Native Fire TV URI scheme
            const fireTvUri = "amzn://apps/android?p=com.amazon.avod";
            const webFallback = `https://www.amazon.com/s?k=${query}&i=instant-video`;

            try {
                window.location.href = fireTvUri;
                setTimeout(() => {
                    window.open(webFallback, '_blank');
                }, 800);
            } catch (e) {
                window.open(webFallback, '_blank');
            }
        }
    }

    // Open Trailer Modal
    function openTrailer() {
        if (!activeMovie || !activeMovie.trailer_key) {
            showToast("No official trailer found for this title.");
            return;
        }

        if (window.soundFX) window.soundFX.playSelect();

        currentScreen = 'TRAILER';
        trailerModal.classList.add('active');
        trailerTitleEl.innerText = `${activeMovie.title} - Official Trailer`;
        trailerIframe.src = `https://www.youtube-nocookie.com/embed/${activeMovie.trailer_key}?autoplay=1&enablejsapi=1`;

        focusableElements = [btnCloseTrailer];
        setFocus(0, false);
    }

    // Close Trailer Modal
    function closeTrailer() {
        trailerModal.classList.remove('active');
        trailerIframe.src = '';
        currentScreen = 'RESULT';

        const actionBtns = [
            document.getElementById('btn-prime'),
            document.getElementById('btn-trailer'),
            document.getElementById('btn-restart')
        ];
        const altCards = Array.from(document.querySelectorAll('.alt-card'));
        focusableElements = [...actionBtns, ...altCards].filter(Boolean);

        setFocus(1); // Return focus to Watch Trailer button
    }

    // Remote D-Pad Navigation Controller
    window.remoteInput.onRemoteEvent((action) => {
        // Trailer Modal Controls
        if (currentScreen === 'TRAILER') {
            if (action === 'BACK' || action === 'SELECT') {
                closeTrailer();
            }
            return;
        }

        // Question Screen Controls
        // [0: YES, 1: PROBABLY, 2: SKIP, 3: UNLIKELY, 4: NO, 5: UNDO, 6: RESTART]
        if (currentScreen === 'QUESTION') {
            if (action === 'LEFT') {
                if (focusedIndex > 0 && focusedIndex <= 4) {
                    setFocus(focusedIndex - 1);
                } else if (focusedIndex === 6) {
                    setFocus(5);
                }
            } else if (action === 'RIGHT') {
                if (focusedIndex >= 0 && focusedIndex < 4) {
                    setFocus(focusedIndex + 1);
                } else if (focusedIndex === 5) {
                    setFocus(6);
                }
            } else if (action === 'DOWN') {
                if (focusedIndex >= 0 && focusedIndex <= 4) {
                    setFocus(5); // Jump down to UNDO
                }
            } else if (action === 'UP') {
                if (focusedIndex === 5 || focusedIndex === 6) {
                    setFocus(2); // Jump back up to SKIP
                }
            } else if (action === 'SELECT') {
                const el = focusableElements[focusedIndex];
                if (el) {
                    const ans = el.getAttribute('data-answer');
                    const act = el.getAttribute('data-action');
                    if (ans) handleAnswer(ans);
                    else if (act === 'UNDO') handleUndo();
                    else if (act === 'RESET') initEngine();
                }
            } else if (action === 'BACK' || action === 'HOTKEY_UNDO') {
                handleUndo();
            } else if (action === 'HOTKEY_YES') {
                handleAnswer('YES');
            } else if (action === 'HOTKEY_PROBABLY') {
                handleAnswer('PROBABLY');
            } else if (action === 'HOTKEY_NO') {
                handleAnswer('NO');
            } else if (action === 'HOTKEY_SKIP') {
                handleAnswer('DONT_KNOW');
            }
            return;
        }

        // Result Screen Controls
        if (currentScreen === 'RESULT') {
            const isHeroAction = focusedIndex >= 0 && focusedIndex <= 2;
            const isAltCard = focusedIndex >= 3;

            if (action === 'LEFT') {
                if (focusedIndex > 0) setFocus(focusedIndex - 1);
            } else if (action === 'RIGHT') {
                if (focusedIndex < focusableElements.length - 1) setFocus(focusedIndex + 1);
            } else if (action === 'DOWN') {
                if (isHeroAction && focusableElements.length > 3) {
                    setFocus(3);
                }
            } else if (action === 'UP') {
                if (isAltCard) {
                    setFocus(0);
                }
            } else if (action === 'SELECT') {
                const el = focusableElements[focusedIndex];
                if (!el) return;

                if (el.id === 'btn-prime') {
                    launchPrimeVideo();
                } else if (el.id === 'btn-trailer') {
                    openTrailer();
                } else if (el.id === 'btn-restart') {
                    if (window.soundFX) window.soundFX.playSelect();
                    initEngine();
                } else if (el.classList.contains('alt-card')) {
                    const altIdx = parseInt(el.getAttribute('data-alt-index'), 10);
                    if (recommendations[altIdx]) {
                        if (window.soundFX) window.soundFX.playSelect();
                        setActiveHero(recommendations[altIdx]);
                        setFocus(0);
                    }
                }
            } else if (action === 'BACK') {
                if (window.soundFX) window.soundFX.playSelect();
                initEngine();
            }
        }
    });

    // Dealbreaker Toggles
    if (dbRuntimeBtn) {
        dbRuntimeBtn.addEventListener('click', () => {
            dealbreakers.underTwoHours = !dealbreakers.underTwoHours;
            dbRuntimeBtn.classList.toggle('active', dealbreakers.underTwoHours);
            showToast(dealbreakers.underTwoHours ? "Filter: Under 2 Hours Active" : "Filter: Any Runtime");
            initEngine();
        });
    }

    if (dbFamilyBtn) {
        dbFamilyBtn.addEventListener('click', () => {
            dealbreakers.familySafe = !dealbreakers.familySafe;
            dbFamilyBtn.classList.toggle('active', dealbreakers.familySafe);
            showToast(dealbreakers.familySafe ? "Filter: Family Safe Active (No Horror)" : "Filter: All Content");
            initEngine();
        });
    }

    if (duoToggleBtn) {
        duoToggleBtn.addEventListener('click', () => {
            duoMode = !duoMode;
            duoToggleBtn.classList.toggle('active', duoMode);
            if (duoLabelEl) {
                duoLabelEl.innerText = duoMode ? '🎮 Couch Duo: ON' : '🎮 Solo Mode';
            }
            showToast(duoMode ? "Couch Duo Mode Enabled! Take turns with Player 2" : "Solo Mode Enabled");
            initEngine();
        });
    }

    // Direct Click Listeners
    document.getElementById('btn-yes')?.addEventListener('click', () => handleAnswer('YES'));
    document.getElementById('btn-probably')?.addEventListener('click', () => handleAnswer('PROBABLY'));
    document.getElementById('btn-skip')?.addEventListener('click', () => handleAnswer('DONT_KNOW'));
    document.getElementById('btn-unlikely')?.addEventListener('click', () => handleAnswer('UNLIKELY'));
    document.getElementById('btn-no')?.addEventListener('click', () => handleAnswer('NO'));
    document.getElementById('btn-undo')?.addEventListener('click', () => handleUndo());
    document.getElementById('btn-reset')?.addEventListener('click', () => initEngine());
    document.getElementById('btn-prime')?.addEventListener('click', () => launchPrimeVideo());
    document.getElementById('btn-trailer')?.addEventListener('click', () => openTrailer());
    document.getElementById('btn-restart')?.addEventListener('click', () => initEngine());
    btnCloseTrailer?.addEventListener('click', () => closeTrailer());

    // Audio Toggle
    const soundBtn = document.getElementById('sound-btn');
    if (soundBtn) {
        soundBtn.addEventListener('click', () => {
            if (window.soundFX) {
                window.soundFX.enabled = !window.soundFX.enabled;
                soundBtn.innerText = window.soundFX.enabled ? '🔊 Audio Feedback' : '🔇 Muted';
                showToast(window.soundFX.enabled ? 'Audio feedback enabled' : 'Audio muted');
            }
        });
    }

    // Start App on Load
    window.addEventListener('DOMContentLoaded', () => {
        initEngine();
    });

})();
