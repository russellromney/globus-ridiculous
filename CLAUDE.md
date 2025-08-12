# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this game repository.

## Quick Reference
* Check .claude-memory/CLAUDE-activeContext.md for current feature work
* **ALWAYS**: Spec → Implement → Test (in that order)
* Write tests that verify state transitions actually work
* Run the game after changes to ensure nothing broke

## Memory Bank System

Context files in .claude-memory/:
* **CLAUDE-activeContext.md** - Current feature spec and progress
* **CLAUDE-patterns.md** - Game patterns (ECS, state machines, input)
* **CLAUDE-gamespec.md** - Core mechanics, rules, and balance values
* **CLAUDE-decisions.md** - Architecture decisions
* **CLAUDE-temp.md** - Scratch pad (only read when referenced)

## Game Development Workflow

### 1. Spec First
Before coding, write in activeContext what the feature does, which systems it touches, expected state changes, and test scenarios that will verify it works.

### 2. Implement Exactly
Code ONLY what's in the spec. Use existing patterns from the codebase and keep the game loop clean and performant.

### 3. Test State Changes
Write tests for state transitions, verify edge cases like collision boundaries and input timing, and ensure the feature works exactly as specified.

## Core Principles

### Architecture
* Game loop is sacred - don't break it for convenience
* State machines should be explicit and testable, not implicit through scattered booleans
* Decouple systems - physics shouldn't know about rendering, input shouldn't directly modify game objects
* Use Entity-Component-System for game objects rather than deep inheritance hierarchies

### Performance
* Profile first, optimize second - don't guess where bottlenecks are
* Pool frequently created/destroyed objects like bullets, particles, and enemies
* Cache calculations that don't change every frame
* Keep draw calls minimal by batching where possible

### Code Quality
* Keep gameplay code separate from engine code for maintainability
* All gameplay values should be tweakable without recompiling
* Game state must be serializable for save/load functionality
* Handle missing assets gracefully - never crash because a texture is missing

## Testing Focus
* State transitions (menu→game→pause→menu) must work reliably
* Collision boundaries should be tested at edges and corners
* Input during state transitions shouldn't cause unexpected behavior
* Performance with maximum expected entities should remain playable

## Important
* Do exactly what's asked; nothing more, nothing less
* Prefer editing existing files over creating new ones
* Run tests after implementation to verify nothing broke
* Update specs when requirements change to keep documentation current