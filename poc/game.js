document.addEventListener('alpine:init', () => {
    Alpine.data('game', () => ({
        // Game state
        provinces: Array(20).fill(null),
        armies: [],
        gold: 200,
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
                { id: 1, owner: 0, size: 1000, location: 0, moving: false, destination: null },
                { id: 2, owner: 1, size: 1000, location: 9, moving: false, destination: null },
                { id: 3, owner: 2, size: 1000, location: 19, moving: false, destination: null }
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
            const x = provinceId % 5;
            const y = Math.floor(provinceId / 5);
            const neighbors = [];
            
            // Left
            if (x > 0) neighbors.push(provinceId - 1);
            // Right
            if (x < 4) neighbors.push(provinceId + 1);
            // Up
            if (y > 0) neighbors.push(provinceId - 5);
            // Down
            if (y < 3) neighbors.push(provinceId + 5);
            
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
            });
            
            this.selectedArmy = null;
        },
        
        // Build army at specific province
        buildArmyAt(provinceId) {
            if (this.gold < 50) return;
            if (this.provinces[provinceId] !== 0) return; // Must be player-owned
            
            const newArmy = {
                id: this.nextArmyId++,
                owner: 0,
                size: 1000,
                location: provinceId,
                moving: false,
                destination: null
            };
            
            this.armies.push(newArmy);
            this.gold -= 50;
            
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
                    // Army arrives at destination
                    army.location = army.destination;
                    army.moving = false;
                    
                    // Capture province if not owned by army's nation
                    if (this.provinces[army.destination] !== army.owner) {
                        this.provinces[army.destination] = army.owner;
                        console.log(`Province ${army.destination} captured by nation ${army.owner}`);
                    }
                    
                    army.destination = null;
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
                    
                    // Calculate total force strength by nation
                    const forces = owners.map(owner => {
                        const nationArmies = armiesHere.filter(a => a.owner === owner);
                        const totalStrength = nationArmies.reduce((sum, a) => sum + a.size, 0);
                        return {
                            owner,
                            totalStrength,
                            armies: nationArmies
                        };
                    });
                    
                    // Log battle details
                    forces.forEach(force => {
                        const nationNames = ['Blue Empire', 'Red Kingdom', 'Green Republic'];
                        console.log(`${nationNames[force.owner]}: ${force.totalStrength} troops (${force.armies.length} armies)`);
                    });
                    
                    // Sort by strength (strongest first)
                    forces.sort((a, b) => b.totalStrength - a.totalStrength);
                    
                    const winner = forces[0];
                    const losers = forces.slice(1);
                    
                    console.log(`Winner: ${['Blue Empire', 'Red Kingdom', 'Green Republic'][winner.owner]} with ${winner.totalStrength} troops`);
                    
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
                        const newSize = Math.floor(army.size * (1 - casualtyRate));
                        console.log(`Army ${army.id}: ${army.size} → ${newSize} troops (${Math.round(casualtyRate * 100)}% casualties)`);
                        army.size = Math.max(100, newSize); // Minimum 100 troops survive
                    });
                    
                    console.log(`Battle complete at province ${location}`);
                }
            });
        },
        
        // Process income
        processIncome() {
            // Player income
            const playerProvinces = this.provinces.filter(p => p === 0).length;
            this.gold += playerProvinces * 2;
        },
        
        // AI processing - runs every 2 ticks
        processAI() {
            if (this.gameOver) return;
            
            [1, 2].forEach(nationId => {
                // Get AI's armies
                const aiArmies = this.armies.filter(a => 
                    a.owner === nationId && !a.moving
                );
                
                // More aggressive movement - 80% chance to move
                aiArmies.forEach(army => {
                    if (Math.random() < 0.8) {
                        const neighbors = this.getNeighbors(army.location);
                        if (neighbors.length > 0) {
                            // Prefer attacking enemy/neutral territories
                            const targets = neighbors.filter(neighborId => 
                                this.provinces[neighborId] !== nationId
                            );
                            
                            let target;
                            if (targets.length > 0) {
                                // Attack enemy/neutral territory
                                target = targets[Math.floor(Math.random() * targets.length)];
                            } else {
                                // Move randomly if no good targets
                                target = neighbors[Math.floor(Math.random() * neighbors.length)];
                            }
                            
                            army.moving = true;
                            army.destination = target;
                        }
                    }
                });
                
                // Build armies occasionally - 10% chance every AI tick
                if (Math.random() < 0.1) {
                    const buildLocation = this.provinces.findIndex(p => p === nationId);
                    if (buildLocation !== -1) {
                        this.armies.push({
                            id: this.nextArmyId++,
                            owner: nationId,
                            size: 1000,
                            location: buildLocation,
                            moving: false,
                            destination: null
                        });
                    }
                }
            });
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
            
            // Check if any nation has 15 or more provinces (75% of 20)
            for (let i = 0; i < 3; i++) {
                if (provinceCounts[i] >= 15) {
                    this.winner = i;
                    this.gameOver = true;
                    this.paused = true;
                    
                    const nationNames = ['Blue Empire', 'Red Kingdom', 'Green Republic'];
                    console.log(`${nationNames[i]} wins the game!`);
                    alert(`🎉 ${nationNames[i]} wins the game! 🎉\n\nProvinces controlled: ${provinceCounts[i]}/20`);
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