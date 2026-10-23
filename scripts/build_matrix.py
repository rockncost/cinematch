"""
CineMatch TMDB Matrix Builder (Enhanced Bayesian Version)
Fetches top popular and critically acclaimed movies from TMDB.
Builds the enriched feature matrix with decades, award tags, masterpieces, and micro-traits.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

TMDB_API_KEY = "165ef24a875a77eb486a47a078cead66"
BASE_URL = "https://api.themoviedb.org/3"

# Curated semantic micro-themes and iconic tropes
CURATED_KEYWORDS_MAP = {
    "superhero": ["superhero", "comic book", "marvel cinematic universe", "dc extended universe", "super power", "mutant"],
    "time_travel": ["time travel", "time loop", "alternate timeline", "future"],
    "space_exploration": ["space travel", "outer space", "astronaut", "spaceship", "planet", "galaxy"],
    "aliens": ["alien", "extraterrestrial", "alien invasion"],
    "plot_twist": ["twist ending", "plot twist", "surprise ending", "psychological", "mind twist"],
    "dystopia": ["dystopia", "post-apocalyptic", "apocalypse", "cyberpunk", "future society"],
    "murder_mystery": ["murder mystery", "whodunit", "detective", "investigation", "crime investigation"],
    "heist": ["heist", "robbery", "bank robbery", "caper"],
    "magic_fantasy": ["magic", "wizard", "witch", "sorcery", "mythical creature", "dragon"],
    "ai_robots": ["artificial intelligence", "robot", "cyborg", "android", "sentient ai"],
    "survival": ["survival", "stranded", "wilderness", "isolated", "desert island"],
    "revenge": ["revenge", "vendetta", "retaliation"],
    "based_on_true_story": ["based on true story", "biography", "historical", "real events"],
    "animation_anime": ["anime", "animation", "hand drawn anime", "cgi animation"],
    "spies_espionage": ["secret agent", "spy", "espionage", "assassin", "undercover"],
    "monsters_creatures": ["monster", "creature", "giant monster", "kaiju", "zombie", "vampire", "ghost"],
    "underdog_sports": ["underdog", "sports", "boxing", "training", "championship"],
    "romantic_love": ["love", "romance", "romantic comedy", "falling in love", "heartbreak"],
    "female_lead": ["female protagonist", "heroine", "female lead", "strong female lead"],
    "award_winner": ["oscar", "academy award", "cannes", "palme d'or", "golden globe", "bafta"],
    "dark_psychological": ["insomnia", "psychopath", "cult", "nightmare", "madness", "hallucination"]
}

def api_get(endpoint, params=None):
    if params is None:
        params = {}
    params["api_key"] = TMDB_API_KEY
    query_str = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{BASE_URL}{endpoint}?{query_str}"
    
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "CineMatch-FireTV/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return None

def fetch_movie_details(movie_id):
    """Fetches full movie details including keywords and trailers in 1 call."""
    return api_get(f"/movie/{movie_id}", {"append_to_response": "keywords,videos"})

def build_dataset(target_movie_count=160):
    print(f"[*] Starting Enhanced TMDB ingestion (target: {target_movie_count} movies)...")
    
    # 1. Fetch genre definitions
    genre_data = api_get("/genre/movie/list", {"language": "en-US"})
    genres = {g["id"]: g["name"] for g in genre_data.get("genres", [])}
    print(f"[+] Loaded {len(genres)} genre definitions.")

    # 2. Collect popular and top-rated movie IDs (giving high weight to top rated masterpieces)
    movie_candidates = {}
    
    # Top Rated Pages to guarantee acclaimed cinema classics
    for page in range(1, 6):
        top = api_get("/movie/top_rated", {"page": page, "language": "en-US"})
        if top and "results" in top:
            for m in top["results"]:
                if m.get("backdrop_path") and m.get("poster_path") and m.get("overview"):
                    movie_candidates[m["id"]] = m
        time.sleep(0.08)

    # Top Popular Pages for current trending films
    for page in range(1, 6):
        pop = api_get("/movie/popular", {"page": page, "language": "en-US"})
        if pop and "results" in pop:
            for m in pop["results"]:
                if m.get("backdrop_path") and m.get("poster_path") and m.get("overview"):
                    movie_candidates[m["id"]] = m
        time.sleep(0.08)

    candidate_ids = list(movie_candidates.keys())[:target_movie_count]
    print(f"[+] Gathering deep metadata (keywords, trailers, runtime) for {len(candidate_ids)} titles...")

    detailed_movies = []
    
    with ThreadPoolExecutor(max_workers=6) as executor:
        future_to_id = {executor.submit(fetch_movie_details, mid): mid for mid in candidate_ids}
        done_count = 0
        for future in as_completed(future_to_id):
            mid = future_to_id[future]
            try:
                data = future.result()
                if data and data.get("title") and data.get("poster_path"):
                    detailed_movies.append(data)
            except Exception:
                pass
            done_count += 1
            if done_count % 30 == 0 or done_count == len(candidate_ids):
                print(f"    Progress: {done_count}/{len(candidate_ids)} movies fetched...")
            time.sleep(0.03)

    print(f"[+] Successfully gathered details for {len(detailed_movies)} movies.")

    # 3. Extract deep features and build matrix
    processed_movies = []
    all_features_count = {}

    for m in detailed_movies:
        movie_id = m["id"]
        title = m["title"]
        overview = m.get("overview", "")
        release_date = m.get("release_date", "")
        release_year = release_date.split("-")[0] if release_date else ""
        vote_avg = round(m.get("vote_average", 0.0), 1)
        runtime = m.get("runtime") or 110
        popularity = m.get("popularity", 0.0)
        
        poster = f"https://image.tmdb.org/t/p/w500{m['poster_path']}"
        backdrop = f"https://image.tmdb.org/t/p/w1280{m['backdrop_path']}" if m.get("backdrop_path") else poster
        
        # Trailer key
        trailer_key = None
        videos = m.get("videos", {}).get("results", [])
        for v in videos:
            if v.get("site") == "YouTube" and v.get("type") == "Trailer":
                trailer_key = v.get("key")
                break
        if not trailer_key and videos:
            trailer_key = videos[0].get("key")

        # Genres
        movie_genres = [g["name"] for g in m.get("genres", [])]
        kw_list = [k["name"].lower().strip() for k in m.get("keywords", {}).get("keywords", [])]

        features = set()

        # Genre tags
        for g in movie_genres:
            features.add(f"genre:{g.lower()}")

        # Semantic Curated Theme tags
        combined_text = (overview + " " + " ".join(kw_list)).lower()
        for theme_key, triggers in CURATED_KEYWORDS_MAP.items():
            if any(tr in kw_list or f" {tr} " in f" {combined_text} " for tr in triggers):
                features.add(f"theme:{theme_key}")

        # Decades
        try:
            year_int = int(release_year)
            if year_int >= 2020:
                features.add("decade:2020s")
            elif year_int >= 2010:
                features.add("decade:2010s")
            elif year_int >= 2000:
                features.add("decade:2000s")
            elif year_int >= 1990:
                features.add("decade:1990s")
            else:
                features.add("decade:classic_pre2000")
        except:
            pass

        # Critical Acclaim / Masterpiece
        if vote_avg >= 8.0:
            features.add("meta:masterpiece")

        # Runtime tags
        if runtime <= 110:
            features.add("runtime:short_under2h")
        elif runtime >= 145:
            features.add("runtime:epic_long")

        # Family / Tone
        if "Animation" in movie_genres or "Family" in movie_genres:
            features.add("tone:family_friendly")
        
        if "Horror" in movie_genres or "Crime" in movie_genres or "Thriller" in movie_genres:
            features.add("tone:dark_intense")
            
        if "Comedy" in movie_genres:
            features.add("tone:humorous")

        for f in features:
            all_features_count[f] = all_features_count.get(f, 0) + 1

        processed_movies.append({
            "id": movie_id,
            "title": title,
            "release_year": release_year,
            "runtime": runtime,
            "vote_average": vote_avg,
            "popularity": popularity,
            "overview": overview,
            "genres": movie_genres,
            "poster_path": poster,
            "backdrop_path": backdrop,
            "trailer_key": trailer_key,
            "raw_features": list(features)
        })

    # Filter features: only keep discriminative features
    total_m = len(processed_movies)
    vocabulary = [
        f for f, count in all_features_count.items()
        if count >= 3 and count <= (total_m * 0.90)
    ]
    vocabulary.sort()
    print(f"[+] Selected {len(vocabulary)} discriminative features across {total_m} movies.")

    # Create binary feature matrix
    final_movies = []
    for m in processed_movies:
        raw_set = set(m["raw_features"])
        binary_dict = {f: (1 if f in raw_set else 0) for f in vocabulary}
        m_copy = dict(m)
        del m_copy["raw_features"]
        m_copy["features"] = binary_dict
        final_movies.append(m_copy)

    output_payload = {
        "metadata": {
            "total_movies": len(final_movies),
            "total_features": len(vocabulary),
            "vocabulary": vocabulary,
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S")
        },
        "movies": final_movies
    }

    # Save to data/tmdb_movie_matrix.json
    os.makedirs("data", exist_ok=True)
    json_path = os.path.join("data", "tmdb_movie_matrix.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, indent=2, ensure_ascii=False)
    print(f"[✔] Successfully saved matrix dataset to {json_path}")

    # Also save as standalone JavaScript bundle
    os.makedirs("js", exist_ok=True)
    js_path = os.path.join("js", "tmdb_dataset.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("/* CineMatch TMDB Dataset - Auto-generated for Fire TV Hackathon */\n")
        f.write("window.CINEMATCH_DATASET = ")
        json.dump(output_payload, f, ensure_ascii=False)
        f.write(";\n")
    print(f"[✔] Successfully generated frontend bundle at {js_path}")

    return output_payload

if __name__ == "__main__":
    count = 160
    if len(sys.argv) > 1:
        count = int(sys.argv[1])
    build_dataset(count)
