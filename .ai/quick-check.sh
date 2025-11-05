#!/bin/bash
# Quick validation script for ExcelCalc codebase
# Run with: bash .ai/quick-check.sh

echo "🔍 ExcelCalc Quick Check"
echo "========================"
echo ""

ERRORS=0
WARNINGS=0

# Check 1: Auth Store Usage
echo "✓ Checking auth store usage..."
if grep -rn "localStorage.getItem.*customerProfileId" app.js src/ 2>/dev/null | grep -v "WRONG\|Bad\|❌"; then
    echo "  ⚠️  WARNING: Found localStorage.getItem('customerProfileId') usage"
    echo "     Should use: useAuthStore.getState().user.id"
    WARNINGS=$((WARNINGS + 1))
fi

# Check 2: Table Name Usage
echo "✓ Checking table names..."
if grep -rn "\.from.*garage_vehicles" app.js | grep -v "// CORRECT\|✅" | head -5 | grep -q "from"; then
    echo "  ✅ Found garage_vehicles usage"
fi

# Check 3: Modal Exports
echo "✓ Checking modal function exports..."
MODAL_EXPORTS=$(grep -c "window\.open.*Modal\|window\.close.*Modal" app.js)
if [ "$MODAL_EXPORTS" -lt 6 ]; then
    echo "  ⚠️  WARNING: Expected 6+ modal exports, found $MODAL_EXPORTS"
    WARNINGS=$((WARNINGS + 1))
fi

# Check 4: Supabase Config
echo "✓ Checking Supabase config..."
if [ -f ".env" ]; then
    if grep -q "VITE_SUPABASE_URL.*placeholder" .env || grep -q "YOUR_ANON_KEY_HERE" .env; then
        echo "  ❌ ERROR: Supabase credentials not configured in .env"
        ERRORS=$((ERRORS + 1))
    else
        echo "  ✅ Supabase credentials configured"
    fi
else
    echo "  ⚠️  WARNING: .env file not found"
    WARNINGS=$((WARNINGS + 1))
fi

# Check 5: Migration Files
echo "✓ Checking migrations..."
if [ -f "supabase/migrations/20251105_create_garage_vehicles.sql" ]; then
    echo "  ✅ garage_vehicles migration exists"
else
    echo "  ❌ ERROR: Missing garage_vehicles migration"
    ERRORS=$((ERRORS + 1))
fi

# Check 6: TypeScript Files
echo "✓ Checking TypeScript structure..."
if [ -f "src/features/auth/auth-manager.ts" ]; then
    echo "  ✅ Auth manager exists"
else
    echo "  ⚠️  WARNING: Missing auth-manager.ts"
    WARNINGS=$((WARNINGS + 1))
fi

# Check 7: Context File
echo "✓ Checking AI context..."
if [ -f ".ai/AGENT_CONTEXT.md" ]; then
    LAST_UPDATE=$(grep "Last Updated" .ai/AGENT_CONTEXT.md | head -1 | cut -d: -f2- | xargs)
    echo "  ✅ Context file exists (Last updated: $LAST_UPDATE)"
else
    echo "  ❌ ERROR: AGENT_CONTEXT.md missing!"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "========================"
echo "Summary:"
echo "  Errors:   $ERRORS"
echo "  Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo "❌ FAILED - Fix errors before proceeding"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo "⚠️  PASSED with warnings - Consider fixing"
    exit 0
else
    echo "✅ ALL CHECKS PASSED"
    exit 0
fi
