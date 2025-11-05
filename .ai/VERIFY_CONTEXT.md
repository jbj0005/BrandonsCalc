# AGENT_CONTEXT.md Verification Checklist

Use this checklist monthly or after major changes to ensure AGENT_CONTEXT.md is accurate.

## ✅ Completeness Check

### Database Section
- [ ] All tables documented with full schema
- [ ] All RLS policies listed
- [ ] Foreign key relationships explained
- [ ] Table purposes clearly differentiated
- [ ] Indexes documented

### Authentication Section
- [ ] Auth flow diagram/explanation
- [ ] Code patterns shown with examples
- [ ] Store usage documented
- [ ] Common auth errors listed
- [ ] Event timing explained

### Features Section
- [ ] Each feature has ✅ / 🚧 / ⏳ status
- [ ] Working code examples included
- [ ] File paths and line numbers current
- [ ] Dependencies listed
- [ ] Testing steps provided

### API Section
- [ ] All endpoints documented
- [ ] Request/response examples shown
- [ ] Error responses documented
- [ ] Authentication requirements listed

### Common Pitfalls
- [ ] Each pitfall has problem statement
- [ ] Each pitfall has solution
- [ ] Each pitfall explains "why"
- [ ] Recent errors added

## 🔍 Accuracy Check

### Code Examples
- [ ] All code snippets compile/work
- [ ] No outdated function names
- [ ] Import statements correct
- [ ] File paths still valid

### Schema Accuracy
- [ ] Table names match database
- [ ] Column types correct
- [ ] Constraints documented
- [ ] Defaults accurate

### Architecture
- [ ] File structure reflects reality
- [ ] Dependencies up to date
- [ ] Tech stack current
- [ ] Port numbers correct

## 🧪 Practical Test

### Give AGENT_CONTEXT.md to fresh AI and ask:

1. **"Explain the authentication system"**
   - [ ] AI can explain flow correctly
   - [ ] AI knows about auth store
   - [ ] AI understands event timing

2. **"Show me how to query a user's garage vehicles"**
   - [ ] AI uses correct table (`garage_vehicles`)
   - [ ] AI uses correct foreign key (`user_id`)
   - [ ] AI includes auth check

3. **"What's the difference between `vehicles` and `garage_vehicles`?"**
   - [ ] AI explains owned vs saved
   - [ ] AI knows when to use each
   - [ ] AI mentions trade-in context

4. **"How do I create a new modal?"**
   - [ ] AI follows documented pattern
   - [ ] AI exports to window
   - [ ] AI adds debugging logs

5. **"What are common mistakes with localStorage?"**
   - [ ] AI says don't use it for user_id
   - [ ] AI recommends auth store
   - [ ] AI explains why

## 📊 Completeness Score

Count checkboxes above:
- ✅ All checked = 100% - Perfect!
- ⚠️ 80-99% = Good, update missing items
- ❌ <80% = Needs work, schedule update

## 🔄 Update Actions

If checks failed, do this:

### Missing Information
1. Add to UPDATE_TEMPLATE.md
2. Fill out completely
3. Add to AGENT_CONTEXT.md
4. Re-run verification

### Outdated Information
1. Find section in AGENT_CONTEXT.md
2. Update with current state
3. Add note about what changed
4. Update version number

### Incorrect Code
1. Test the code yourself
2. Fix in AGENT_CONTEXT.md
3. Add to "Common Pitfalls" if bug
4. Update version number

## 🎯 Quality Standards

### Code Examples Must:
- ✅ Actually work (tested)
- ✅ Include imports if needed
- ✅ Show full context (not snippets)
- ✅ Include error handling
- ✅ Have comments explaining non-obvious parts

### Explanations Must:
- ✅ Answer "what", "why", and "how"
- ✅ Include examples
- ✅ Mention edge cases
- ✅ Link related concepts
- ✅ Warn about pitfalls

### Structure Must:
- ✅ Use consistent formatting
- ✅ Have clear section headers
- ✅ Include table of contents
- ✅ Cross-reference related sections
- ✅ Use status symbols (✅ 🚧 ⏳ ⚠️)

## 📝 Next Steps

After verification:

1. [ ] Fix any failed checks
2. [ ] Update version number
3. [ ] Update "Last Verified" date
4. [ ] Archive old version if major changes
5. [ ] Commit changes to git
6. [ ] Set calendar reminder for next verification

---

**Last Verified**: _______________
**Verified By**: _______________
**Score**: _____ / _____ (___%)
**Status**: Pass / Needs Work / Failed

**Notes**:
