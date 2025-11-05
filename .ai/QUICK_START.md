# AI Context System - Quick Start Guide

## 🚀 For AI Agents

### Starting a New Session
1. **Read this first**: `.ai/AGENT_CONTEXT.md`
2. You now know the entire app architecture
3. Ask user what they want to work on
4. Refer back to context file as needed

### Before Writing Code
1. Check if feature already exists (search AGENT_CONTEXT.md)
2. Follow documented patterns
3. Use correct table names
4. Check "Common Pitfalls" section

### After Completing Work
1. Test thoroughly
2. Fill out `.ai/UPDATE_TEMPLATE.md`
3. Add to AGENT_CONTEXT.md with ✅
4. Update version/date

## 👨‍💻 For Developers

### Daily Usage
```bash
# Quick validation check
bash .ai/quick-check.sh

# View current context
cat .ai/AGENT_CONTEXT.md

# Start working
# ... code code code ...

# After feature complete
cp .ai/UPDATE_TEMPLATE.md /tmp/my_feature.md
# Fill it out, then add to AGENT_CONTEXT.md
```

### Giving Context to New AI
```
Copy and paste AGENT_CONTEXT.md into first message:

"Here's the complete context for the ExcelCalc app.
Read this first, then I'll tell you what needs to be done:

[paste AGENT_CONTEXT.md]

Now, I need you to..."
```

### Emergency Recovery
```bash
# 1. Stop and read context
cat .ai/AGENT_CONTEXT.md

# 2. Run validation
bash .ai/quick-check.sh

# 3. Compare your code to documented patterns
# 4. Fix issues one by one
# 5. Re-run validation after each fix
```

## 📋 Common Commands

### Check for Bad Patterns
```bash
# Find localStorage usage (should use auth store)
grep -rn "localStorage.getItem.*Profile" app.js

# Find wrong table usage
grep -rn "\.from.*vehicles" app.js | grep -v garage_vehicles

# Check if modals exported
grep "window\\.open.*Modal" app.js
```

### Verify Database
```bash
# Check if migrations exist
ls -la supabase/migrations/

# Preview migration
cat supabase/migrations/20251105_create_garage_vehicles.sql
```

### Quick File Locations
```bash
# Auth system
ls -la src/features/auth/
ls -la src/stores/auth.ts

# Supabase client
cat src/lib/supabase.ts

# Main app
wc -l app.js  # Should be 8000+ lines
```

## 🎯 Quick Reference

### Database Tables
- `customer_profiles` - User profile data
- `garage_vehicles` - Vehicles user OWNS (trade-in)
- `vehicles` - Vehicles user wants to BUY (saved)
- `customer_offers` - Saved financing offers
- `auto_rates` - Lender interest rates
- `sms_logs` - SMS message tracking

### Key Patterns

#### Query User Data
```javascript
const authStore = useAuthStore.getState();
const { data } = await supabase
  .from("table_name")
  .eq("user_id", authStore.user.id);
```

#### Open Modal
```javascript
async function openMyModal() {
  console.log("🔍 Opening...");
  const modal = document.getElementById("my-modal");
  if (!modal) return;
  modal.style.display = "flex";
  await loadData();
}
window.openMyModal = openMyModal;  // Export!
```

#### Load Garage Vehicles
```javascript
const { data } = await supabase
  .from("garage_vehicles")  // NOT "vehicles"!
  .select("*")
  .eq("user_id", authStore.user.id);
```

## ⚠️ Critical Rules

1. ❌ **NEVER** use `localStorage.getItem("customerProfileId")`
   ✅ Use `useAuthStore.getState().user.id`

2. ❌ **NEVER** query `vehicles` for garage data
   ✅ Use `garage_vehicles` for owned, `vehicles` for saved

3. ❌ **NEVER** use `nullsFirst: false` in Supabase queries
   ✅ Use `.order("field", { ascending: false })`

4. ✅ **ALWAYS** export modal functions to window
   `window.openMyModal = openMyModal;`

5. ✅ **ALWAYS** set up event listeners BEFORE `AuthManager.initialize()`

## 📱 Quick Troubleshooting

### Modals Won't Open
- Check: `window.openMyModal` exists in console?
- Check: Modal element ID correct?
- Check: Function exported to window?

### 400 Supabase Errors
- Check: Using correct table name?
- Check: RLS policies allow access?
- Check: Query syntax correct (no `nullsFirst: false`)?

### Auth Issues
- Check: `useAuthStore.getState().user` has data?
- Check: Not using localStorage?
- Check: Event listeners before initialize?

### Data Not Loading
- Check: Correct table (garage_vehicles vs vehicles)?
- Check: Correct foreign key (user_id, not customer_profile_id)?
- Check: User actually has data in database?

## 🔗 File Links

- [Main Context](.ai/AGENT_CONTEXT.md)
- [Update Template](.ai/UPDATE_TEMPLATE.md)
- [Verification Checklist](.ai/VERIFY_CONTEXT.md)
- [Full README](.ai/README.md)

---

**Remember**: Context file is only useful if kept current! Update after every completed feature.
