# Tiered Rewind Buffer for Grand Strategy Game

## Core Concept

Two-tier save system: **high-frequency recent saves** (every 30 seconds for past hour) plus **checkpoint saves** (every 10 minutes for entire game). Gives granular recent history + long-term rewind ability.

```
Architecture:
    Game State (ETS)
         ↓
    Every 30 seconds → Recent Buffer (120 slots = 1 hour)
    Every 10 minutes → Checkpoint Buffer (∞ slots = entire game)
         ↓
    SQLite Database
    ┌─────────────────────────┐
    │ RECENT (Last Hour)      │
    │ 120 × 30-second saves   │
    │ Ring buffer, overwrites │
    │ ~18MB total             │
    ├─────────────────────────┤
    │ CHECKPOINTS (Forever)   │
    │ Every 10 minutes        │
    │ Never overwrites        │
    │ ~150KB each             │
    └─────────────────────────┘
```

## Implementation

### Database Schema
```sql
-- Recent saves (ring buffer, last hour)
CREATE TABLE recent_saves (
    slot INTEGER PRIMARY KEY,  -- 0 to 119
    tick INTEGER,
    timestamp INTEGER,
    game_data BLOB
);

-- Checkpoint saves (kept forever)
CREATE TABLE checkpoint_saves (
    tick INTEGER PRIMARY KEY,
    timestamp INTEGER,
    game_data BLOB,
    label TEXT  -- "Day 45", "Year 1650", etc.
);

-- Index for fast time-based queries
CREATE INDEX idx_checkpoint_time ON checkpoint_saves(timestamp);
```

### Save Logic
```elixir
def handle_tick(tick, state) do
  compressed_state = :erlang.term_to_binary(get_all_ets_data(), [:compressed])
  
  # Every 30 seconds: Save to recent buffer
  if rem(tick, 30) == 0 do
    slot = rem(div(tick, 30), 120)  # 120 slots for 1 hour
    execute("UPDATE recent_saves SET tick = ?, timestamp = ?, game_data = ? 
             WHERE slot = ?", [tick, now(), compressed_state, slot])
  end
  
  # Every 10 minutes: Save checkpoint
  if rem(tick, 600) == 0 do  # 600 ticks = 10 minutes
    label = format_game_date(tick)  # "Year 1650, Day 45"
    execute("INSERT INTO checkpoint_saves (tick, timestamp, game_data, label) 
             VALUES (?, ?, ?, ?)", [tick, now(), compressed_state, label])
  end
end
```

### Rewind Menu
```elixir
def show_rewind_options() do
  # Recent saves (granular)
  recent = query("SELECT tick, timestamp FROM recent_saves 
                  WHERE tick > 0 ORDER BY tick DESC")
  
  # Checkpoint saves (long-term)
  checkpoints = query("SELECT tick, timestamp, label FROM checkpoint_saves 
                       ORDER BY tick DESC LIMIT 50")
  
  IO.puts("""
  === REWIND OPTIONS ===
  
  RECENT (30-second intervals):
  - 0:30 ago - Just before battle
  - 1:00 ago - Moving armies
  - 1:30 ago - Diplomatic action
  ... (up to 1 hour)
  
  CHECKPOINTS (10-minute intervals):
  - 1:10 ago - Year 1650, Day 45
  - 1:20 ago - Year 1650, Day 44
  - 2:30 ago - Year 1650, Day 40
  ... (entire game history)
  """)
end

def quick_rewind_keys() do
  "F9" -> rewind_30_seconds()   # Jump back one recent save
  "F8" -> rewind_10_minutes()   # Jump to last checkpoint
  "F7" -> show_full_menu()      # Full rewind interface
end
```

## Storage Impact

```
Recent Buffer (1 hour):
- 120 saves × 150KB = 18MB
- Fixed size, ring buffer

Checkpoints (entire game):
- Every 10 minutes = 6 per hour
- 10-hour session = 60 saves × 150KB = 9MB
- 100-hour campaign = 600 saves × 150KB = 90MB

Total for 100-hour campaign:
- Recent: 18MB (fixed)
- Checkpoints: 90MB (grows slowly)
- Total: ~108MB (very reasonable!)
```

## Benefits of Two-Tier System

1. **Granular Recent History**: Undo that misclick from 30 seconds ago
2. **Long-term Checkpoints**: Restart from hours ago if needed
3. **Space Efficient**: Recent saves overwrite, checkpoints compress well
4. **Fast Navigation**: Jump between major points or fine-tune with recent
5. **Natural Game Flow**: Checkpoints align with game sessions

## Advanced Features

```elixir
defmodule SmartSaves do
  # Auto-checkpoint before major events
  def before_major_event(event_type) do
    save_checkpoint(current_tick(), "Before #{event_type}")
  end
  
  # Named checkpoints player can create
  def player_bookmark(name) do
    save_checkpoint(current_tick(), "Bookmark: #{name}")
  end
  
  # Cleanup old checkpoints (optional)
  def cleanup_old_checkpoints() do
    # Keep every 10 min for past day
    # Keep every hour for past week  
    # Keep every day for past month
    # Keep every week forever
  end
end
```

## User Experience

```
Player loses major war after 3 hours of play:

=== REWIND OPTIONS ===
Recent (30-sec intervals):
  • 0:30 ago - After defeat
  • 2:00 ago - Mid-battle
  • 5:00 ago - War declaration ← "Here!"
  
Checkpoints (10-min intervals):  
  • 10 min ago - During war preparation
  • 20 min ago - Before mobilization
  • 3 hours ago - Peaceful expansion ← "Or maybe here!"
  
Player can either:
- Fine-tune to exact moment before war (30-sec saves)
- Jump back to major checkpoint (10-min saves)
```

This two-tier approach gives players both **surgical precision** for recent mistakes and **major waypoints** for long-term decisions, while keeping storage reasonable (~100MB for massive campaigns).