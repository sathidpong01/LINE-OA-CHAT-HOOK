# Graph Report - d:\OA CHAT HOOK  (2026-05-12)

## Corpus Check
- Corpus is ~4,658 words - fits in a single context window. You may not need a graph.

## Summary
- 24 nodes · 22 edges · 5 communities (4 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 1,000 input · 500 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Supabase Webhook & Database|Supabase Webhook & Database]]
- [[_COMMUNITY_NAS Sync & Storage|NAS Sync & Storage]]
- [[_COMMUNITY_Project Architecture & Rules|Project Architecture & Rules]]
- [[_COMMUNITY_Analysis & Reporting|Analysis & Reporting]]
- [[_COMMUNITY_Module 4|Module 4]]

## God Nodes (most connected - your core abstractions)
1. `main()` - 3 edges
2. `Local Analyzer (Hermes AI)` - 3 edges
3. `fetchMessagesForDate()` - 2 edges
4. `saveLogFile()` - 2 edges
5. `Supabase Edge Function (line-webhook)` - 2 edges
6. `Database Table: line_messages` - 2 edges
7. `NAS DS218play (Synology)` - 2 edges
8. `LINE Messaging API` - 2 edges
9. `Raw Logs JSON (raw_logs/)` - 2 edges
10. `fs` - 1 edges

## Surprising Connections (you probably didn't know these)
- `NAS DS218play (Synology)` --pulls_from--> `Database Table: line_messages`  [EXTRACTED]
  line-oa-environment-export.md → supabase-schema.sql
- `Supabase Edge Function (line-webhook)` --inserts_to--> `Database Table: line_messages`  [EXTRACTED]
  architecture-and-plan-final.md → supabase-schema.sql
- `LINE Messaging API` --calls--> `Supabase Edge Function (line-webhook)`  [EXTRACTED]
  PROJECT_BRIEF.md → architecture-and-plan-final.md
- `Local Analyzer (Hermes AI)` --reads--> `Raw Logs JSON (raw_logs/)`  [EXTRACTED]
  AGENTS.md → architecture-and-plan-final.md
- `Local Analyzer (Hermes AI)` --updates--> `Profiles MD (profiles/)`  [EXTRACTED]
  AGENTS.md → architecture-and-plan-final.md

## Communities (5 total, 1 thin omitted)

### Community 0 - "Supabase Webhook & Database"
Cohesion: 0.25
Nodes (5): body, eventTime, LINE_CHANNEL_ACCESS_TOKEN, signature, supabase

### Community 1 - "NAS Sync & Storage"
Cohesion: 0.47
Nodes (5): fetchMessagesForDate(), fs, main(), path, saveLogFile()

### Community 2 - "Project Architecture & Rules"
Cohesion: 0.4
Nodes (5): Local Analyzer (Hermes AI), NAS DS218play (Synology), Profiles MD (profiles/), Raw Logs JSON (raw_logs/), Reports MD (reports/)

### Community 3 - "Analysis & Reporting"
Cohesion: 0.5
Nodes (4): Database Table: line_messages, LINE Messaging API, LINE OA Customer Account, Supabase Edge Function (line-webhook)

## Knowledge Gaps
- **11 isolated node(s):** `fs`, `path`, `LINE_CHANNEL_ACCESS_TOKEN`, `supabase`, `signature` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `NAS DS218play (Synology)` connect `Project Architecture & Rules` to `Analysis & Reporting`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `Database Table: line_messages` connect `Analysis & Reporting` to `Project Architecture & Rules`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `LINE_CHANNEL_ACCESS_TOKEN` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._