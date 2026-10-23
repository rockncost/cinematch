"""
CineMatch - Fire TV Bayesian Recommendation Engine
FastAPI backend implementing Probabilistic Soft-Scoring, Temperature Softmax,
Quality-Weighted TMDB Selection, and AI Thought Streams.
"""

import json
import math
import os
import uuid
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI(
    title="CineMatch - Bayesian Fire TV Engine",
    description="Akinator-style probabilistic movie discovery engine for Amazon Fire TV",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATASET: dict = {}
QUESTION_MAP: dict = {}
SESSIONS: Dict[str, dict] = {}

class Dealbreakers(BaseModel):
    under_two_hours: bool = False
    family_safe: bool = False
    prime_preferred: bool = True

class StartSessionRequest(BaseModel):
    duo_mode: bool = False
    dealbreakers: Optional[Dealbreakers] = None

class StartSessionResponse(BaseModel):
    session_id: str
    candidates_count: int
    question_tag: str
    question_text: str
    thought_stream: str
    step_count: int
    confidence_pct: int
    duo_mode: bool
    current_player: int

class AnswerRequest(BaseModel):
    session_id: str
    tag: str
    answer: str  # "YES", "PROBABLY", "DONT_KNOW", "UNLIKELY", "NO"

class MovieResult(BaseModel):
    id: int
    title: str
    release_year: Optional[str] = ""
    runtime: Optional[int] = 110
    vote_average: Optional[float] = 0.0
    overview: str
    genres: Optional[List[str]] = []
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    trailer_key: Optional[str] = None
    matched_traits: Optional[List[str]] = []

class StepResponse(BaseModel):
    session_id: str
    is_final: bool
    candidates_count: int
    step_count: int
    confidence_pct: int
    thought_stream: str
    duo_mode: bool
    current_player: int
    question_tag: Optional[str] = None
    question_text: Optional[str] = None
    recommendations: Optional[List[MovieResult]] = None

def load_data():
    global DATASET, QUESTION_MAP
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    matrix_file = os.path.join(base_dir, "data", "tmdb_movie_matrix.json")
    questions_file = os.path.join(base_dir, "data", "questions.json")

    if not os.path.exists(matrix_file):
        raise RuntimeError(f"Dataset matrix not found at {matrix_file}! Run scripts/build_matrix.py first.")

    with open(matrix_file, "r", encoding="utf-8") as f:
        DATASET = json.load(f)

    if os.path.exists(questions_file):
        with open(questions_file, "r", encoding="utf-8") as f:
            QUESTION_MAP = json.load(f)
    else:
        QUESTION_MAP = {}

    print(f"[*] CineMatch Bayesian Engine ready: Loaded {DATASET['metadata']['total_movies']} movies, "
          f"{DATASET['metadata']['total_features']} features.")

load_data()

@app.on_event("startup")
def startup_event():
    if not DATASET:
        load_data()

def humanize_tag(tag: str) -> str:
    if tag in QUESTION_MAP:
        return QUESTION_MAP[tag]
    clean = tag.split(":")[-1].replace("_", " ").title()
    return f"Is {clean} an important theme in this movie?"

def get_answer_weight(ans: str) -> float:
    mapping = {
        "YES": 1.0,
        "PROBABLY": 0.5,
        "DONT_KNOW": 0.0,
        "SKIP": 0.0,
        "UNLIKELY": -0.5,
        "NO": -1.0
    }
    return mapping.get(ans.upper(), 0.0)

def recalculate_probabilities(movies: List[dict]):
    tau = 1.25
    max_score = max(m["score"] for m in movies)
    exp_scores = [math.exp((m["score"] - max_score) / tau) for m in movies]
    sum_exp = sum(exp_scores) or 1.0

    for i, m in enumerate(movies):
        m["prob"] = exp_scores[i] / sum_exp

    movies.sort(key=lambda x: x["prob"], reverse=True)

def calculate_best_bayesian_feature(movies: List[dict], asked_tags: set) -> Optional[str]:
    vocabulary = DATASET["metadata"]["vocabulary"]
    best_tag = None
    max_entropy = -1.0

    for tag in vocabulary:
        if tag in asked_tags:
            continue

        p_yes = sum(m["prob"] for m in movies if m.get("features", {}).get(tag, 0) == 1)

        if p_yes <= 0.03 or p_yes >= 0.97:
            continue

        p_no = 1.0 - p_yes
        entropy = - (p_yes * math.log2(p_yes)) - (p_no * math.log2(p_no))

        if entropy > max_entropy:
            max_entropy = entropy
            best_tag = tag

    if not best_tag:
        for tag in vocabulary:
            if tag not in asked_tags:
                return tag

    return best_tag

def generate_thought_stream(movies: List[dict], user_answers: List[dict], step: int) -> str:
    top = movies[0]
    top_genres = " & ".join(top.get("genres", [])[:2])
    avg_prob = 1.0 / (len(movies) or 1)
    effective_count = max(1, sum(1 for m in movies if m["prob"] >= avg_prob * 0.35))
    conf = min(98, max(18, round(15 + (top.get("prob", avg_prob) / 0.55) * 80)))

    templates = [
        f"Analyzing {effective_count} plausible titles... High probability alignment with {top_genres or 'cinema'}.",
        f"Deducing tastes... Synthesizing probabilistic evidence across {len(user_answers)} vectors.",
        f"Targeting... Reaching {conf}% probability convergence on curated releases.",
        f"Narrowing candidate matrix... Filtering noise and prioritizing acclaimed titles."
    ]
    return templates[(step - 1) % len(templates)]

def build_movie_result(movie: dict, user_positive_tags: List[str]) -> MovieResult:
    matched = []
    for tag in user_positive_tags:
        if movie.get("features", {}).get(tag, 0) == 1:
            clean = tag.split(":")[-1].replace("_", " ").title()
            matched.append(clean)

    if movie.get("vote_average", 0) >= 8.0 and "Masterpiece" not in matched:
        matched.insert(0, "Critically Acclaimed")

    return MovieResult(
        id=movie["id"],
        title=movie["title"],
        release_year=str(movie.get("release_year", "")),
        runtime=movie.get("runtime", 110),
        vote_average=movie.get("vote_average", 0.0),
        overview=movie.get("overview", ""),
        genres=movie.get("genres", []),
        poster_path=movie.get("poster_path"),
        backdrop_path=movie.get("backdrop_path"),
        trailer_key=movie.get("trailer_key"),
        matched_traits=matched[:4]
    )

@app.post("/api/session/start", response_model=StartSessionResponse)
def start_session(payload: Optional[StartSessionRequest] = None):
    session_id = str(uuid.uuid4())
    
    # Initialize active movie pool with quality priors
    pool = []
    for m in DATASET["movies"]:
        m_copy = dict(m)
        vote = m.get("vote_average", 7.0)
        m_copy["score"] = (vote - 6.0) * 0.35
        m_copy["prob"] = 1.0 / len(DATASET["movies"])
        pool.append(m_copy)

    duo_mode = payload.duo_mode if payload else False
    if payload and payload.dealbreakers:
        if payload.dealbreakers.under_two_hours:
            pool = [m for m in pool if m.get("runtime", 110) <= 120]
        if payload.dealbreakers.family_safe:
            pool = [m for m in pool if "Horror" not in m.get("genres", []) and m.get("features", {}).get("tone:dark_intense", 0) != 1]

    asked_tags = set()
    recalculate_probabilities(pool)
    first_tag = calculate_best_bayesian_feature(pool, asked_tags)

    SESSIONS[session_id] = {
        "movies": pool,
        "asked_tags": asked_tags,
        "user_answers": [],
        "step_count": 1,
        "duo_mode": duo_mode,
        "current_player": 1,
        "history": []
    }

    avg_prob = 1.0 / (len(pool) or 1)
    effective_count = max(1, sum(1 for m in pool if m["prob"] >= avg_prob * 0.35))
    conf = min(96, max(18, round(15 + (pool[0]["prob"] / 0.55) * 80)))

    return StartSessionResponse(
        session_id=session_id,
        candidates_count=effective_count,
        question_tag=first_tag,
        question_text=humanize_tag(first_tag),
        thought_stream=generate_thought_stream(pool, [], 1),
        step_count=1,
        confidence_pct=conf,
        duo_mode=duo_mode,
        current_player=1
    )

@app.post("/api/session/answer", response_model=StepResponse)
def submit_answer(payload: AnswerRequest):
    if payload.session_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found.")

    session = SESSIONS[payload.session_id]
    movies = session["movies"]
    asked_tags = session["asked_tags"]
    current_tag = payload.tag
    weight = get_answer_weight(payload.answer)

    # Save state for undo
    session["history"].append({
        "movies": [dict(m) for m in movies],
        "asked_tags": set(asked_tags),
        "user_answers": list(session["user_answers"]),
        "step_count": session["step_count"],
        "current_player": session["current_player"]
    })

    asked_tags.add(current_tag)
    session["user_answers"].append({"tag": current_tag, "weight": weight})

    if weight != 0:
        for m in movies:
            has_feature = m.get("features", {}).get(current_tag, 0) == 1
            if has_feature:
                m["score"] += weight * 1.15
            else:
                m["score"] -= weight * 1.15

    recalculate_probabilities(movies)
    session["step_count"] += 1

    if session["duo_mode"]:
        session["current_player"] = 2 if session["current_player"] == 1 else 1

    top_movie = movies[0]
    runner_up = movies[1] if len(movies) > 1 else {"prob": 0.001}
    prob_ratio = top_movie["prob"] / (runner_up["prob"] or 0.0001)

    # Dynamic stopping
    MIN_STEPS = 4
    MAX_STEPS = 9
    is_final = (
        (top_movie["prob"] >= 0.70 and session["step_count"] >= MIN_STEPS) or
        (prob_ratio >= 3.2 and session["step_count"] >= MIN_STEPS) or
        (session["step_count"] > MAX_STEPS)
    )

    if is_final:
        # Quality-weighted ranking
        scored = []
        for m in movies:
            q = (m.get("vote_average", 7.0)) / 10.0
            final_score = m["prob"] * 0.65 + q * 0.35
            scored.append((final_score, m))
        scored.sort(key=lambda x: x[0], reverse=True)

        positive_tags = [a["tag"] for a in session["user_answers"] if a["weight"] > 0]
        recs = [build_movie_result(m, positive_tags) for _, m in scored[:4]]

        del SESSIONS[payload.session_id]

        return StepResponse(
            session_id=payload.session_id,
            is_final=True,
            candidates_count=1,
            step_count=session["step_count"],
            confidence_pct=98,
            thought_stream="Deduction complete! Found optimal match with 98% Bayesian affinity.",
            duo_mode=session["duo_mode"],
            current_player=session["current_player"],
            recommendations=recs
        )

    next_tag = calculate_best_bayesian_feature(movies, asked_tags)
    avg_prob = 1.0 / (len(movies) or 1)
    effective_count = max(1, sum(1 for m in movies if m["prob"] >= avg_prob * 0.35))
    conf = min(96, max(18, round(15 + (top_movie["prob"] / 0.55) * 80)))

    return StepResponse(
        session_id=payload.session_id,
        is_final=False,
        candidates_count=effective_count,
        step_count=session["step_count"],
        confidence_pct=conf,
        thought_stream=generate_thought_stream(movies, session["user_answers"], session["step_count"]),
        duo_mode=session["duo_mode"],
        current_player=session["current_player"],
        question_tag=next_tag,
        question_text=humanize_tag(next_tag)
    )

@app.post("/api/session/undo")
def undo_step(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found.")
    session = SESSIONS[session_id]
    if not session["history"]:
        raise HTTPException(status_code=400, detail="Cannot undo initial step.")

    prev = session["history"].pop()
    session["movies"] = prev["movies"]
    session["asked_tags"] = prev["asked_tags"]
    session["user_answers"] = prev["user_answers"]
    session["step_count"] = prev["step_count"]
    session["current_player"] = prev["current_player"]

    next_tag = calculate_best_bayesian_feature(session["movies"], session["asked_tags"])
    effective_count = sum(1 for m in session["movies"] if m["prob"] > 0.015)

    return {
        "status": "undone",
        "candidates_count": effective_count,
        "step_count": session["step_count"],
        "question_tag": next_tag,
        "question_text": humanize_tag(next_tag),
        "thought_stream": generate_thought_stream(session["movies"], session["user_answers"], session["step_count"]),
        "current_player": session["current_player"]
    }

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app.mount("/css", StaticFiles(directory=os.path.join(base_dir, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(base_dir, "js")), name="js")
app.mount("/assets", StaticFiles(directory=os.path.join(base_dir, "assets")), name="assets")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(base_dir, "index.html"))
