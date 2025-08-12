# Modding Architecture for Grand Strategy Game

## Core Modding Philosophy

The game should be **data-driven** with a **scripting layer** for logic. Core engine handles performance-critical parallel processing, while mods define content and rules.

## Modding System Architecture

### 1. Data Definition Layer (JSON/YAML/TOML)

```
ModStructure:
    /mods
        /base_game              # Vanilla game is just a mod
            /common
                /governments
                /religions  
                /cultures
                /trade_goods
                /technologies
                /ideas
            /events
            /decisions
            /localization
            /assets
            mod.manifest
        /user_mod_1
            mod.manifest        # Declares what it modifies
            /common            # Overrides/extends base
            /events            # New events
```

### 2. Mod Manifest System

```yaml
# mod.manifest
mod:
    name: "Total Conversion: Fantasy World"
    version: "1.0.0"
    game_version: "1.5.x"
    
    dependencies:
        - mod_id: "base_game"
          version: ">=1.5.0"
        - mod_id: "community_patch"
          optional: true
    
    load_order:
        priority: 100  # Higher loads later, overrides earlier
    
    modifies:
        - governments: replace  # Full replacement
        - provinces: extend     # Adds to existing
        - events: extend
        - core_rules: override  # Dangerous but powerful
    
    compatibility_tags:
        - "total_conversion"
        - "multiplayer_compatible"
        - "achievement_compatible": false
```

### 3. Data File Examples

```yaml
# /common/governments/monarchy.yaml
monarchy:
    base_type: MONARCHY
    
    valid_for:
        - culture_groups: [european, middle_eastern]
        - tech_level: {admin: ">=5"}
        - not: {has_reform: tribal_federation}
    
    modifiers:
        tax_efficiency: 0.10
        stability_cost: -0.10
        max_absolutism: 20
        noble_influence: 0.10
        
    mechanics:
        succession: hereditary
        heir_generation: true
        consort_generation: true
        
    reforms:
        tier_1:
            - reform_id: nobles_in_court
            - reform_id: limit_noble_privilege
        tier_2:
            - reform_id: centralized_bureaucracy
            - reform_id: regional_autonomy
            
    ai_weight:
        base: 100
        modifier:
            factor: 2.0
            has_idea_group: aristocracy
```

```yaml
# /common/trade_goods/silk.yaml
silk:
    id: silk
    
    base_price: 4.0
    
    province_modifiers:
        local_production_efficiency: 0.10
        province_trade_power: 5
        
    global_modifiers:  # If trading in
        prestige: 0.5
        
    production_leader:  # Bonus for controlling most production
        diplomatic_reputation: 1
        
    events:
        - silk_worm_disease: {mtth: 1200}
        - silk_road_prosperity: {mtth: 2400}
```

### 4. Scripting Language for Logic

```lua
-- /events/economic_events.lua

event.define("market_crash", {
    -- Trigger conditions (checked daily in parallel)
    trigger = function(nation)
        return nation.inflation > 10 
            and nation.loans > 5
            and random() < 0.01
    end,
    
    -- Weight for AI choosing options
    ai_weight = function(nation, option)
        if option.id == "austerity" then
            return nation.ruler.stats.administrative * 10
        else
            return nation.ruler.stats.diplomatic * 10
        end
    end,
    
    -- Event execution
    execute = function(nation)
        ui.show_event({
            title = loc("market_crash.title"),
            desc = loc("market_crash.desc"),
            picture = "economy_crisis",
            
            options = {
                {
                    id = "austerity",
                    text = loc("market_crash.austerity"),
                    effect = function()
                        nation:add_modifier("austerity_measures", 365)
                        nation:add_stability(-1)
                        nation:add_inflation(-5)
                    end
                },
                {
                    id = "bailout",
                    text = loc("market_crash.bailout"),
                    effect = function()
                        nation:add_treasury(-500)
                        nation:add_inflation(2)
                        nation:add_modifier("market_confidence", 180)
                    end
                }
            }
        })
    end
})
```

### 5. Rule Override System

```lua
-- /common/rules/combat_rules.lua

rules.override("calculate_battle_casualties", function(original_func)
    return function(attacker, defender, terrain)
        -- Call original game logic
        local casualties = original_func(attacker, defender, terrain)
        
        -- Mod addition: magic units take less casualties
        if attacker:has_unit_type("mage") then
            casualties.attacker = casualties.attacker * 0.5
        end
        
        return casualties
    end
end)

rules.add("parallel_process_provinces", function(province)
    -- Runs in parallel province processing
    if province:has_building("mage_tower") then
        province:add_local_modifier("magical_aura", 1)
    end
end)
```

### 6. Mod Loading System

```
ModLoader:
    initialization:
        1. scan_mod_directory()
        2. build_dependency_graph()
        3. topological_sort_mods()
        4. validate_compatibility()
        
    loading_phases:
        PHASE_1_DATA:
            - load_all_data_files()
            - merge_based_on_load_order()
            - validate_data_schema()
            
        PHASE_2_SCRIPTS:
            - compile_lua_scripts()
            - register_event_handlers()
            - register_rule_overrides()
            
        PHASE_3_ASSETS:
            - load_textures_async()
            - load_sounds_async()
            - build_asset_cache()
            
        PHASE_4_LOCALIZATION:
            - load_all_languages()
            - build_string_tables()
            
    hot_reload_support:
        if development_mode:
            watch_mod_files()
            on_change: reload_affected_systems()
```

### 7. Sandboxed Scripting Environment

```
ScriptSandbox:
    -- Mods can only access exposed APIs
    
    exposed_apis:
        nation: {
            -- Read access
            get_treasury, get_stability, get_provinces,
            get_ruler, get_modifiers, get_ideas,
            
            -- Write access (validated)
            add_treasury, add_stability, add_modifier,
            
            -- Restricted (needs permission)
            delete_nation, merge_nations
        }
        
        province: {
            get_owner, get_development, get_trade_good,
            set_owner, add_development, change_trade_good
        }
        
        game: {
            get_date, get_all_nations, get_all_provinces,
            spawn_nation, trigger_event
        }
        
    security:
        no_file_system_access
        no_network_access
        no_process_spawning
        memory_limit: 100MB per mod
        cpu_time_limit: 10ms per tick per mod
        
    parallel_safe_apis:
        -- These can be called from parallel contexts
        atomic_add, atomic_compare_swap,
        thread_safe_random, read_only_access
```

### 8. Data Validation Schema

```yaml
# /schemas/government_schema.yaml
government:
    type: object
    required: [base_type, modifiers]
    properties:
        base_type:
            type: string
            enum: [MONARCHY, REPUBLIC, THEOCRACY, TRIBAL]
        modifiers:
            type: object
            additionalProperties:
                type: number
                min: -1.0
                max: 1.0
        reforms:
            type: object
            additionalProperties:
                type: array
                items:
                    $ref: "#/definitions/reform"
```

### 9. Mod Compatibility System

```
CompatibilityChecker:
    check_compatibility(mod_list):
        conflicts = []
        
        for mod_a, mod_b in combinations(mod_list):
            -- Check for conflicts
            if mod_a.modifies.provinces == "replace" 
               and mod_b.modifies.provinces == "replace":
                conflicts.append("Both modify provinces")
                
            -- Check for incompatible tags
            if "total_conversion" in mod_a.tags 
               and "total_conversion" in mod_b.tags:
                conflicts.append("Multiple total conversions")
                
        return conflicts
        
    merge_strategy(base, mod_data, strategy):
        match strategy:
            "replace": return mod_data
            "extend": return base + mod_data
            "override": return deep_merge(base, mod_data)
            "remove": return base - mod_data
```

### 10. Performance-Safe Modding Patterns

```lua
-- Mods register handlers that run in the engine's parallel system

-- GOOD: Register a handler that runs in parallel
mod.register_parallel_handler("daily_province_update", function(province)
    -- This runs in a worker thread
    if province:has_modifier("blessed_land") then
        province:add_base_tax(0.01)
    end
end)

-- BAD: Don't let mods control parallelization
-- mod.foreach_province(function(p) ... end)  -- NOT ALLOWED

-- GOOD: Event-driven reactions
mod.on_event("war_declared", function(war)
    -- React to engine events
    if war.attacker:has_idea("pacifist_traditions") then
        war.attacker:add_stability(-2)
    end
end)

-- GOOD: Bulk operations that engine parallelizes
mod.register_bulk_operation("monthly_culture_conversion", {
    filter = function(province)
        return province:has_modifier("cultural_center")
    end,
    operation = function(province)
        province:shift_culture_toward(province.owner.primary_culture, 0.01)
    end
})
```

### 11. Mod Development Tools

```
ModDevTools:
    console_commands:
        reload_mod(mod_id)      # Hot reload
        validate_mod(mod_id)    # Check for errors
        profile_mod(mod_id)     # Performance analysis
        test_mod_event(event)   # Trigger specific event
        
    debugging:
        mod_logger:             # Separate log per mod
            log_level: DEBUG
            output: /logs/mods/{mod_id}.log
            
        error_handling:
            on_script_error: pause_and_show_debugger
            stack_traces: include_lua_context
            
    performance_monitoring:
        track_per_mod:
            cpu_time_per_tick
            memory_usage
            events_triggered
            parallel_operations_queued
```

### 12. Workshop Integration

```
WorkshopIntegration:
    publishing:
        package_mod()           # Create .mod package
        validate_for_workshop() # Check guidelines
        upload_to_workshop()    # Steam/platform integration
        
    downloading:
        subscribe_to_mod()
        auto_download()
        verify_checksum()
        
    multiplayer:
        host_shares_modlist()
        clients_auto_download()
        verify_same_version()
        checksum_validation()
```

### 13. Example: Total Conversion Mod Structure

```
/mods/fantasy_total_conversion/
    mod.manifest
    
    /common/
        /governments/
            magical_empire.yaml
            druidic_circle.yaml
        /religions/
            elemental_worship.yaml
            void_cult.yaml
        /races/              # New data type
            elves.yaml
            dwarves.yaml
        /magic_schools/      # New system
            fire.yaml
            necromancy.yaml
            
    /scripts/
        magic_system.lua     # New mechanics
        racial_traits.lua
        
    /events/
        magical_disasters.lua
        racial_conflicts.lua
        
    /rules/
        override_combat.lua  # Magic in battles
        override_tech.lua    # Replace with magic research
        
    /assets/
        /textures/
        /sounds/
        /models/            # For 3D map objects
```

## Key Modding Principles

1. **Data-Driven**: Most content in data files, not code
2. **Sandboxed**: Mods can't break the engine
3. **Parallel-Safe**: Mods work with the parallel architecture
4. **Validated**: All mod data validated against schemas
5. **Mergeable**: Multiple mods can modify same systems
6. **Hot-Reloadable**: Change mods without restarting
7. **Performance-Monitored**: Track mod performance impact
8. **Version-Controlled**: Handle game updates gracefully
9. **Multiplayer-Compatible**: Automatic sync and validation
10. **Well-Documented**: Auto-generated API documentation

This architecture allows modders to create anything from small balance tweaks to total conversions while maintaining the game's parallel performance characteristics. The engine handles all the complex parallel processing while mods define the rules and content that run within that framework.