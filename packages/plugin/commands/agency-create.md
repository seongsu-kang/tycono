---
description: "Create a new custom agency via conversation"
allowed-tools: ["Bash(mkdir *)", "Bash(cat *)", "Write", "Read", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/agency-list.sh *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/agency-list.sh)"]
---

# Agency Create — Interactive

You are helping the user create a custom Tycono agency (AI team configuration).

Guide the user through these questions conversationally:

1. **Agency name**: What should this agency be called? (e.g., "fintech-team", "content-factory")
2. **What does this team do?**: Brief description of the team's purpose
3. **Team composition**: Which roles are needed? Suggest from:
   - CTO (technical lead) — manages Engineer, QA
   - CBO (business lead) — manages PM, Designer
   - Engineer (code implementation)
   - QA (testing & validation)
   - PM (product management)
   - Designer (UI/UX design)
   - Or custom roles the user describes
4. **Domain expertise**: Any specific technologies, frameworks, or domain knowledge? (e.g., "Next.js + Supabase", "Solidity smart contracts")

Ask the user where to save:
- **Project-local** (`.tycono/agencies/{name}/`) — only for this project
- **Global** (`~/.tycono/agencies/{name}/`) — available across all projects

Default to global if they don't have a preference.

Create the agency files:

```
{target_dir}/agencies/{name}/
├── agency.yaml
└── knowledge/
    └── knowledge.md
```

**agency.yaml template:**
```yaml
spec: agency/v1
id: {name}
name: "{display name}"
version: "1.0.0"
description: |
  {description}
roles:
  - {role1}
  - {role2}
category: engineering
tags: [{tags}]
```

**knowledge/knowledge.md**: Write domain-specific guidance based on what the user described.

After creation, show:
```
✅ Agency "{name}" created!

Use it: /tycono --agency {name} "your task"
List all: /tycono:agency-list

🌐 Share your agency with the community: https://tycono.ai/agencies
   Register as an Agency Owner and let others use your team configuration!
```
