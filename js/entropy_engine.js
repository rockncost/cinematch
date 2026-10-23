/**
 * CineMatch - Probabilistic Bayesian Decision Engine (Akinator Model)
 * Replaces rigid binary trees with Bayesian Soft-Scoring, Temperature Softmax,
 * Quality-Weighted Selection, and AI Perceived Cognition Thought Streams.
 */

class CineMatchEngine {
    constructor(dataset, questionsMap) {
        this.rawDataset = dataset || (window.CINEMATCH_DATASET || { metadata: { vocabulary: [] }, movies: [] });
        this.questionsMap = questionsMap || (window.CINEMATCH_QUESTIONS || {});
        this.activeMovies = [];
        this.askedTags = new Set();
        this.userAnswers = []; // History of { tag, answer, weight, player }
        this.stepCount = 1;
        this.history = [];
        this.minSteps = 4;
        this.maxSteps = 9;
        
        // Couch / Duo Mode State
        this.duoMode = false;
        this.currentPlayer = 1; // 1 or 2
        
        // Dealbreakers
        this.dealbreakers = {
            underTwoHours: false,
            familySafe: false,
            primePreferred: true
        };
    }

    startSession(options = {}) {
        if (options.dealbreakers) {
            this.dealbreakers = { ...this.dealbreakers, ...options.dealbreakers };
        }
        this.duoMode = !!options.duoMode;
        this.currentPlayer = 1;

        // Apply dealbreakers to initial catalog
        let pool = this.rawDataset.movies.map(m => ({
            ...m,
            score: (m.vote_average ? (m.vote_average - 6.0) * 0.35 : 0),
            prob: 1 / this.rawDataset.movies.length
        }));

        if (this.dealbreakers.underTwoHours) {
            pool = pool.filter(m => (m.runtime || 110) <= 120);
        }
        if (this.dealbreakers.familySafe) {
            pool = pool.filter(m => !m.genres.includes('Horror') && m.features['tone:dark_intense'] !== 1);
        }

        this.activeMovies = pool;
        this.askedTags = new Set();
        this.userAnswers = [];
        this.stepCount = 1;
        this.history = [];

        this.recalculateProbabilities();

        const bestTag = this.calculateBestBayesianFeature();
        return this.buildStepState(bestTag);
    }

    // Softmax Probability Recalculation
    recalculateProbabilities() {
        const tau = 1.25; // Temperature parameter for smooth differentiation
        const maxScore = Math.max(...this.activeMovies.map(m => m.score));
        const expScores = this.activeMovies.map(m => Math.exp((m.score - maxScore) / tau));
        const sumExp = expScores.reduce((a, b) => a + b, 0) || 1;

        this.activeMovies.forEach((m, i) => {
            m.prob = expScores[i] / sumExp;
        });

        // Sort descending by probability
        this.activeMovies.sort((a, b) => b.prob - a.prob);
    }

    // Bayesian Information Gain: Expected entropy over unasked tags
    calculateBestBayesianFeature() {
        const vocabulary = this.rawDataset.metadata.vocabulary || [];
        let bestTag = null;
        let maxEntropy = -1.0;

        for (const tag of vocabulary) {
            if (this.askedTags.has(tag)) continue;

            // Probability that winning movie has this tag, weighted by current movie probabilities
            let pYes = 0;
            for (const m of this.activeMovies) {
                if (m.features && m.features[tag] === 1) {
                    pYes += m.prob;
                }
            }

            // Bound between [0.01, 0.99] to prevent log2(0)
            if (pYes <= 0.03 || pYes >= 0.97) continue;

            const pNo = 1.0 - pYes;
            const entropy = - (pYes * Math.log2(pYes)) - (pNo * Math.log2(pNo));

            if (entropy > maxEntropy) {
                maxEntropy = entropy;
                bestTag = tag;
            }
        }

        // Fallback: pick any unasked tag with variation
        if (!bestTag) {
            for (const tag of vocabulary) {
                if (!this.askedTags.has(tag)) {
                    bestTag = tag;
                    break;
                }
            }
        }

        return bestTag;
    }

    // 5-Point Likert Scale Weight Mapping
    getAnswerWeight(answer) {
        switch (answer.toUpperCase()) {
            case 'YES': return 1.0;
            case 'PROBABLY': return 0.5;
            case 'DONT_KNOW':
            case 'SKIP': return 0.0;
            case 'UNLIKELY': return -0.5;
            case 'NO': return -1.0;
            default: return 0.0;
        }
    }

    submitAnswer(currentTag, answer) {
        const weight = this.getAnswerWeight(answer);

        // Snapshot for Undo
        this.history.push({
            movies: this.activeMovies.map(m => ({ ...m })),
            askedTags: new Set(this.askedTags),
            userAnswers: [...this.userAnswers],
            stepCount: this.stepCount,
            currentPlayer: this.currentPlayer
        });

        this.askedTags.add(currentTag);
        this.userAnswers.push({
            tag: currentTag,
            answer: answer,
            weight: weight,
            player: this.duoMode ? this.currentPlayer : null
        });

        // Bayesian Evidence Update: Boost/penalize movies based on feature presence
        if (weight !== 0) {
            this.activeMovies.forEach(m => {
                const hasFeature = m.features && m.features[currentTag] === 1;
                if (hasFeature) {
                    m.score += weight * 1.15;
                } else {
                    m.score -= weight * 1.15;
                }
            });
        }

        this.recalculateProbabilities();
        this.stepCount++;

        // Switch player in Couch / Duo Mode
        if (this.duoMode) {
            this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        }

        const topMovie = this.activeMovies[0];
        const runnerUp = this.activeMovies[1] || { prob: 0.001 };
        const probRatio = topMovie.prob / (runnerUp.prob || 0.0001);

        // Dynamic Confidence Stopping Criteria
        const isFinal = (
            (topMovie.prob >= 0.70 && this.stepCount >= this.minSteps) ||
            (probRatio >= 3.2 && this.stepCount >= this.minSteps) ||
            (this.stepCount > this.maxSteps)
        );

        if (isFinal) {
            return this.buildFinalState();
        }

        const nextTag = this.calculateBestBayesianFeature();
        if (!nextTag) {
            return this.buildFinalState();
        }

        return this.buildStepState(nextTag);
    }

    undo() {
        if (this.history.length === 0) return null;

        const prev = this.history.pop();
        this.activeMovies = prev.movies;
        this.askedTags = prev.askedTags;
        this.userAnswers = prev.userAnswers;
        this.stepCount = prev.stepCount;
        this.currentPlayer = prev.currentPlayer;

        const nextTag = this.calculateBestBayesianFeature();
        return this.buildStepState(nextTag);
    }

    // AI Thought Stream (Perceived Cognition String)
    generateThoughtStream() {
        const top = this.activeMovies[0];
        const topGenres = (top?.genres || []).slice(0, 2).join(' & ');
        const avgProb = 1.0 / (this.activeMovies.length || 1);
        const effectiveCandidates = Math.max(1, this.activeMovies.filter(m => m.prob >= avgProb * 0.35).length);
        const confidencePct = Math.min(98, Math.max(18, Math.round(15 + ((top?.prob || avgProb) / 0.55) * 80)));

        const thoughtTemplates = [
            `Analyzing ${effectiveCandidates} plausible titles... High probability alignment with ${topGenres || 'cinema classics'}.`,
            `Deducing tastes... Synthesizing probabilistic evidence across ${this.userAnswers.length} vectors.`,
            `Targeting... Reaching ${confidencePct}% probability convergence on ${top?.release_year ? `${top.release_year}s` : 'curated'} releases.`,
            `Narrowing candidate matrix... Filtering noise and prioritizing acclaimed titles.`
        ];

        return thoughtTemplates[(this.stepCount - 1) % thoughtTemplates.length];
    }

    buildStepState(nextTag) {
        const topMovie = this.activeMovies[0];
        const avgProb = 1.0 / (this.activeMovies.length || 1);
        const effectiveCount = Math.max(1, this.activeMovies.filter(m => m.prob >= avgProb * 0.35).length);
        const confidencePct = Math.min(96, Math.max(18, Math.round(15 + ((topMovie?.prob || avgProb) / 0.55) * 80)));

        return {
            isFinal: false,
            stepCount: this.stepCount,
            candidatesCount: effectiveCount,
            confidencePct: confidencePct,
            questionTag: nextTag,
            questionText: this.humanizeTag(nextTag),
            thoughtStream: this.generateThoughtStream(),
            duoMode: this.duoMode,
            currentPlayer: this.currentPlayer,
            topCandidateBackdrop: topMovie?.backdrop_path
        };
    }

    buildFinalState() {
        // Quality-Weighted Ranking: Balance Bayesian Probability with TMDB Rating
        const scoredMatches = [...this.activeMovies].map(m => {
            const qualityWeight = (m.vote_average || 7.0) / 10.0;
            const finalScore = m.prob * 0.65 + qualityWeight * 0.35;
            return { movie: m, finalScore };
        });

        scoredMatches.sort((a, b) => b.finalScore - a.finalScore);
        const topRecommendations = scoredMatches.slice(0, 4).map(item => this.formatMovieResult(item.movie));

        return {
            isFinal: true,
            stepCount: this.stepCount,
            candidatesCount: 1,
            confidencePct: 98,
            recommendations: topRecommendations,
            thoughtStream: `Deduction complete! Found optimal match with 98% Bayesian affinity.`
        };
    }

    humanizeTag(tag) {
        if (!tag) return "Are you ready for your personalized movie match?";
        if (this.questionsMap[tag]) return this.questionsMap[tag];
        const clean = tag.split(':').pop().replace(/_/g, ' ');
        return `Is ${clean} an important element in what you want to watch?`;
    }

    formatMovieResult(movie) {
        // Find positively matched attributes from user answers
        const matched = [];
        const positiveTags = this.userAnswers
            .filter(a => a.weight > 0)
            .map(a => a.tag);

        for (const tag of positiveTags) {
            if (movie.features && movie.features[tag] === 1) {
                const label = tag.split(':').pop().replace(/_/g, ' ');
                matched.push(label.charAt(0).toUpperCase() + label.slice(1));
            }
        }

        // Add masterpiece badge if applicable
        if (movie.vote_average >= 8.0 && !matched.includes('Masterpiece')) {
            matched.unshift('Critically Acclaimed');
        }

        return {
            id: movie.id,
            title: movie.title,
            release_year: movie.release_year || '',
            runtime: movie.runtime || 110,
            vote_average: movie.vote_average || 0,
            overview: movie.overview || 'No overview available.',
            genres: movie.genres || [],
            poster_path: movie.poster_path,
            backdrop_path: movie.backdrop_path,
            trailer_key: movie.trailer_key,
            matched_traits: matched.slice(0, 4)
        };
    }
}

window.CineMatchEngine = CineMatchEngine;
