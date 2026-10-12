"""Build a reproducible environmental subset of SciQ (CC BY-NC 3.0)."""
import json, re, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent

TOPICS = {
    'Climate & air': r'climate|greenhouse|global warming|carbon dioxide|ozone|air pollut|atmospher|acid rain|fossil fuel',
    'Nature & biodiversity': r'ecosystem|biodiversity|habitat|food chain|food web|extinct|endangered|ecolog|invasive species|deforest|conservation|trophic|population growth|carrying capacity|biotic|abiotic|biome|predator|prey|symbios|mutualis|decompos|photosynth',
    'Water & oceans': r'water cycle|groundwater|watershed|aquifer|water pollut|eutrophic|ocean|freshwater|wetland|water conservation|runoff|evaporat|transpirat|precipitation|coral|marine|river|lake|hydrolog',
    'Energy & resources': r'renewable|solar energy|wind energy|geothermal|hydroelectric|natural resource|nonrenewable|coal|petroleum|natural gas|energy conservation|nuclear energy|biomass|sustainab',
    'Waste & pollution': r'pollut|recycl|landfill|wastewater|sewage|compost|pesticide|fertiliz|soil erosion|bioaccum|biomagnif|plastic|hazardous waste|solid waste',
}
seen, questions = set(), []
with zipfile.ZipFile(ROOT / 'data/SciQ.zip') as archive:
    name = next(n for n in archive.namelist() if n.endswith('train.json'))
    rows = json.loads(archive.read(name))
for i, row in enumerate(rows):
    question = row['question'].strip()
    # Reject incidental environmental keywords in anatomy/medical questions,
    # dated population statistics, and an observed misleading acid-rain item.
    if re.search(r'\b(body|bodily|blood|lungs?|alveol\w*|hair|fur|protein|organs?|cells?|stomach|muscles?|dna|rna|genes?|enzymes?|cancer|heart)\b', question, re.I):
        continue
    if re.search(r'currently|today|\d[\d,]* species|see figure|shown below|following diagram', question, re.I):
        continue
    if 'rain' in question.lower() and 'carbon dioxide dissolving' in question.lower():
        continue
    topic = next((name for name, pattern in TOPICS.items() if re.search(pattern, question, re.I)), None)
    if not topic or question.lower() in seen:
        continue
    choices = [row['correct_answer'], row['distractor1'], row['distractor2'], row['distractor3']]
    choices = [s.strip() for s in choices]
    if len(set(s.lower() for s in choices)) != 4 or not all(choices):
        continue
    support = re.sub(r'\s+', ' ', row['support']).strip()
    if not support:
        continue
    # Remove answer-bearing sentences from hints; never expose the answer through a clue.
    sentences = re.split(r'(?<=[.!?])\s+', support)
    safe = [s for s in sentences if not re.search(re.escape(choices[0]), s, re.I) and 35 <= len(s) <= 220]
    hint = next(iter(safe), f'Think about the underlying processes in {topic.lower()}. Read each option and rule out those that do not fit.')
    # Reading complexity is a heuristic, not a scientifically calibrated difficulty label.
    complexity = len(question.split()) + len(choices[0].split())
    difficulty = 'easy' if complexity <= 14 else 'medium' if complexity <= 23 else 'hard'
    questions.append({'id': f'sciq-{i}', 'question': question, 'choices': choices,
        'correct': 0, 'category': topic, 'difficulty': difficulty, 'hint': hint,
        'explanation': support, 'source': 'SciQ · Welbl, Liu & Gardner (2017)',
        'sourceUrl': 'https://huggingface.co/datasets/allenai/sciq'})
    seen.add(question.lower())
(ROOT / 'data/questions.json').write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Imported {len(questions)} unique questions from {len(rows)} SciQ training rows.')
for difficulty in ['easy', 'medium', 'hard']:
    print(difficulty, sum(q['difficulty'] == difficulty for q in questions))
for topic in TOPICS:
    print(topic, sum(q['category'] == topic for q in questions))
