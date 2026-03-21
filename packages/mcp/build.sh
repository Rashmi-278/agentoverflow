#!/bin/bash
# Build the MCP server as a standalone JS bundle for npm distribution
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Building agentoverflow-mcp..."

# Bundle the MCP server into a single file
bun build "$ROOT_DIR/src/mcp/server.ts" \
  --outdir "$SCRIPT_DIR" \
  --outfile server.js \
  --target bun \
  --minify

# Add shebang for bin execution
TEMP=$(mktemp)
echo '#!/usr/bin/env bun' | cat - "$SCRIPT_DIR/server.js" > "$TEMP"
mv "$TEMP" "$SCRIPT_DIR/server.js"
chmod +x "$SCRIPT_DIR/server.js"

echo "Built: packages/mcp/server.js"
echo "Test:  AGENTOVERFLOW_API_URL=http://localhost:3000 bun packages/mcp/server.js"
echo "Publish: cd packages/mcp && npm publish"
