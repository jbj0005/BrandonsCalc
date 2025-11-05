# .ai Directory - AI Agent Context System

## Purpose

This directory contains **AI reconstruction blueprints** - comprehensive documentation that allows an AI agent to rebuild the entire application from scratch or recover from critical errors.

## Files

### 📘 AGENT_CONTEXT.md (Main Blueprint)
The master document containing:
- Complete database schema
- Working code patterns
- Architecture decisions
- Common pitfalls
- Testing checklist

**Use this to**: Rebuild the app, onboard new AI agents, recover from errors

### 📝 UPDATE_TEMPLATE.md
Template for documenting new features as they're completed.

### 🔍 VERIFY_CONTEXT.md
Checklist to validate that AGENT_CONTEXT.md is current and accurate.

## When to Update

### ✅ ALWAYS Update After:
1. **Feature completion** - Feature works AND is tested
2. **Bug fix** - Root cause identified and documented
3. **Architecture change** - New pattern or convention established
4. **Schema change** - Database tables/columns modified
5. **Breaking change** - API or data flow significantly altered

### ❌ DON'T Update For:
1. Work in progress
2. Experimental code
3. Temporary debugging
4. Code comments only
5. Styling/CSS changes (unless architectural)

## How to Update AGENT_CONTEXT.md

### Step 1: Complete & Test Feature
- Feature must be fully working
- All edge cases tested
- No known bugs

### Step 2: Document Using Template
```bash
# Copy the template
cp .ai/UPDATE_TEMPLATE.md /tmp/my_feature.md

# Fill in all sections
# - What it does
# - Code examples
# - Database changes
# - Common mistakes
```

### Step 3: Add to AGENT_CONTEXT.md
- Add to appropriate section
- Use ✅ to mark as working
- Include file paths and line numbers
- Add code examples that WORK

### Step 4: Verify
```bash
# Run verification checklist
cat .ai/VERIFY_CONTEXT.md
```

## Usage Scenarios

### Scenario 1: Total Rebuild
**Situation**: Git repo corrupted, need to rebuild from scratch

**Process**:
1. Read `AGENT_CONTEXT.md` top to bottom
2. Set up project structure
3. Run all SQL migrations in order
4. Implement features following patterns
5. Run testing checklist

### Scenario 2: New AI Agent
**Situation**: Different AI needs to continue work

**Process**:
1. Provide `AGENT_CONTEXT.md` as first message
2. Explain current goal
3. AI has all context needed

### Scenario 3: Critical Error Recovery
**Situation**: Breaking change, unclear how to fix

**Process**:
1. Check `AGENT_CONTEXT.md` for correct patterns
2. Check "Common Pitfalls" section
3. Compare current code to documented patterns
4. Restore to working state

### Scenario 4: Feature Already Done?
**Situation**: About to implement feature, unsure if it exists

**Process**:
1. Search `AGENT_CONTEXT.md` for feature name
2. If found with ✅, feature is done
3. Use documented code as reference

## File Structure

```
.ai/
├── README.md              # This file - explains the system
├── AGENT_CONTEXT.md       # ⭐ Main blueprint
├── UPDATE_TEMPLATE.md     # Template for new features
├── VERIFY_CONTEXT.md      # Validation checklist
└── archived/              # Old versions (git history)
    └── AGENT_CONTEXT_20251105.md
```

## Best Practices

### 1. Be Specific
```
❌ Bad: "Modal system"
✅ Good: "My Garage modal (app.js:6246) - Opens when clicking profile dropdown, loads vehicles from garage_vehicles table"
```

### 2. Include Working Code
```
❌ Bad: "Use Supabase to query data"
✅ Good:
const { data } = await supabase
  .from("garage_vehicles")
  .select("*")
  .eq("user_id", authStore.user.id);
```

### 3. Explain WHY
```
❌ Bad: "Use garage_vehicles table"
✅ Good: "Use garage_vehicles for OWNED vehicles (trade-in). Use vehicles table for SAVED vehicles (to buy). They serve different purposes."
```

### 4. Document Mistakes
```
✅ Good:
⚠️ CRITICAL: Never use localStorage.getItem("customerProfileId")
Use useAuthStore.getState().user.id instead.
Reason: localStorage is stale, auth store is source of truth.
```

## Version Control

### Update Version Number
When making significant changes:
1. Increment version in header
2. Update "Last Updated" date
3. Add to "What's New" section if major

### Archive Old Versions
Before major rewrites:
```bash
cp .ai/AGENT_CONTEXT.md .ai/archived/AGENT_CONTEXT_$(date +%Y%m%d).md
```

## Testing Context File

### Validation Test
1. Give AGENT_CONTEXT.md to fresh AI
2. Ask it to explain the app architecture
3. Ask it to implement a small feature
4. If AI struggles, documentation needs improvement

### Completeness Test
Can an AI answer these questions from AGENT_CONTEXT.md alone?
- What database tables exist?
- How does authentication work?
- How to query user's vehicles?
- What's the difference between `vehicles` and `garage_vehicles`?
- How to create a new modal?
- Where are rates stored?

If no, add missing information.

## Emergency Recovery

If you hit a critical error and nothing works:

1. **Stop making changes**
2. **Read AGENT_CONTEXT.md carefully**
3. **Compare your code to documented patterns**
4. **Check "Common Pitfalls" section**
5. **Restore working patterns one by one**
6. **Run testing checklist after each fix**

## Contributing Guidelines

### For AI Agents
- Only mark features ✅ after testing
- Always include code examples
- Explain reasoning behind patterns
- Document what DOESN'T work (pitfalls)

### For Humans
- Keep updated throughout development
- Review quarterly for accuracy
- Archive before major refactors
- Use as onboarding document

---

**Remember**: This is a **living document**. It's only valuable if kept current!

**Last Updated**: 2025-11-05
