#!/bin/bash
# Roadmap query helpers for Claude Code sessions.
# Source this file:  source .claude/roadmap-helpers.sh

roadmap_find() {
    python .claude/update-roadmap.py --search "$1"
}

roadmap_status() {
    python .claude/update-roadmap.py --list-status "$1"
}

roadmap_next()  { roadmap_status NEXT; }
roadmap_wip()   { roadmap_status IN_PROGRESS; }
roadmap_done()  { roadmap_status DONE; }
roadmap_backlog() { roadmap_status BACKLOG; }

roadmap_start() {
    python .claude/update-roadmap.py --item-id "$1" --status IN_PROGRESS
}

roadmap_complete() {
    python .claude/update-roadmap.py --item-id "$1" --status DONE --notes "$2"
}

echo "Roadmap helpers loaded:"
echo "  roadmap_find <query>          Search items"
echo "  roadmap_next / _wip / _done   List by status"
echo "  roadmap_start <id>            Mark IN_PROGRESS"
echo "  roadmap_complete <id> <notes> Mark DONE with notes"
