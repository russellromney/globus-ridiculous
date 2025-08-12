# Grand Strategy Game Design Document

## Overview
A massively parallel grand strategy game inspired by Europa Universalis IV, designed for millions of concurrent entities processing daily ticks without performance degradation. Built on a worker pool architecture with lock-free data structures and parallel processing throughout.

## Core Architecture

### Time System
```
DailyTickSystem:
    current_tick: integer (days since start)
    tick_rate: configurable (ms per day)
    speed_multiplier: [0, 0.5, 1, 2, 5]
    
    tick_loop:
        broadcast daily_tick to all systems
        process async command queue
        wait for next tick
```

### Worker Pool System
```
WorkerPoolArchitecture:
    num_workers: cpu_cores * 2
    work_queues: [high_priority, medium_priority, low_priority]
    
    specialized_pools:
        compute_pool: cpu_intensive_work
        io_pool: state_operations
        network_pool: multiplayer_sync
        ai_pool: ai_decisions
    
    process_pattern:
        partition work into chunks
        parallel_map across workers
        parallel_reduce results
        atomic_apply changes
```

### Command Pattern
```
Command:
    id: unique_identifier
    tick: game_tick
    type: action_type
    actor: entity_performing
    data: action_data
    
Event:
    command_id: triggering_command
    type: event_type
    affected: [entity_ids]
    delta: state_change
```

## Game Entities

### Nation
```
Nation:
    // Core State
    treasury: atomic_int
    stability: -3 to 3
    action_points: map[category -> points]
    provinces: [province_ids]
    
    // Government
    government_type: enum
    legitimacy: 0-100
    ruler: Leader
    
    // Resources
    manpower: current/max
    
    // Diplomatic
    relations: map[nation -> relation_value]
    truces: map[nation -> end_date]
    
    // Processed Daily
    process_daily:
        calculate_income()
        regenerate_action_points()
        check_stability_events()
```

### Province
```
Province:
    // Ownership
    owner: nation_id
    controller: nation_id (if occupied)
    
    // Development
    development: 1-30
    devastation: 0-100
    prosperity: 0-100
    
    // Population
    population_total: integer
    class_distribution: map[class -> percentage]
    
    // Economy
    trade_good: enum
    trade_value: float
    production: float
    
    // Military
    fort_level: 0-9
    garrison: integer
    
    // Culture/Religion
    culture: enum
    religion: enum
    
    // Unrest
    unrest: 0-10
    recent_uprising: date
    
    // Processed Daily
    process_daily:
        calculate_tax()
        calculate_production()
        update_unrest()
        check_rebellion()
```

### Army
```
Army:
    // Composition
    size: integer (men)
    morale: 0-100%
    
    // Location
    location: province_id
    movement_target: province_id or null
    movement_progress: 0-30 (days)
    
    // Status
    in_battle: boolean
    besieging: boolean
    
    // Leadership
    general: Leader or null
    
    // Processed Daily
    process_daily:
        handle_movement()
        consume_supplies()
        regenerate_morale()
        check_attrition()
```

### War
```
War:
    // Participants
    attackers: [nation_ids]
    defenders: [nation_ids]
    
    // Goals
    war_goal: enum
    target_provinces: [province_ids]
    
    // Progress
    war_score: -100 to 100
    battles: [battle_records]
    occupied_provinces: map[province -> occupier]
    
    // Resolution
    ticking_war_score: float
    war_exhaustion: map[nation -> float]
    
    // Processed Daily
    process_daily:
        calculate_war_score()
        apply_war_exhaustion()
        check_peace_conditions()
```

## System Mechanics

### Government System
```
Government:
    base_type: [TRIBAL, MONARCHY, REPUBLIC, THEOCRACY, etc]
    
    characteristics:
        centralization: -100 to 100
        legitimacy_source: [DIVINE, POPULAR, MILITARY, etc]
        succession_type: enum
        power_distribution: map[estate -> power]
        reform_progress: 0-100
    
    reforms: tree_structure
        each_reform:
            requirements: [conditions]
            effects: [modifiers]
            enables: [next_reforms]
    
    calculate_modifiers:
        parallel_map all characteristics
        return combined_modifiers
```

### Religion System
```
Religion:
    base_religion: enum
    denomination: enum
    
    authority: 0-100
    fervor: 0-100
    
    spread_mechanics:
        trade_spread: along_trade_routes
        conquest_spread: immediate_conversion_option
        missionary_spread: active_conversion
        center_of_reformation: area_spread
    
    tolerance:
        true_faith: bonus
        heretic: penalty
        heathen: major_penalty
```

### Class/Estate System
```
Classes:
    types: [PEASANTS, ARTISANS, MERCHANTS, CLERGY, NOBLES, SOLDIERS, BUREAUCRATS]
    
    per_province:
        distribution: map[class -> percentage]
        power: map[class -> influence]
        happiness: map[class -> satisfaction]
    
    class_demands:
        PEASANTS: [low_taxes, peace, food_security]
        MERCHANTS: [open_trade, low_tariffs, property_rights]
        NOBLES: [land_rights, tax_exemptions, privileges]
        CLERGY: [religious_authority, moral_laws]
        SOLDIERS: [regular_pay, victories, land_grants]
    
    class_production:
        each_class_produces_different_resources
        happiness_affects_production
        power_affects_political_influence
```

### Leader System
```
Leader:
    stats:
        administrative: 0-10
        diplomatic: 0-10
        military: 0-10
        
    personality:
        traits: [ambitious, cautious, cruel, just, etc]
        focus: enum
        class_affinity: preferred_class
        
    legitimacy_modifiers:
        dynastic_claim: float
        victories/defeats: integer
        years_ruling: integer
        
    generates_action_points:
        base + stat_bonus + class_support
```

### Technology & Institutions
```
Technology:
    categories:
        administrative: 0-50
        diplomatic: 0-50
        military: 0-50
    
    ahead_of_time_penalty: exponential_cost
    neighbor_discount: -5% per neighbor with tech
    
Institutions:
    types: [FEUDALISM, RENAISSANCE, COLONIALISM, etc]
    
    spread:
        origin_point: province_id
        spread_rate: based_on_factors
        adoption_cost: based_on_development
    
    not_embraced_penalty: +50% tech_cost per missing
```

### Trade System
```
TradeNetwork:
    nodes: graph_structure
    
    trade_node:
        incoming_value: sum_of_incoming
        local_production: from_provinces
        outgoing_routes: [downstream_nodes]
        
    merchant_actions:
        collect: take_percentage
        steer: direct_flow
        
    calculate_trade:
        parallel_process_nodes
        iterate_until_convergence
```

### Colonization System
```
Colonization:
    exploration:
        terra_incognita: hidden_areas
        exploration_range: from_controlled_provinces
        
    colony_establishment:
        send_colonist: costs_money
        growth_rate: based_on_climate_and_investment
        native_aggression: risk_factor
        
    colonial_nations:
        form_when: 5_provinces_in_region
        liberty_desire: based_on_strength
        provides: trade_and_taxes
```

### Diplomacy System
```
Diplomacy:
    relations: -200 to 200
    
    actions:
        alliance: mutual_defense
        royal_marriage: succession_chance
        vassal: subject_nation
        guarantee: one_way_protection
        trade_agreement: economic_cooperation
        
    aggressive_expansion:
        calculated_per_conquest
        distance_reduces_impact
        same_culture_religion_increases
        
    coalitions:
        form_when: AE > 50 and 4+ nations
        act_as: defensive_alliance
```

### War & Combat
```
Combat:
    battle_resolution:
        compare_army_strengths
        apply_dice_rolls
        factor_in_terrain
        factor_in_generals
        calculate_casualties
        
    siege_mechanics:
        progress_based_on_artillery
        fort_level_affects_time
        breach_possible
        
    war_exhaustion:
        increases_from_battles
        increases_from_occupation
        affects_unrest_and_costs
```

### Rebel System
```
Rebels:
    types:
        SEPARATIST: wants_independence
        RELIGIOUS: wants_conversion
        NOBLE: wants_government_change
        PEASANT: wants_autonomy
        PRETENDER: wants_throne
        
    spawn_when:
        unrest > 10
        or progress_hits_100
        
    if_succeed:
        enforce_demands_based_on_type
```

## AI System

### Strategic Layer
```
StrategicAI:
    personality: [EXPANSIONIST, BUILDER, TRADER, DEFENDER, etc]
    
    evaluate_monthly:
        analyze_threats()
        identify_opportunities()
        set_monthly_goals()
        
    threat_assessment:
        border_friction
        power_differential
        alliance_webs
        historical_rivalry
```

### Tactical Layer
```
TacticalAI:
    daily_decisions:
        if under_attack: emergency_response()
        elif internal_crisis: handle_crisis()
        else: work_toward_goals()
        
    evaluate_actions:
        parallel_score_all_options
        weight_by_personality
        select_best_within_action_points
```

### Military AI
```
MilitaryAI:
    army_stances: [AGGRESSIVE, DEFENSIVE, SIEGE]
    
    evaluate_battles:
        predict_outcome_probability
        consider_terrain
        weigh_strategic_value
        
    coordinate_fronts:
        distribute_armies
        maintain_supply_lines
        prioritize_targets
```

## Save System

```
SaveSystem:
    format:
        snapshots: every_100_ticks
        commands: since_last_snapshot
        
    save_game:
        pause_at_tick_boundary
        gather_all_entity_states
        compress_and_write
        
    load_game:
        restore_snapshot
        replay_commands_to_current_tick
        resume_simulation
```

## Multiplayer Architecture

```
Multiplayer:
    synchronization:
        clients_send_commands_only
        server_validates_and_broadcasts
        all_clients_run_same_simulation
        
    speed_control:
        slowest_player_determines_speed
        pause_requires_one_player
        unpause_requires_all_players
```

## Performance Optimizations

```
Optimizations:
    spatial_partitioning:
        provinces_in_regions
        armies_in_quadtree
        
    caching:
        modifier_calculations: update_every_10_ticks
        trade_routes: recalculate_on_change
        
    lazy_evaluation:
        diplomatic_reputation: when_needed
        supply_range: when_army_moves
        
    batch_processing:
        group_similar_calculations
        process_by_region
        aggregate_before_broadcast
        
    memory_pools:
        pre_allocate_common_objects
        reuse_instead_of_allocate
```

## Key Design Principles

1. **Everything in Parallel** - No sequential loops over game entities
2. **Lock-Free Where Possible** - Atomic operations over mutexes  
3. **Event-Driven** - React to changes rather than polling
4. **Spatial Partitioning** - Process nearby things together
5. **Worker Pools** - Fixed threads, distributed work
6. **Command Pattern** - All actions as commands for replay/save
7. **Lazy Evaluation** - Calculate only when needed
8. **Batch Processing** - Group similar operations
9. **Memory Pools** - Avoid allocation in hot paths
10. **Progressive Complexity** - Start simple, add depth through interactions

## Starting Implementation Order

1. Basic time system with daily ticks
2. Province and Nation entities with parallel update
3. Simple economy (tax/production)
4. Basic war system
5. Worker pool architecture
6. Save/load system
7. Simple AI
8. Government types
9. Trade network
10. Multiplayer synchronization

Each system should be built with parallel processing in mind from the start, using the worker pool pattern for all entity updates and atomic operations for shared state modifications.