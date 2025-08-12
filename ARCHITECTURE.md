# Grand Strategy Game: Elixir + Rust Architecture

## Core Architecture

**Elixir/BEAM** handles orchestration, state management, and fault tolerance.  
**Rust NIFs** handle CPU-intensive calculations and algorithms.

```
Game Architecture:
    ┌─────────────────────────────────────┐
    │         BEAM VM (Elixir)            │
    │                                     │
    │  Supervision Tree:                  │
    │  ├── GameSupervisor                │
    │  │   ├── NationSupervisor          │
    │  │   ├── ProvinceSupervisor        │
    │  │   ├── ArmySupervisor            │
    │  │   ├── TradeSupervisor           │
    │  │   └── WarSupervisor             │
    │  │                                  │
    │  ├── TickScheduler (Phoenix.PubSub)│
    │  ├── SaveManager                   │
    │  └── ModRuntime (Sandboxed Lua)    │
    │                                     │
    │  State: ETS Tables + GenServers    │
    │  Events: PubSub Broadcasting       │
    │  Network: Ranch + Custom Protocol  │
    └─────────────┬───────────────────────┘
                  │
    ┌─────────────▼───────────────────────┐
    │        Rust NIFs (via Rustler)      │
    │                                     │
    │  • Pathfinding (A* + JPS)           │
    │  • Battle Resolution                │
    │  • Trade Network Optimization       │
    │  • Province Update Batching         │
    │  • Spatial Indexing (R-tree)        │
    │  • Economic Calculations            │
    └─────────────────────────────────────┘
```

## Elixir Components

### Game Entities as GenServers

```elixir
# Each province is an isolated process
defmodule Province do
  use GenServer
  
  defstruct [:id, :owner, :development, :trade_good, :unrest, :classes]
  
  def handle_info(:daily_tick, state) do
    # Call Rust for heavy calculations
    {:ok, tax} = :province_nif.calculate_tax(state)
    {:ok, production} = :province_nif.calculate_production(state)
    
    # Update state
    new_state = state
      |> update_unrest()
      |> check_rebellion()
      |> apply_modifiers()
    
    # Notify owner nation
    send(state.owner, {:province_income, state.id, tax, production})
    
    {:noreply, new_state}
  end
end

# Nations coordinate provinces and decisions
defmodule Nation do
  use GenServer
  
  def handle_call({:declare_war, target}, _from, state) do
    # Validate action
    if valid_war_declaration?(state, target) do
      # Create war process
      {:ok, war_pid} = WarSupervisor.start_war(self(), target)
      
      # Notify all systems
      Phoenix.PubSub.broadcast(GamePubSub, "wars", {:war_declared, self(), target})
      
      {:reply, {:ok, war_pid}, %{state | at_war: true}}
    else
      {:reply, {:error, :invalid_declaration}, state}
    end
  end
end
```

### Supervision for Fault Tolerance

```elixir
defmodule ProvinceSupervisor do
  use DynamicSupervisor
  
  def start_link(init_arg) do
    DynamicSupervisor.start_link(__MODULE__, init_arg, name: __MODULE__)
  end
  
  def init(_init_arg) do
    DynamicSupervisor.init(
      strategy: :one_for_one,  # Province crash doesn't affect others
      max_restarts: 10,         # Allow provinces to crash/restart
      max_seconds: 1
    )
  end
end
```

### Daily Tick System

```elixir
defmodule TickScheduler do
  use GenServer
  
  def handle_info(:tick, %{tick: tick, speed: speed} = state) do
    # Broadcast tick to all game entities
    Phoenix.PubSub.broadcast!(GamePubSub, "world:tick", {:daily_tick, tick})
    
    # Schedule next tick based on game speed
    Process.send_after(self(), :tick, speed)
    
    {:noreply, %{state | tick: tick + 1}}
  end
end
```

### ETS for Read-Heavy Data

```elixir
defmodule GameData do
  # Static game data in ETS for fast parallel reads
  def init_tables do
    :ets.new(:provinces, [:named_table, :public, read_concurrency: true])
    :ets.new(:trade_nodes, [:named_table, :public, read_concurrency: true])
    :ets.new(:technologies, [:named_table, :public, read_concurrency: true])
  end
  
  # Millions of concurrent reads without bottleneck
  def get_province(id) do
    :ets.lookup(:provinces, id)
  end
end
```

## Rust NIFs

### Pathfinding

```rust
// src/pathfinding.rs
use rustler::{Encoder, Env, NifResult, Term};
use pathfinding::prelude::astar;

#[rustler::nif]
fn find_army_path(
    start: ProvinceId,
    goal: ProvinceId,
    terrain: Vec<TerrainType>,
) -> NifResult<Vec<ProvinceId>> {
    // A* pathfinding with terrain costs
    let result = astar(
        &start,
        |p| get_neighbors(p, &terrain),
        |p| heuristic(p, &goal),
        |p| *p == goal,
    );
    
    match result {
        Some((path, _cost)) => Ok(path),
        None => Ok(vec![]),
    }
}

rustler::init!("pathfinding_nif", [find_army_path]);
```

### Battle Calculations

```rust
// src/battle.rs
#[rustler::nif(schedule = "DirtyCpu")]
fn resolve_battle(
    attacker: ArmyStats,
    defender: ArmyStats,
    terrain: TerrainType,
    dice_seed: u64,
) -> NifResult<BattleResult> {
    // Complex battle math in Rust
    let mut rng = StdRng::seed_from_u64(dice_seed);
    
    let attacker_roll = rng.gen_range(0..10);
    let defender_roll = rng.gen_range(0..10);
    
    let attacker_strength = calculate_strength(attacker, terrain, attacker_roll);
    let defender_strength = calculate_strength(defender, terrain, defender_roll);
    
    // Calculate casualties with complex formulas
    let casualties = calculate_casualties(attacker_strength, defender_strength);
    
    Ok(BattleResult {
        attacker_casualties: casualties.0,
        defender_casualties: casualties.1,
        winner: determine_winner(attacker_strength, defender_strength),
    })
}
```

### Trade Network Optimization

```rust
// src/trade.rs
use petgraph::graph::DiGraph;
use rayon::prelude::*;

#[rustler::nif(schedule = "DirtyCpu")]
fn calculate_trade_flow(nodes: Vec<TradeNode>) -> NifResult<Vec<TradeFlow>> {
    // Build trade graph
    let graph = build_trade_graph(&nodes);
    
    // Parallel computation using Rayon
    let flows: Vec<TradeFlow> = nodes
        .par_iter()
        .map(|node| calculate_node_flow(&graph, node))
        .collect();
    
    Ok(flows)
}
```

### Province Batch Updates

```rust
// src/province_batch.rs
use rayon::prelude::*;

#[rustler::nif(schedule = "DirtyCpu")]
fn batch_update_provinces(provinces: Vec<Province>) -> NifResult<Vec<ProvinceUpdate>> {
    // Process thousands of provinces in parallel
    let updates: Vec<ProvinceUpdate> = provinces
        .par_iter()
        .map(|province| {
            let tax = calculate_tax(province);
            let production = calculate_production(province);
            let unrest = calculate_unrest(province);
            
            ProvinceUpdate {
                id: province.id,
                tax,
                production,
                unrest,
            }
        })
        .collect();
    
    Ok(updates)
}
```

## Integration Pattern

```elixir
defmodule GameEngine do
  # Elixir coordinates, Rust calculates
  
  def process_daily_tick(tick) do
    # 1. Gather state from all provinces
    provinces = get_all_province_states()
    
    # 2. Send to Rust for batch calculation
    {:ok, updates} = :province_nif.batch_update_provinces(provinces)
    
    # 3. Apply updates back to GenServers
    Enum.each(updates, fn update ->
      GenServer.cast({:via, Registry, {ProvinceRegistry, update.id}}, 
                     {:apply_update, update})
    end)
  end
  
  def resolve_battle(attacker_pid, defender_pid) do
    # Get army states
    attacker = GenServer.call(attacker_pid, :get_stats)
    defender = GenServer.call(defender_pid, :get_stats)
    
    # Rust handles the math
    {:ok, result} = :battle_nif.resolve_battle(attacker, defender, terrain, :rand.uniform())
    
    # Apply results to GenServers
    GenServer.cast(attacker_pid, {:apply_casualties, result.attacker_casualties})
    GenServer.cast(defender_pid, {:apply_casualties, result.defender_casualties})
  end
end
```

## Modding System (Sandboxed Lua)

```elixir
defmodule ModRuntime do
  # Lua scripts run in sandboxed BEAM processes
  
  def load_mod(mod_path) do
    {:ok, lua} = Sandbox.new(memory_limit: 100_mb, cpu_time: 10_ms)
    
    # Load mod scripts
    :luerl.dofile(lua, Path.join(mod_path, "main.lua"))
    
    # Register event handlers
    register_mod_handlers(lua, mod_path)
  end
  
  def handle_event(event, lua_state) do
    # Mods can't crash the game
    try do
      :luerl.call_function([:on_event], [event], lua_state)
    catch
      _kind, _error ->
        Logger.error("Mod crashed processing event: #{inspect(event)}")
        :ok  # Game continues
    end
  end
end
```

## Multiplayer Architecture

```elixir
defmodule GameServer do
  # Commands replicated across all clients
  
  def handle_command(command, state) do
    # Validate command
    if valid_command?(command, state) do
      # Apply locally
      new_state = apply_command(command, state)
      
      # Broadcast to all clients
      Phoenix.PubSub.broadcast!(GamePubSub, "commands", command)
      
      {:ok, new_state}
    else
      {:error, :invalid_command}
    end
  end
end
```

## Save System

```elixir
defmodule SaveManager do
  def save_game(name) do
    # Gather state from all processes
    state = %{
      tick: TickScheduler.get_tick(),
      nations: get_all_nation_states(),
      provinces: get_all_province_states(),
      wars: get_all_war_states()
    }
    
    # Compress and save
    binary = :erlang.term_to_binary(state, [:compressed])
    File.write!("saves/#{name}.save", binary)
  end
  
  def load_game(name) do
    # Load and decompress
    binary = File.read!("saves/#{name}.save")
    state = :erlang.binary_to_term(binary)
    
    # Rebuild supervision tree with saved state
    rebuild_game_state(state)
  end
end
```

## Key Benefits of This Architecture

1. **Fault Tolerance**: Province crashes don't affect the game
2. **True Concurrency**: Millions of provinces process in parallel
3. **Hot Code Reloading**: Fix bugs without stopping games
4. **Performance**: Rust NIFs for CPU-intensive work
5. **Mod Safety**: Lua scripts can't crash the server
6. **Natural Distribution**: Scale across multiple servers easily
7. **Simple State Management**: Each entity is just a GenServer
8. **Built-in Monitoring**: Observer shows all process states
9. **Battle-Tested**: BEAM runs telecom systems with 99.9999% uptime
10. **Clean Separation**: Game logic in Elixir, math in Rust

This architecture can handle millions of daily ticks with thousands of players, while remaining stable for months-long campaigns. The BEAM provides the reliability and concurrency, while Rust provides the raw performance where needed.