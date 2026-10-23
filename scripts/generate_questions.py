"""
CineMatch Question Naturalizer (Enriched Edition)
Maps all 44+ features including decades, award tags, and tropes into natural TV-first Akinator questions.
"""

import json
import os

TAG_QUESTIONS_MAP = {
    # Genres
    "genre:action": "Are you in the mood for high-octane action, chases, or explosive stunts?",
    "genre:adventure": "Do you want to embark on an epic quest or thrilling expedition?",
    "genre:animation": "Are you looking for an animated visual masterpiece or anime?",
    "genre:comedy": "Are you looking for laughs, witty comedy, and a fun time?",
    "genre:crime": "Does the story dive into the criminal underworld, mobs, or detectives?",
    "genre:drama": "Are you in the mood for a deeply emotional, character-driven story?",
    "genre:family": "Is this for a wholesome movie night suitable for all ages?",
    "genre:fantasy": "Does the world feature magic, sorcery, or mythical kingdoms?",
    "genre:history": "Is the movie based around historical eras or pivotal real-life events?",
    "genre:horror": "Are you ready to be scared by terrifying or supernatural horrors?",
    "genre:mystery": "Does the plot revolve around a perplexing mystery waiting to be unraveled?",
    "genre:romance": "Is a passionate romance or love story at the core?",
    "genre:science fiction": "Are we dealing with futuristic technology, space, or alien worlds?",
    "genre:thriller": "Do you want a tense, edge-of-your-seat psychological ride?",
    "genre:war": "Is the backdrop a harrowing battlefield or wartime conflict?",
    "genre:western": "Is it set in the rugged frontier or Wild West?",
    
    # Decades
    "decade:classic_pre2000": "Was this film released before the year 2000 (a vintage cinematic classic)?",
    "decade:1990s": "Was this movie released during the 1990s?",
    "decade:2000s": "Was this movie released in the 2000s?",
    "decade:2010s": "Was this movie released between 2010 and 2019?",
    "decade:2020s": "Was this film made recently in the 2020s?",
    
    # Quality & Meta
    "meta:masterpiece": "Are you looking for a critically acclaimed masterpiece (rated 8.0+ on TMDB)?",
    "meta:female_lead": "Does the story center around a compelling female lead or heroine?",
    "theme:award_winner": "Did this film achieve major awards or prestigious festival recognition?",
    
    # Runtime
    "runtime:short_under2h": "Are you looking for a snappy, concise watch (under 110 minutes)?",
    "runtime:epic_long": "Are you ready for an epic, marathon cinematic journey (over 2 hours 25 minutes)?",
    
    # Themes & Tropes
    "theme:ai_robots": "Do artificial intelligence, androids, or sentient machines play a role?",
    "theme:aliens": "Does the story feature extraterrestrial beings or alien encounters?",
    "theme:animation_anime": "Is the visual style hand-drawn animation or stylized 3D?",
    "theme:based_on_true_story": "Is this film inspired by real-world history or true events?",
    "theme:dystopia": "Is society broken, ruled by an oppressive regime, or post-apocalyptic?",
    "theme:magic_fantasy": "Are there wizards, ancient spells, or supernatural enchantments?",
    "theme:monsters_creatures": "Do giant monsters, beasts, or creatures terrorize the world?",
    "theme:murder_mystery": "Is there a murder investigation or classic whodunit at play?",
    "theme:plot_twist": "Does the film feature a shocking plot twist or mind-bending reveal in the finale?",
    "theme:revenge": "Is the main character driven by relentless vengeance or payback?",
    "theme:romantic_love": "Is falling in love or a romantic relationship a major plotline?",
    "theme:space_exploration": "Are characters traveling through outer space, spaceships, or distant star systems?",
    "theme:spies_espionage": "Does the plot feature secret agents, undercover espionage, or assassins?",
    "theme:superhero": "Does the movie feature superheroes, comic book heroes, or superpowers?",
    "theme:survival": "Are the characters fighting against extreme odds just to stay alive?",
    "theme:time_travel": "Does someone alter the space-time continuum, jump eras, or get stuck in a time loop?",
    "theme:dark_psychological": "Does the story explore madness, psychological nightmares, or obsessive minds?",
    
    # Tones
    "tone:dark_intense": "Are you craving something gritty, dark, and psychologically intense?",
    "tone:family_friendly": "Do you want something warm, uplifting, and kid-safe?",
    "tone:humorous": "Does the film have plenty of humor, comedic timing, and charm?"
}

def fallback_question(tag: str) -> str:
    clean = tag.split(":")[-1].replace("_", " ").title()
    return f"Is {clean} an important theme in this movie?"

def generate_questions():
    matrix_file = os.path.join("data", "tmdb_movie_matrix.json")
    if not os.path.exists(matrix_file):
        print(f"Error: {matrix_file} not found.")
        return

    with open(matrix_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    vocab = data.get("metadata", {}).get("vocabulary", [])
    print(f"[*] Processing {len(vocab)} vocabulary tags...")

    questions_map = {}
    for tag in vocab:
        if tag in TAG_QUESTIONS_MAP:
            questions_map[tag] = TAG_QUESTIONS_MAP[tag]
        else:
            questions_map[tag] = fallback_question(tag)

    out_json = os.path.join("data", "questions.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(questions_map, f, indent=2, ensure_ascii=False)
    print(f"[✔] Saved questions to {out_json}")

    out_js = os.path.join("js", "questions_data.js")
    with open(out_js, "w", encoding="utf-8") as f:
        f.write("/* CineMatch Pre-Generated Natural Questions */\n")
        f.write("window.CINEMATCH_QUESTIONS = ")
        json.dump(questions_map, f, indent=2, ensure_ascii=False)
        f.write(";\n")
    print(f"[✔] Saved JS question definitions to {out_js}")

if __name__ == "__main__":
    generate_questions()
