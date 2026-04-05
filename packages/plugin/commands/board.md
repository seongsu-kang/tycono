---
description: "View and manage the Task Board for the active wave"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/board.sh *)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/board.sh)", "Bash(curl *)"]
---

# Task Board

Run the following Bash command to view or manage the task board:

```
"${CLAUDE_PLUGIN_ROOT}/scripts/board.sh" $ARGUMENTS
```

IMPORTANT: You MUST execute the above command using the Bash tool. Do NOT skip this step.

## Usage

- `/tycono:board` ��� View current board
- `/tycono:board skip t3` — Skip a task
- `/tycono:board edit t2 "new title or criteria"` — Edit task content
- `/tycono:board add "Task title" --assign role-id` — Add a new task

Report the board state to the user.
