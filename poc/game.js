document.addEventListener('alpine:init', () => {
    Alpine.data('game', () => ({
        // Game state
        provinces: Array(49).fill(null),
        armies: [],
        nations: [
            { id: 0, name: "Blue Empire", color: "#4169E1", treasury: 200, isPlayer: true, isAI: false },
            { id: 1, name: "Red Kingdom", color: "#DC143C", treasury: 200, isPlayer: false, isAI: true },
            { id: 2, name: "Green Republic", color: "#228B22", treasury: 200, isPlayer: false, isAI: true }
        ],
        tick: 0,
        paused: false,
        speed: 1000,
        selectedArmy: null,
        selectedProvince: null,
        interval: null,
        nextArmyId: 100,
        winner: null,
        gameOver: false,
        
        // Computed properties
        get income() {
            return this.provinces.filter(p => p === 0).length * 2;
        },
        
        get provinceCount() {
            return this.provinces.filter(p => p === 0).length;
        },
        
        get gold() {
            return this.nations[0].treasury;
        },
        
        // Initialize game
        init() {
            console.log('Initializing game...');
            
            // Set initial province ownership
            this.provinces[0] = 0;  // Player (blue)
            this.provinces[1] = 0;
            this.provinces[5] = 0;
            
            this.provinces[9] = 1;  // AI Red
            this.provinces[14] = 1;
            
            this.provinces[18] = 2; // AI Green
            this.provinces[19] = 2;
            
            // Create initial armies
            this.armies = [
                { id: 1, owner: 0, size: 1000, location: 0, moving: false, destination: null, movementProgress: 0, morale: 1.0, conquestProgress: 0 },
                { id: 2, owner: 1, size: 1000, location: 9, moving: false, destination: null, movementProgress: 0, morale: 1.0, conquestProgress: 0 },
                { id: 3, owner: 2, size: 1000, location: 19, moving: false, destination: null, movementProgress: 0, morale: 1.0, conquestProgress: 0 }
            ];
            
            // Start game loop
            this.restartLoop();
            
            console.log('Game initialized!');
        },
        
        // Get province owner
        getOwner(provinceId) {
            return this.provinces[provinceId];
        },
        
        // Get neighbors of a province
        getNeighbors(provinceId) {
            const x = provinceId % 7;
            const y = Math.floor(provinceId / 7);
            const neighbors = [];
            
            // Left
            if (x > 0) neighbors.push(provinceId - 1);
            // Right
            if (x < 6) neighbors.push(provinceId + 1);
            // Up
            if (y > 0) neighbors.push(provinceId - 7);
            // Down
            if (y < 6) neighbors.push(provinceId + 7);
            
            return neighbors;
        },
        
        // Check if province has any army
        hasArmy(provinceId) {
            return this.armies.some(a => a.location === provinceId);
        },
        
        // Get total army size at province
        getArmySize(provinceId) {
            const armies = this.armies.filter(a => a.location === provinceId);
            return armies.reduce((sum, a) => sum + a.size, 0);
        },
        
        // Get army owner at province
        getArmyOwner(provinceId) {
            const army = this.armies.find(a => a.location === provinceId);
            return army ? army.owner : null;
        },
        
        // Get army morale at province (for visual styling)
        getArmyMorale(provinceId) {
            const armiesHere = this.armies.filter(a => a.location === provinceId);
            if (armiesHere.length === 0) return 1.0;
            
            // Return average morale of all armies at this province
            const totalMorale = armiesHere.reduce((sum, a) => sum + a.morale, 0);
            return totalMorale / armiesHere.length;
        },
        
        // Get morale class for styling
        getMoraleClass(provinceId) {
            const morale = this.getArmyMorale(provinceId);
            if (morale >= 1.1) return 'high-morale';
            if (morale <= 0.6) return 'low-morale';
            return 'normal-morale';
        },
        
        // Check if selected army is at province
        hasSelectedArmy(provinceId) {
            return this.selectedArmy === provinceId;
        },
        
        // Get all player armies at a province
        getPlayerArmiesAt(provinceId) {
            return this.armies.filter(a => 
                a.location === provinceId && 
                a.owner === 0 && 
                !a.moving
            );
        },
        
        // Check if can move to province
        canMoveTo(provinceId) {
            if (this.selectedArmy === null) return false;
            // selectedArmy now represents the province ID where armies are located
            const sourceProvince = this.selectedArmy;
            return this.getNeighbors(sourceProvince).includes(provinceId);
        },
        
        // Get movement arrow direction and visibility
        getMovementArrow(provinceId) {
            const movingArmies = this.armies.filter(a => 
                a.location === provinceId && a.moving && a.destination !== null
            );
            
            if (movingArmies.length === 0) return false;
            
            // Get the destination of the first moving army
            const destination = movingArmies[0].destination;
            const sourceX = provinceId % 7;
            const sourceY = Math.floor(provinceId / 7);
            const destX = destination % 7;
            const destY = Math.floor(destination / 7);
            
            // Determine direction
            if (destX > sourceX) return 'arrow-right';
            if (destX < sourceX) return 'arrow-left';
            if (destY > sourceY) return 'arrow-down';
            if (destY < sourceY) return 'arrow-up';
            
            return false;
        },
        
        // Get movement progress display
        getMovementProgress(provinceId) {
            const movingArmies = this.armies.filter(a => 
                a.location === provinceId && a.moving && a.destination !== null
            );
            
            if (movingArmies.length === 0) return '';
            
            return movingArmies[0].movementProgress;
        },
        
        // Check if army is conquering this province
        isConquering(provinceId) {
            const armiesHere = this.armies.filter(a => a.location === provinceId && !a.moving);
            
            if (armiesHere.length === 1) {
                const army = armiesHere[0];
                const isConquering = this.provinces[provinceId] !== army.owner && army.conquestProgress > 0;
                if (isConquering) {
                    console.log(`Province ${provinceId} being conquered by army ${army.id}: progress ${army.conquestProgress}, province owner: ${this.provinces[provinceId]}, army owner: ${army.owner}`);
                }
                return isConquering;
            }
            return false;
        },
        
        // Get conquest progress for display
        getConquestProgress(provinceId) {
            const armiesHere = this.armies.filter(a => a.location === provinceId && !a.moving);
            
            if (armiesHere.length === 1) {
                const army = armiesHere[0];
                if (this.provinces[provinceId] !== army.owner && army.conquestProgress > 0) {
                    return `${army.conquestProgress}/2`;
                }
            }
            return '';
        },
        
        // Click on province
        clickProvince(provinceId) {
            console.log(`Clicked province ${provinceId}`);
            
            // Find all player armies at this province
            const playerArmies = this.getPlayerArmiesAt(provinceId);
            
            if (playerArmies.length > 0) {
                // Select all armies at this location for movement
                this.selectedArmy = provinceId; // Use provinceId to represent all armies there
                this.selectedProvince = null; // Clear province selection
                console.log(`Selected ${playerArmies.length} armies at province ${provinceId}`);
            } else {
                // Select province for building (only if player owns it)
                if (this.provinces[provinceId] === 0) {
                    this.selectedProvince = provinceId;
                    this.selectedArmy = null; // Clear army selection
                    console.log(`Selected province ${provinceId} for building`);
                } else {
                    // Clear all selections
                    this.selectedArmy = null;
                    this.selectedProvince = null;
                    console.log('Cleared selections');
                }
            }
        },
        
        // Move selected armies
        moveSelectedArmy(targetId) {
            if (this.selectedArmy === null) return;
            
            // Move all player armies from the selected province
            const sourceProvince = this.selectedArmy;
            const armiesToMove = this.getPlayerArmiesAt(sourceProvince);
            
            console.log(`Moving ${armiesToMove.length} armies from province ${sourceProvince} to ${targetId}`);
            
            armiesToMove.forEach(army => {
                army.moving = true;
                army.destination = targetId;
                army.movementProgress = 3; // Takes 3 ticks to move
            });
            
            this.selectedArmy = null;
        },
        
        // Build army at specific province
        buildArmyAt(provinceId) {
            if (this.nations[0].treasury < 50) return;
            if (this.provinces[provinceId] !== 0) return; // Must be player-owned
            
            const newArmy = {
                id: this.nextArmyId++,
                owner: 0,
                size: 1000,
                location: provinceId,
                moving: false,
                destination: null,
                movementProgress: 0,
                morale: 1.0,
                conquestProgress: 0
            };
            
            this.armies.push(newArmy);
            this.nations[0].treasury -= 50;
            
            console.log(`Built army ${newArmy.id} at province ${provinceId}`);
        },
        
        // Process one game tick
        processTick() {
            if (this.paused || this.gameOver) return;
            
            this.tick++;
            
            // Phase 1: Process army movement
            this.processMovement();
            
            // Phase 2: Process combat
            this.processCombat();
            
            // Phase 2.5: Process conquest (after combat, so battles resolve first)
            this.processConquest();
            
            // Phase 3: Process income
            this.processIncome();
            
            // Phase 4: Process AI every 2 ticks
            if (this.tick % 2 === 0) {
                this.processAI();
            }
            
            // Phase 5: Check for victory
            this.checkVictory();
        },
        
        // Process army movement
        processMovement() {
            this.armies.forEach(army => {
                if (army.moving && army.destination !== null) {
                    army.movementProgress--;
                    
                    if (army.movementProgress <= 0) {
                        // Army arrives at destination
                        army.location = army.destination;
                        army.moving = false;
                        army.destination = null;
                        army.movementProgress = 0;
                        
                        console.log(`Army ${army.id} (${army.owner}) arrived at province ${army.location}`);
                    }
                }
            });
        },
        
        // Process combat
        processCombat() {
            // Group armies by location
            const locations = {};
            this.armies.forEach(army => {
                if (!locations[army.location]) {
                    locations[army.location] = [];
                }
                locations[army.location].push(army);
            });
            
            // Check each location for battles
            Object.entries(locations).forEach(([location, armiesHere]) => {
                const owners = [...new Set(armiesHere.map(a => a.owner))];
                
                // Battle occurs if multiple nations present
                if (owners.length > 1) {
                    console.log(`Battle at province ${location}!`);
                    
                    // Calculate total force strength by nation (including morale)
                    const forces = owners.map(owner => {
                        const nationArmies = armiesHere.filter(a => a.owner === owner);
                        const totalStrength = nationArmies.reduce((sum, a) => sum + (a.size * a.morale), 0);
                        const rawStrength = nationArmies.reduce((sum, a) => sum + a.size, 0);
                        return {
                            owner,
                            totalStrength,
                            rawStrength,
                            armies: nationArmies
                        };
                    });
                    
                    // Log battle details
                    forces.forEach(force => {
                        const nationNames = ['Blue Empire', 'Red Kingdom', 'Green Republic'];
                        const avgMorale = force.armies.reduce((sum, a) => sum + a.morale, 0) / force.armies.length;
                        console.log(`${nationNames[force.owner]}: ${Math.round(force.totalStrength)} effective strength (${force.rawStrength} troops, ${Math.round(avgMorale * 100)}% morale, ${force.armies.length} armies)`);
                    });
                    
                    // Sort by strength (strongest first)
                    forces.sort((a, b) => b.totalStrength - a.totalStrength);
                    
                    const winner = forces[0];
                    const losers = forces.slice(1);
                    
                    console.log(`Winner: ${['Blue Empire', 'Red Kingdom', 'Green Republic'][winner.owner]} with ${Math.round(winner.totalStrength)} effective strength`);
                    
                    // Remove losing armies
                    losers.forEach(force => {
                        force.armies.forEach(army => {
                            const idx = this.armies.indexOf(army);
                            if (idx > -1) {
                                this.armies.splice(idx, 1);
                                console.log(`Army ${army.id} (${army.size} troops) destroyed`);
                            }
                        });
                    });
                    
                    // Winner takes casualties based on total enemy strength
                    const totalEnemyStrength = losers.reduce((sum, force) => sum + force.totalStrength, 0);
                    const casualtyRate = Math.min(0.5, totalEnemyStrength / winner.totalStrength * 0.3); // Max 50% casualties
                    
                    winner.armies.forEach(army => {
                        const oldSize = army.size;
                        const oldMorale = army.morale;
                        
                        // Apply casualties
                        const newSize = Math.floor(army.size * (1 - casualtyRate));
                        army.size = Math.max(100, newSize); // Minimum 100 troops survive
                        
                        // Morale changes based on battle outcome
                        if (casualtyRate > 0.3) {
                            // Heavy casualties - morale drops significantly
                            army.morale = Math.max(0.3, army.morale - 0.3);
                        } else if (casualtyRate > 0.1) {
                            // Moderate casualties - slight morale drop
                            army.morale = Math.max(0.5, army.morale - 0.1);
                        } else {
                            // Victory with low casualties - morale boost!
                            army.morale = Math.min(1.2, army.morale + 0.1);
                        }
                        
                        console.log(`Army ${army.id}: ${oldSize} → ${army.size} troops (${Math.round(casualtyRate * 100)}% casualties), morale ${Math.round(oldMorale * 100)}% → ${Math.round(army.morale * 100)}%`);
                    });
                    
                    // Winner captures the province
                    const provinceId = parseInt(location);
                    if (this.provinces[provinceId] !== winner.owner) {
                        this.provinces[provinceId] = winner.owner;
                        console.log(`Province ${provinceId} captured by nation ${winner.owner} after winning battle`);
                    }
                    
                    console.log(`Battle complete at province ${location}`);
                }
            });
        },
        
        // Process conquest attempts
        processConquest() {
            // For each province, check if it should be captured
            for (let provinceId = 0; provinceId < 49; provinceId++) {
                const armiesHere = this.armies.filter(a => a.location === provinceId && !a.moving);
                
                if (armiesHere.length === 1) {
                    // Single army present
                    const army = armiesHere[0];
                    
                    if (this.provinces[provinceId] !== army.owner) {
                        // Army is trying to conquer enemy/neutral territory
                        army.conquestProgress++;
                        console.log(`Army ${army.id} conquering province ${provinceId}: ${army.conquestProgress}/2 ticks (province owner: ${this.provinces[provinceId]}, army owner: ${army.owner})`);
                        
                        if (army.conquestProgress >= 2) {
                            // Conquest complete!
                            this.provinces[provinceId] = army.owner;
                            army.conquestProgress = 0;
                            console.log(`Province ${provinceId} conquered by nation ${army.owner} after 2 ticks`);
                        }
                    } else {
                        // Army is in friendly territory, reset conquest progress
                        army.conquestProgress = 0;
                    }
                } else if (armiesHere.length > 1) {
                    // Multiple armies present - reset all conquest progress (combat happening)
                    armiesHere.forEach(army => {
                        army.conquestProgress = 0;
                    });
                } else {
                    // No armies present - nothing to do
                }
            }
        },
        
        // Process income
        processIncome() {
            // Income for all nations
            this.nations.forEach(nation => {
                const provinceCount = this.provinces.filter(p => p === nation.id).length;
                const income = provinceCount * 2;
                nation.treasury += income;
            });
        },
        
        // AI processing - runs every 2 ticks
        processAI() {
            if (this.gameOver) return;
            
            [1, 2].forEach(nationId => {
                this.aiThink(nationId);
            });
        },
        
        // Strategic AI thinking
        aiThink(nationId) {
            // Step 1: Build armies if we have enough gold
            const nation = this.nations[nationId];
            
            if (Math.random() < 0.1 && nation.treasury >= 50) {
                const buildLocation = this.provinces.findIndex(p => p === nationId);
                if (buildLocation !== -1) {
                    this.armies.push({
                        id: this.nextArmyId++,
                        owner: nationId,
                        size: 1000,
                        location: buildLocation,
                        moving: false,
                        destination: null,
                        movementProgress: 0,
                        morale: 1.0,
                        conquestProgress: 0
                    });
                    nation.treasury -= 50;
                }
            }
            
            // Step 2: Move armies strategically
            const myArmies = this.armies.filter(a => 
                a.owner === nationId && !a.moving
            );
            
            myArmies.forEach(army => {
                const target = this.findBestTarget(nationId, army);
                if (target !== null) {
                    army.moving = true;
                    army.destination = target;
                    army.movementProgress = 3;
                }
            });
        },
        
        // Find best target for an army using strategic priorities
        findBestTarget(nationId, army) {
            const neighbors = this.getNeighbors(army.location);
            
            // Priority 1: Defend our provinces under attack
            for (const neighborId of neighbors) {
                if (this.provinces[neighborId] === nationId) {
                    // Check if this friendly province has enemy armies
                    const enemyArmies = this.armies.filter(a => 
                        a.location === neighborId && a.owner !== nationId
                    );
                    if (enemyArmies.length > 0) {
                        console.log(`AI ${nationId}: Defending province ${neighborId} from attack`);
                        return neighborId; // Defend!
                    }
                }
            }
            
            // Priority 2: Attack weak enemy targets
            let bestTarget = null;
            let bestScore = -999;
            
            for (const neighborId of neighbors) {
                if (this.provinces[neighborId] === nationId) {
                    continue; // Already ours
                }
                
                let score = 0;
                
                // Prefer enemy provinces over neutral
                if (this.provinces[neighborId] !== null) {
                    score += 15; // Attack enemy territory
                } else {
                    score += 10; // Expand into neutral territory
                }
                
                // Calculate defender strength
                const defenders = this.armies.filter(a => a.location === neighborId);
                const defenderStrength = defenders.reduce((sum, a) => sum + (a.size * a.morale), 0);
                const attackerStrength = army.size * army.morale;
                
                // Prefer targets we can beat
                if (defenderStrength === 0) {
                    score += 20; // Undefended!
                } else if (attackerStrength > defenderStrength * 1.2) {
                    score += 10; // We're much stronger
                } else if (attackerStrength > defenderStrength) {
                    score += 5; // We're slightly stronger
                } else {
                    score -= 10; // They're stronger, avoid
                }
                
                // Prefer targets closer to enemy capitals (more strategic value)
                const enemyCapitals = [0, 9, 18]; // Starting positions
                for (const capital of enemyCapitals) {
                    if (this.provinces[capital] !== nationId && this.provinces[capital] !== null) {
                        const distance = Math.abs((neighborId % 7) - (capital % 7)) + 
                                       Math.abs(Math.floor(neighborId / 7) - Math.floor(capital / 7));
                        score += Math.max(0, 10 - distance); // Closer = better
                    }
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestTarget = neighborId;
                }
            }
            
            // Only move if we found a decent target
            if (bestScore > 5) {
                console.log(`AI ${nationId}: Army ${army.id} attacking province ${bestTarget} (score: ${bestScore})`);
                return bestTarget;
            }
            
            return null; // No good targets, stay put
        },
        
        // Check for victory
        checkVictory() {
            // Count provinces for each nation
            const provinceCounts = [0, 0, 0];
            this.provinces.forEach(owner => {
                if (owner !== null) {
                    provinceCounts[owner]++;
                }
            });
            
            // Check if any nation has 37 or more provinces (75% of 49)
            for (let i = 0; i < 3; i++) {
                if (provinceCounts[i] >= 37) {
                    this.winner = i;
                    this.gameOver = true;
                    this.paused = true;
                    
                    const nationNames = ['Blue Empire', 'Red Kingdom', 'Green Republic'];
                    console.log(`${nationNames[i]} wins the game!`);
                    alert(`🎉 ${nationNames[i]} wins the game! 🎉\n\nProvinces controlled: ${provinceCounts[i]}/49`);
                    return;
                }
            }
        },
        
        // Set game speed
        setSpeed(newSpeed) {
            this.speed = newSpeed;
            this.restartLoop();
        },
        
        // Restart game loop with current speed
        restartLoop() {
            if (this.interval) {
                clearInterval(this.interval);
            }
            this.interval = setInterval(() => this.processTick(), this.speed);
        }
    }));
});