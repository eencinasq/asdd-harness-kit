# External Tracker MCP Configurations

## Linear

Linear provides an MCP server via the Linear CLI or community implementations.

**Recommended MCP:**
- `smithery-ai/linear-mcp` — community Linear MCP
- Or use Linear API directly with a custom MCP wrapper

**MCP config (`mcp.json`):**
```json
{
  "mcpServers": {
    "linear": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@smithery/linear-mcp"],
      "env": {
        "LINEAR_API_KEY": "${LINEAR_API_KEY}"
      }
    }
  }
}
```

**Agent usage:**
- `linear_getIssue` — fetch issue by identifier (e.g., `TEAM-123`)
- `linear_getIssueComments` — fetch discussion thread
- `linear_createIssueComment` — sync status back

## Jira

**Recommended MCP:**
- `mcp-atlassian` or community Jira MCP

**MCP config:**
```json
{
  "mcpServers": {
    "jira": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-atlassian"],
      "env": {
        "JIRA_HOST": "https://your-domain.atlassian.net",
        "JIRA_EMAIL": "${JIRA_EMAIL}",
        "JIRA_API_TOKEN": "${JIRA_API_TOKEN}"
      }
    }
  }
}
```

**Agent usage:**
- `jira_get_issue` — fetch issue by key
- `jira_add_comment` — sync status

## GitHub Issues

GitHub has official MCP support via the GitHub MCP server.

**MCP config:**
```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@github/mcp-server"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

**Agent usage:**
- `get_issue` — fetch issue by repo + number
- `create_issue_comment` — sync status
- `update_issue` — update labels, state

## Manual / No MCP

When no tracker MCP is available, the handoff uses one of:

1. **Human-pasted content** — TL copies issue body into the agent prompt
2. **Local snapshot** — `.harness/specs/<slice>/delivery/pitch.md` written by TL
3. **Shared document** — Notion, Google Docs, Confluence link in `intent.md`

In all manual modes, the agent treats the pasted/snapshot content as read-only source. It does not attempt to write back to the tracker.
