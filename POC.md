# Grand Strategy POC - Pseudocode Specification

## Overview
Build a minimal browser-based grand strategy game with 20 provinces, 3 nations, basic combat, and simple AI. Playable in 1-2 days of development.

## Core Data Structures

```
// Game State
GameState {
    tick: integer                    // Current game time (increments each second)
    speed: integer                   // Milliseconds between ticks (1000 default)
    paused: boolean                  // Is game paused
    winner: nationId or null         // Game over when someone wins
    
    provinces: Map<provinceId, Province>
    nations: Map<nationId, Nation>
    armies: Map<armyId, Army>
}

// Province - Fixed territories on the map
Province {
    id: integer (0-19)              // Unique identifier
    x: integer                       // Grid position X (0-4)
    y: integer                       // Grid position Y (0-3)
    owner: nationId or null          // Who controls it
    development: integer             // Economic value (default 10)
    
    // Calculated
    neighbors: [provinceId]          // Adjacent provinces (computed once)
}

// Nation - Players and AI countries
Nation {
    id: integer (0-2)                // Unique identifier
    name: string                     // Display name
    color: hex string                // Display color (#FF0000)
    treasury: integer                // Gold amount
    isAI: boolean                    // AI or human controlled
    isPlayer: boolean                // The human player
    
    // Calculated
    ownedProvinces: [provinceId]    // Provinces controlled
    armyCount: integer               // Number of armies
    income: integer                  // Gold per tick
}

// Army - Military units that fight
Army {
    id: integer                      // Unique identifier
    owner: nationId                  // Which nation controls it
    size: integer                    // Number of soldiers (1000 default)
    location: provinceId             // Current province
    morale: float (0-1)              // Combat effectiveness
    
    // Movement
    moving: boolean                  // Currently moving
    destination: provinceId or null  // Target province
    movementProgress: integer        // Ticks until arrival (0-3)
}
```

## Initialization

```
function initializeGame() {
    // Create 20 provinces in 5x4 grid
    provinces = []
    for y in 0 to 3:
        for x in 0 to 4:
            province = Province {
                id: y * 5 + x
                x: x
                y: y
                owner: null
                development: 10
                neighbors: calculateNeighbors(x, y)
            }
            provinces.add(province)
    
    // Create 3 nations
    nations = [
        Nation {id: 0, name: "Blue Empire", color: "#4169E1", treasury: 100, isPlayer: true, isAI: false},
        Nation {id: 1, name: "Red Kingdom", color: "#DC143C", treasury: 100, isPlayer: false, isAI: true},
        Nation {id: 2, name: "Green Republic", color: "#228B22", treasury: 100, isPlayer: false, isAI: true}
    ]
    
    // Assign starting provinces
    assignProvince(0, nationId: 0)  // Bottom-left corner for player
    assignProvince(1, nationId: 0)
    assignProvince(5, nationId: 0)
    
    assignProvince(7, nationId: 1)  // Middle for AI 1
    assignProvince(8, nationId: 1)
    assignProvince(12, nationId: 1)
    
    assignProvince(14, nationId: 2) // Top-right for AI 2
    assignProvince(18, nationId: 2)
    assignProvince(19, nationId: 2)
    
    // Create starting armies
    armies = [
        Army {id: 0, owner: 0, size: 1000, location: 0, morale: 1.0},
        Army {id: 1, owner: 1, size: 1000, location: 7, morale: 1.0},
        Army {id: 2, owner: 2, size: 1000, location: 19, morale: 1.0}
    ]
    
    return GameState {
        tick: 0,
        speed: 1000,
        paused: false,
        winner: null,
        provinces: provinces,
        nations: nations,
        armies: armies
    }
}

function calculateNeighbors(x, y) {
    neighbors = []
    
    if x > 0: neighbors.add((y * 5) + (x - 1))  // Left
    if x < 4: neighbors.add((y * 5) + (x + 1))  // Right
    if y > 0: neighbors.add(((y - 1) * 5) + x)  // Up
    if y < 3: neighbors.add(((y + 1) * 5) + x)  // Down
    
    return neighbors
}
```

## Game Loop

```
function startGameLoop(gameState) {
    setInterval(function() {
        if not gameState.paused:
            processTick(gameState)
    }, gameState.speed)
}

function processTick(gameState) {
    gameState.tick += 1
    
    // Phase 1: Income
    processIncome(gameState)
    
    // Phase 2: Movement
    processMovement(gameState)
    
    // Phase 3: Combat
    processCombat(gameState)
    
    // Phase 4: AI Decisions
    if gameState.tick % 5 == 0:  // AI acts every 5 ticks
        processAI(gameState)
    
    // Phase 5: Victory Check
    checkVictory(gameState)
    
    // Phase 6: Update UI
    updateDisplay(gameState)
}
```

## Income System

```
function processIncome(gameState) {
    for nation in gameState.nations:
        income = 0
        provinceCount = 0
        
        for province in gameState.provinces:
            if province.owner == nation.id:
                income += 2  // 2 gold per province per tick
                provinceCount += 1
        
        nation.treasury += income
        nation.income = income
        nation.ownedProvinces = provinceCount
}
```

## Movement System

```
function moveArmy(gameState, armyId, destinationProvinceId) {
    army = gameState.armies[armyId]
    currentProvince = gameState.provinces[army.location]
    destinationProvince = gameState.provinces[destinationProvinceId]
    
    // Check if destination is neighbor
    if destinationProvinceId not in currentProvince.neighbors:
        return false  // Invalid move
    
    // Start movement
    army.moving = true
    army.destination = destinationProvinceId
    army.movementProgress = 3  // Takes 3 ticks to move
    
    return true
}

function processMovement(gameState) {
    for army in gameState.armies:
        if army.moving:
            army.movementProgress -= 1
            
            if army.movementProgress <= 0:
                // Arrival
                army.location = army.destination
                army.moving = false
                army.destination = null
}
```

## Combat System

```
function processCombat(gameState) {
    // Group armies by province
    armiesByProvince = groupBy(gameState.armies, army => army.location)
    
    for provinceId, armies in armiesByProvince:
        if armies.length < 2:
            continue  // No combat
        
        // Check if hostile armies present
        nations = unique(armies.map(army => army.owner))
        if nations.length < 2:
            continue  // Same nation, no combat
        
        // Simple combat: Largest army wins
        resolveBattle(gameState, provinceId, armies)
}

function resolveBattle(gameState, provinceId, armies) {
    // Group by nation
    armiesByNation = groupBy(armies, army => army.owner)
    
    // Calculate total strength per nation
    nationStrengths = []
    for nationId, nationArmies in armiesByNation:
        totalStrength = sum(nationArmies.map(army => army.size * army.morale))
        nationStrengths.add({nation: nationId, strength: totalStrength, armies: nationArmies})
    
    // Sort by strength
    nationStrengths.sort((a, b) => b.strength - a.strength)
    
    winner = nationStrengths[0]
    losers = nationStrengths.slice(1)
    
    // Apply casualties
    for loser in losers:
        for army in loser.armies:
            // Destroy losing armies
            gameState.armies.remove(army.id)
    
    // Winner takes casualties too (20% loss)
    for army in winner.armies:
        army.size = floor(army.size * 0.8)
        army.morale = max(0.5, army.morale - 0.2)
    
    // Winner captures province
    province = gameState.provinces[provinceId]
    province.owner = winner.nation
}
```

## AI System

```
function processAI(gameState) {
    for nation in gameState.nations:
        if not nation.isAI:
            continue
        
        // AI Strategy: Expand and defend
        aiThink(gameState, nation)
}

function aiThink(gameState, nation) {
    // Step 1: Build armies if rich
    if nation.treasury >= 50:
        buildArmy(gameState, nation)
    
    // Step 2: Move armies strategically
    myArmies = gameState.armies.filter(army => army.owner == nation.id)
    
    for army in myArmies:
        if army.moving:
            continue
        
        // Find best target
        target = findBestTarget(gameState, nation, army)
        if target:
            moveArmy(gameState, army.id, target)
}

function findBestTarget(gameState, nation, army) {
    currentProvince = gameState.provinces[army.location]
    
    // Priority 1: Defend our provinces under attack
    for neighborId in currentProvince.neighbors:
        neighbor = gameState.provinces[neighborId]
        if neighbor.owner == nation.id:
            enemyArmies = gameState.armies.filter(a => 
                a.location == neighborId and a.owner != nation.id
            )
            if enemyArmies.length > 0:
                return neighborId  // Defend!
    
    // Priority 2: Attack weak neighbors
    bestTarget = null
    bestScore = -999
    
    for neighborId in currentProvince.neighbors:
        neighbor = gameState.provinces[neighborId]
        
        if neighbor.owner == nation.id:
            continue  // Already ours
        
        // Calculate attack score
        score = 0
        
        // Prefer enemy provinces
        if neighbor.owner != null:
            score += 10
        
        // Prefer undefended provinces
        defenders = gameState.armies.filter(a => a.location == neighborId)
        defenderStrength = sum(defenders.map(a => a.size))
        score -= defenderStrength / 100
        
        // Prefer valuable provinces
        score += neighbor.development / 10
        
        if score > bestScore:
            bestScore = score
            bestTarget = neighborId
    
    return bestTarget
}

function buildArmy(gameState, nation) {
    // Find a province to build in (prefer capital/first owned)
    buildProvince = null
    for province in gameState.provinces:
        if province.owner == nation.id:
            buildProvince = province
            break
    
    if not buildProvince:
        return  // No provinces to build in
    
    // Create new army
    newArmy = Army {
        id: gameState.armies.length,
        owner: nation.id,
        size: 1000,
        location: buildProvince.id,
        morale: 1.0,
        moving: false,
        destination: null
    }
    
    gameState.armies.add(newArmy)
    nation.treasury -= 50
}
```

## Victory Conditions

```
function checkVictory(gameState) {
    for nation in gameState.nations:
        provinceCount = 0
        for province in gameState.provinces:
            if province.owner == nation.id:
                provinceCount += 1
        
        // Victory: Control 15 of 20 provinces
        if provinceCount >= 15:
            gameState.winner = nation.id
            gameState.paused = true
            displayVictory(nation)
            return
}
```

## Rendering

```
function renderGame(gameState, canvas) {
    ctx = canvas.getContext('2d')
    
    // Clear canvas
    ctx.clearRect(0, 0, 800, 600)
    
    // Draw provinces
    for province in gameState.provinces:
        drawProvince(ctx, province, gameState)
    
    // Draw armies
    for army in gameState.armies:
        drawArmy(ctx, army, gameState)
    
    // Draw UI overlay
    drawUI(ctx, gameState)
}

function drawProvince(ctx, province, gameState) {
    // Calculate pixel position
    pixelX = province.x * 160
    pixelY = province.y * 150
    
    // Fill with owner's color
    if province.owner != null:
        nation = gameState.nations[province.owner]
        ctx.fillStyle = nation.color
    else:
        ctx.fillStyle = '#CCCCCC'  // Gray for unowned
    
    ctx.fillRect(pixelX, pixelY, 150, 140)
    
    // Draw border
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.strokeRect(pixelX, pixelY, 150, 140)
    
    // Draw province ID
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '16px Arial'
    ctx.fillText(province.id, pixelX + 70, pixelY + 70)
}

function drawArmy(ctx, army, gameState) {
    province = gameState.provinces[army.location]
    nation = gameState.nations[army.owner]
    
    // Calculate pixel position (center of province)
    pixelX = (province.x * 160) + 75
    pixelY = (province.y * 150) + 100
    
    // Draw army circle
    ctx.beginPath()
    ctx.arc(pixelX, pixelY, 20, 0, Math.PI * 2)
    ctx.fillStyle = nation.color
    ctx.fill()
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // Draw army size
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(army.size, pixelX, pixelY + 4)
}

function drawUI(ctx, gameState) {
    // Find player nation
    playerNation = gameState.nations.find(n => n.isPlayer)
    
    // Draw stats in corner
    ctx.fillStyle = '#000000'
    ctx.font = '16px Arial'
    ctx.fillText(`Gold: ${playerNation.treasury}`, 10, 30)
    ctx.fillText(`Income: +${playerNation.income}/tick`, 10, 50)
    ctx.fillText(`Provinces: ${playerNation.ownedProvinces}`, 10, 70)
    ctx.fillText(`Tick: ${gameState.tick}`, 10, 90)
}
```

## User Input

```
function handleClick(event, gameState) {
    x = event.clientX - canvas.offsetLeft
    y = event.clientY - canvas.offsetTop
    
    // Find clicked province
    provinceX = floor(x / 160)
    provinceY = floor(y / 150)
    provinceId = provinceY * 5 + provinceX
    
    if provinceId < 0 or provinceId > 19:
        return  // Clicked outside map
    
    handleProvinceClick(gameState, provinceId)
}

function handleProvinceClick(gameState, provinceId) {
    // If player has selected an army, try to move it
    if gameState.selectedArmy:
        army = gameState.armies[gameState.selectedArmy]
        if army.owner == 0:  // Player's army
            moveArmy(gameState, army.id, provinceId)
            gameState.selectedArmy = null
            return
    
    // Otherwise, select army in this province
    playerArmies = gameState.armies.filter(a => 
        a.location == provinceId and a.owner == 0
    )
    
    if playerArmies.length > 0:
        gameState.selectedArmy = playerArmies[0].id
        highlightProvince(provinceId)
}

function handleBuildArmyButton(gameState) {
    playerNation = gameState.nations[0]
    
    if playerNation.treasury >= 50:
        buildArmy(gameState, playerNation)
}

function handlePauseButton(gameState) {
    gameState.paused = !gameState.paused
}

function handleSpeedButton(gameState, speed) {
    gameState.speed = speed  // 1000 for 1x, 500 for 2x, etc.
}
```

## Main Entry Point

```
function main() {
    // Initialize
    gameState = initializeGame()
    canvas = document.getElementById('gameCanvas')
    
    // Set up rendering
    function render() {
        renderGame(gameState, canvas)
        requestAnimationFrame(render)
    }
    render()
    
    // Set up input
    canvas.addEventListener('click', (e) => handleClick(e, gameState))
    document.getElementById('buildArmyBtn').addEventListener('click', () => handleBuildArmyButton(gameState))
    document.getElementById('pauseBtn').addEventListener('click', () => handlePauseButton(gameState))
    
    // Start game loop
    startGameLoop(gameState)
}

// Start when page loads
window.onload = main
```

## HTML Structure

```html
<!DOCTYPE html>
<html>
<head>
    <title>Grand Strategy POC</title>
    <style>
        body { margin: 0; background: #2c3e50; font-family: Arial; }
        #gameContainer { display: flex; padding: 20px; gap: 20px; }
        #gameCanvas { border: 2px solid black; background: white; }
        #controls { background: white; padding: 20px; border-radius: 8px; }
        button { display: block; width: 200px; padding: 10px; margin: 10px 0; }
    </style>
</head>
<body>
    <div id="gameContainer">
        <canvas id="gameCanvas" width="800" height="600"></canvas>
        <div id="controls">
            <h3>Controls</h3>
            <button id="buildArmyBtn">Build Army (50 Gold)</button>
            <button id="pauseBtn">Pause/Resume</button>
            <button id="speed1x">Speed: 1x</button>
            <button id="speed2x">Speed: 2x</button>
            <button id="speed3x">Speed: 3x</button>
            
            <h3>How to Play</h3>
            <p>Click your army, then click adjacent province to move.</p>
            <p>Capture 15 provinces to win!</p>
        </div>
    </div>
    
    <script src="game.js"></script>
</body>
</html>
```

This pseudocode provides a complete, implementable POC that Claude Code can build. It has all core systems but keeps everything as simple as possible for rapid development.