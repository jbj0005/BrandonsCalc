#!/bin/bash
# Bootstrap the Context MCP Server
# Run from project root: bash mcp/context-server/bootstrap.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📦 Installing MCP context server dependencies..."
cd "$SCRIPT_DIR"
npm install

echo "🔨 Building server..."
npm run build

echo "✅ Context MCP Server ready!"
echo ""
echo "The server is registered in .mcp.json and will be available to Claude Code."
echo "Tools: list_specialists, suggest_context, search_specs, get_spec, find_related"
