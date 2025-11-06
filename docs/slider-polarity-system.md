# 🎛️ Slider Polarity System

**Document Version:** 1.0  
**Last Updated:** 2025-11-05  
**Author:** Brandon J / Engineering Team

---

## 🧭 Overview

The **Slider Polarity System** defines how sliders in _Brandon’s Calculator – Express Mode_ visually and functionally represent buyer-positive or buyer-negative adjustments.  
This ensures every interactive control conveys meaning through consistent color, direction, and snapping logic.

---

## ⚙️ Behavior Summary

Each slider has a **baseline origin** derived from Supabase.  
That origin is centered at the **midpoint (50%)** of the slider track and represents the neutral “starting point” of the deal.

As the user adjusts sliders:

- Movement toward the **buyer-positive** direction is displayed using the **hero gradient** (blue-violet).
- Movement toward the **buyer-negative** direction is displayed using a **red accounting gradient**.
- Crossing near the baseline auto-snaps the thumb back to center.
- The visual center is rounded to the nearest configuration step (e.g., $100), while real baseline values are preserved for diff calculations.
- Slider fills now render using CSS palette tokens (`--neutral`, `--primary-start`, `--primary-end`, `--error`, `--error-dark`) so the color stories stay on-brand while reflecting buyer benefit.

---

## 🎨 Visual Representation
