# SQLite + ETS Hybrid Architecture for Grand Strategy Game

## Core Concept

**SQLite** provides persistent, transactional storage in a single file.  
**ETS** provides microsecond-latency reads for hot game state.  
**GenServers** orchestrate game logic and coordinate between the two.

```
Architecture:
    ┌─────────────────────────────────────┐
    │         BEAM VM (Elixir)            │
    │                                     │
    │  ┌─────────────────────────────┐   │
    │  │     ETS (Hot Cache)         │   │
    │  │  • Province positions       │   │
    │  │  • Nation treasuries        │   │
    │  │  • Army locations           │   │
    │  │  • Active wars              │   │
    │  └──────────┬──────────────────┘   │
    │             │                       │
    │  ┌──────────▼──────────────────┐   │
    │  │     GenServers              │   │
    │  │  • Game logic               │   │
    │  │  • State coordination       │   │
    │  │  • Event processing         │   │
    │  └──────────┬──────────────────┘   │
    └─────────────┼───────────────────────┘
                  │
    ┌─────────────▼───────────────────────┐
    │         SQLite Database             │
    │                                     │
    │  • Full game state (persistent)     │
    │  • Transaction log                  │
    │  • Event history                    │
    │  • Mod data                         │
    │  • Save snapshots                   │
    │                                     │
    │  Single file: game_save.db          │
    └─────────────────────────────────────┘
```

## How It Works

### 1. Game Initialization
```elixir
defmodule GameState do
  def start_game(save_name) do
    # Open SQLite database (creates if new)
    {:ok, db} = Exqlite.open("saves/#{save_name}.db")
    
    # Create ETS tables for hot data
    :ets.new(:provinces, [:named_table, :public, read_concurrency: true])
    :ets.new(:nations, [:named_table, :public, read_concurrency: true])
    
    # Load frequently-accessed data into ETS
    load_provinces_into_cache(db)
    load_nations_into_cache(db)
    
    # Start game processes
    GameSupervisor.start_link(db: db)
  end
end
```

### 2. Read Pattern (Cache-First)
```elixir
def get_province(id) do
  # Try ETS first (microseconds)
  case :ets.lookup(:provinces, id) do
    [{^id, province}] -> province
    [] ->
      # Fall back to SQLite (milliseconds)
      province = query_db("SELECT * FROM provinces WHERE id = ?", [id])
      :ets.insert(:provinces, {id, province})
      province
  end
end
```

### 3. Daily Tick Processing
```elixir
def process_daily_tick(tick) do
  # 1. Read from ETS (fast)
  provinces = :ets.tab2list(:provinces)
  
  # 2. Process in parallel (Rust NIFs for heavy math)
  updates = RustNIF.calculate_province_updates(provinces)
  
  # 3. Update ETS (immediate)
  Enum.each(updates, fn {id, changes} ->
    :ets.update_element(:provinces, id, changes)
  end)
  
  # 4. Persist to SQLite (batched transaction)
  persist_tick_to_db(tick, updates)
end

def persist_tick_to_db(tick, updates) do
  Exqlite.transaction(db, fn ->
    # Batch update all changes in one transaction
    insert_event_log(tick)
    update_provinces(updates)
    update_nations(updates)
    # If anything fails, entire tick rolls back
  end)
end
```

### 4. Save System (Trivial!)
```elixir
def save_game() do
  # Already saved! Just checkpoint the WAL
  Exqlite.execute(db, "PRAGMA wal_checkpoint")
end

def copy_save(name) do
  # Just copy the single .db file
  File.cp!("saves/current.db", "saves/#{name}.db")
end

def share_save() do
  # Send one file to friend
  File.read!("saves/current.db")
end
```

## Database Schema

```sql
-- Core persistent state
CREATE TABLE provinces (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER,
    development INTEGER,
    unrest REAL,
    data BLOB  -- MessagePack/JSON for flexible fields
);

CREATE TABLE nations (
    id INTEGER PRIMARY KEY,
    treasury INTEGER,
    stability INTEGER,
    data BLOB
);

-- Event log for replay/debugging
CREATE TABLE event_log (
    tick INTEGER,
    event_type TEXT,
    event_data BLOB,
    timestamp INTEGER DEFAULT (unixepoch())
);

-- Indexes for common queries
CREATE INDEX idx_provinces_owner ON provinces(owner_id);
CREATE INDEX idx_events_tick ON event_log(tick);
```

## Key Benefits

### Performance
- **ETS**: Millions of reads/second for hot data
- **SQLite**: Still very fast (100k+ reads/second)
- **WAL Mode**: Readers never block writers
- **Batch Writes**: One transaction per tick

### Reliability
- **Every tick persisted**: Can't lose progress
- **Atomic updates**: Tick succeeds or fails completely
- **Crash recovery**: Just reopen the database
- **Natural rollback**: `DELETE FROM event_log WHERE tick > ?`

### Developer Experience
- **Single file saves**: Easy to copy/share/version
- **SQL queries**: Powerful analytics and debugging
- **Time travel**: Query game state at any tick
- **Mod isolation**: Separate tables/schemas per mod

### Example Queries
```sql
-- Who owned Paris on tick 1000?
SELECT owner_id FROM province_history 
WHERE province_id = 123 AND tick = 1000;

-- Economic growth over time
SELECT tick, SUM(development) as total_dev
FROM province_history
GROUP BY tick
ORDER BY tick;

-- Find stagnant wars
SELECT * FROM wars 
WHERE start_tick < (SELECT MAX(tick) - 365 FROM event_log)
AND war_score BETWEEN -10 AND 10;
```

## Implementation Priority

1. **Start Simple**
   - SQLite for everything initially
   - Add ETS caching as you identify hot paths

2. **Optimize Gradually**
   - Profile to find frequently-read data
   - Cache those specific tables in ETS
   - Keep cold data in SQLite only

3. **Scale Up**
   - Most data stays in SQLite
   - Only cache what's needed for 60 tick/second performance
   - Let SQLite handle complex queries and persistence

This architecture gives you:
- **Durability** of a database
- **Performance** of in-memory cache  
- **Simplicity** of a single file
- **Power** of SQL queries
- **Safety** of transactions
- **Flexibility** to optimize later

Perfect for a grand strategy game where you need both performance and persistence!