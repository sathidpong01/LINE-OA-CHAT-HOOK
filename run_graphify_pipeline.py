import json, sys
from graphify.detect import detect
from graphify.extract import collect_files, extract
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json
from pathlib import Path

ROOT = Path('d:/OA CHAT HOOK')
OUT  = ROOT / 'graphify-out'
OUT.mkdir(exist_ok=True)

# Step 1: Detect
print("=== Step 1: Detecting files ===")
result = detect(ROOT)
(OUT / '.graphify_detect.json').write_text(json.dumps(result))
files = result['files']
print(f"Corpus: {result['total_files']} files / ~{result['total_words']:,} words")
print(f"  code: {len(files.get('code', []))} files")
print(f"  docs: {len(files.get('document', []))} files")

# Step 2: AST extraction (code files only)
print("\n=== Step 2: AST Extraction ===")
code_files = [Path(f) for f in files.get('code', [])
              if 'run-graphify.py' not in f
              and 'run_full_graphify.py' not in f
              and 'run_graphify_pipeline.py' not in f]
if code_files:
    ast_result = extract(code_files, cache_root=OUT)
else:
    ast_result = {'nodes': [], 'edges': [], 'input_tokens': 0, 'output_tokens': 0}
(OUT / '.graphify_ast.json').write_text(json.dumps(ast_result, indent=2))
print(f"AST: {len(ast_result['nodes'])} nodes, {len(ast_result['edges'])} edges")

# Step 3: Load existing semantic (no LLM needed - reuse cached)
print("\n=== Step 3: Loading semantic cache ===")
sem_path = OUT / '.graphify_semantic.json'
if sem_path.exists():
    sem_result = json.loads(sem_path.read_text())
    print(f"Semantic (cached): {len(sem_result['nodes'])} nodes, {len(sem_result['edges'])} edges")
else:
    sem_result = {'nodes': [], 'edges': [], 'hyperedges': [], 'input_tokens': 0, 'output_tokens': 0}
    print("No semantic cache found - using AST only")

# Step 4: Merge
seen = {n['id'] for n in ast_result['nodes']}
merged_nodes = list(ast_result['nodes'])
for n in sem_result['nodes']:
    if n['id'] not in seen:
        merged_nodes.append(n)
        seen.add(n['id'])
merged = {
    'nodes': merged_nodes,
    'edges': ast_result['edges'] + sem_result['edges'],
    'hyperedges': sem_result.get('hyperedges', []),
    'input_tokens': sem_result.get('input_tokens', 0),
    'output_tokens': sem_result.get('output_tokens', 0),
}
(OUT / '.graphify_extract.json').write_text(json.dumps(merged, indent=2))
print(f"\n=== Step 4: Merged: {len(merged_nodes)} nodes, {len(merged['edges'])} edges ===")

# Step 5: Build graph + cluster
print("\n=== Step 5: Building graph & clustering ===")
G = build_from_json(merged)
communities = cluster(G)
cohesion = score_all(G, communities)
gods = god_nodes(G)
surprises = surprising_connections(G, communities)
tokens = {'input': merged.get('input_tokens', 0), 'output': merged.get('output_tokens', 0)}

labels = {
    0: 'Supabase Webhook & Database',
    1: 'NAS Sync & Storage',
    2: 'Project Architecture & Rules',
    3: 'Analysis & Reporting',
}
for cid in communities:
    if cid not in labels:
        labels[cid] = f'Module {cid}'

questions = suggest_questions(G, communities, labels)
report = generate(G, communities, cohesion, labels, gods, surprises, result, tokens, str(ROOT), suggested_questions=questions)

(OUT / 'GRAPH_REPORT.md').write_text(report, encoding='utf-8')
to_json(G, communities, str(OUT / 'graph.json'))

print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities")
print("\n=== Done! ===")
print("  graphify-out/GRAPH_REPORT.md")
print("  graphify-out/graph.json")
