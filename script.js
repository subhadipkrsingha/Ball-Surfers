const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// UI Selectors
const startScreen = document.getElementById("startScreen");
const gameOverScreen = document.getElementById("gameOverScreen");
const scoreVal = document.getElementById("scoreVal");
const multVal = document.getElementById("multVal");
const finalScore = document.getElementById("finalScore");
const finalCoins = document.getElementById("finalCoins");
const pauseBtn = document.getElementById("pauseBtn");

// Virtual 3D Camera/Perspective configuration
const VANISH_Y = 220; // Horizon pushed down slightly to account for the taller screen
const BASE_Y = canvas.height;

// Lane Configurations balanced smoothly inside 360px width
const LANES_BASE = [60, 180, 300]; 
let score = 0;
let coinsCollected = 0;
let isGameOver = false;
let isPlaying = false;
let isPaused = false;
let obstacles = [];
let coins = [];
let particles = [];

// --- FIXED SPEED SETTINGS & DELTA TIME CONTROLS ---
const FIXED_SPEED = 7.5;      
let obstacleSpawnTimer = 0;  
let coinSpawnTimer = 0;
let lastTime = 0;            

// Impact Screen Shake and Flash States
let shakeTime = 0;
let shakeIntensity = 0;
let flashAlpha = 0;

// Player Object sitting safely right above the Android navigation area
const player = {
    lane: 1,
    currentX: LANES_BASE[1],
    targetX: LANES_BASE[1],
    y: BASE_Y - 140, // Brought up slightly to avoid bottom screen frame edge
    width: 32,       // Adjusted size slightly for ideal scaling feel
    height: 50,
    yOffset: 0,
    isJumping: false,
    isDucking: false,
    jumpArc: 0,
    duckTimer: 0
};

// --- DESKTOP KEYBOARD CONTROLS ---
window.addEventListener("keydown", (e) => {
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        togglePause();
        return;
    }

    if (!isPlaying || isGameOver || isPaused) return;
    
    if ((e.key === "ArrowLeft" || e.key === "a") && player.lane > 0) player.lane--;
    if ((e.key === "ArrowRight" || e.key === "d") && player.lane < 2) player.lane++;
    
    if ((e.key === "ArrowUp" || e.key === "w") && !player.isJumping && !player.isDucking) {
        player.isJumping = true;
        player.jumpArc = 0;
    }
    if ((e.key === "ArrowDown" || e.key === "s") && !player.isJumping && !player.isDucking) {
        player.isDucking = true;
        player.duckTimer = 0.35; 
    }
});

// --- MOBILE TOUCH SWIPE RECOGNITION ---
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 40;

window.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

window.addEventListener("touchend", (e) => {
    if (!isPlaying || isGameOver || isPaused) return;

    let touchEndX = e.changedTouches[0].screenX;
    let touchEndY = e.changedTouches[0].screenY;

    let diffX = touchEndX - touchStartX;
    let diffY = touchEndY - touchStartY;

    if (Math.abs(diffX) > Math.abs(diffY)) {
        if (Math.abs(diffX) > SWIPE_THRESHOLD) {
            if (diffX > 0 && player.lane < 2) player.lane++;
            else if (diffX < 0 && player.lane > 0) player.lane--;
        }
    } else {
        if (Math.abs(diffY) > SWIPE_THRESHOLD) {
            if (diffY < 0 && !player.isJumping && !player.isDucking) {
                player.isJumping = true;
                player.jumpArc = 0;
            } else if (diffY > 0 && !player.isJumping && !player.isDucking) {
                player.isDucking = true;
                player.duckTimer = 0.35;
            }
        }
    }
}, { passive: true });

// --- PAUSE ENGINE MANAGEMENT ---
function togglePause() {
    if (!isPlaying || isGameOver) return;

    isPaused = !isPaused;

    if (isPaused) {
        pauseBtn.innerText = "▶";
        pauseBtn.classList.add("paused-state");
        
        ctx.fillStyle = "rgba(10, 10, 18, 0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px 'Segoe UI', Arial";
        ctx.textAlign = "center";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#00f0ff";
        ctx.fillText("SYSTEM PAUSED", canvas.width / 2, canvas.height / 2);
        ctx.shadowBlur = 0;
    } else {
        pauseBtn.innerText = "⏸";
        pauseBtn.classList.remove("paused-state");
        ctx.textAlign = "left";
        lastTime = performance.now(); 
        requestAnimationFrame(loop);
    }
}

// --- GAME LOGIC ENGINE ---
function startGame() {
    startScreen.classList.add("hidden");
    isPlaying = true;
    lastTime = performance.now(); 
    requestAnimationFrame(loop);
}

function createBurstParticles(x, y, color) {
    for (let i = 0; i < 12; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            alpha: 1,
            color: color,
            radius: Math.random() * 3 + 2
        });
    }
}

function getPerspectiveProjection(progress, laneIndex) {
    const y = VANISH_Y + progress * (BASE_Y - VANISH_Y);
    const scale = progress; 
    const horizonCenterX = canvas.width / 2;
    const baseLaneX = LANES_BASE[laneIndex];
    const x = horizonCenterX + (baseLaneX - horizonCenterX) * progress;
    return { x, y, scale };
}

function spawnObstacle() {
    const lane = Math.floor(Math.random() * 3);
    const type = Math.random() > 0.55 ? 'high' : 'low';
    obstacles.push({ progress: 0, lane, type });
}

function spawnCoin() {
    const lane = Math.floor(Math.random() * 3);
    coins.push({ progress: 0, lane });
}

function update(dt) {
    if (isPaused || isGameOver) return;

    // Passive score accumulation (Slowed down by using multiplier 3)
    score += Math.floor(dt * FIXED_SPEED * 3);
    scoreVal.innerText = score;
    multVal.innerText = "1.0x"; 

    obstacleSpawnTimer += dt;
    coinSpawnTimer += dt;

    if (obstacleSpawnTimer >= 1.25) { 
        spawnObstacle();
        obstacleSpawnTimer = 0;
    }
    if (coinSpawnTimer >= 0.58) {     
        spawnCoin();
        coinSpawnTimer = 0;
    }

    const targetRealX = LANES_BASE[player.lane];
    player.currentX += (targetRealX - player.currentX) * (1 - Math.exp(-15 * dt));

    if (player.isJumping) {
        player.jumpArc += 4.8 * dt; 
        player.yOffset = Math.sin(player.jumpArc) * 110;
        if (player.jumpArc >= Math.PI) {
            player.isJumping = false;
            player.yOffset = 0;
        }
    }

    if (player.isDucking) {
        player.duckTimer -= dt;
        if (player.duckTimer <= 0) player.isDucking = false;
    }

    const step = (FIXED_SPEED / 10) * dt; 

    // Obstacles Lifecycle
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        obs.progress += step;

        if (obs.progress >= 1) {
            obstacles.splice(i, 1);
            continue;
        }

        if (obs.progress > 0.82 && obs.progress < 0.94 && obs.lane === player.lane) {
            if (obs.type === 'low' && !player.isJumping) {
                endGame();
            } else if (obs.type === 'high' && !player.isDucking) {
                endGame();
            }
        }
    }

    // Coins Lifecycle
    for (let i = coins.length - 1; i >= 0; i--) {
        let c = coins[i];
        c.progress += step;

        if (c.progress >= 1) {
            coins.splice(i, 1);
            continue;
        }

        if (c.progress > 0.82 && c.progress < 0.94 && c.lane === player.lane) {
            if (!player.isJumping || player.yOffset < 60) {
                coinsCollected++;
                score += 300;
                const proj = getPerspectiveProjection(c.progress, c.lane);
                createBurstParticles(proj.x, proj.y, '#ffea00');
                coins.splice(i, 1);
            }
        }
    }

    // Shard particles math
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * (dt * 60);
        p.y += p.vy * (dt * 60);
        p.alpha -= 2.4 * dt;
        if (p.alpha <= 0) particles.splice(i, 1);
    }
}

function draw() {
    if (isPaused) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save(); 
    if (shakeTime > 0) {
        let dx = (Math.random() - 0.5) * shakeIntensity;
        let dy = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(dx, dy);
        shakeTime--;
    }

    // 1. Draw Environment Sky Background
    let skyGrad = ctx.createLinearGradient(0, 0, 0, VANISH_Y);
    skyGrad.addColorStop(0, '#05050f');
    skyGrad.addColorStop(1, '#151124');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, VANISH_Y);

    // 2. Draw 3D Grid Track Line Projections
    ctx.strokeStyle = '#22223b';
    ctx.lineWidth = 2;
    for(let l=0; l <= 3; l++) {
        let outerBaseX = (canvas.width / 3) * l;
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, VANISH_Y);
        ctx.lineTo(outerBaseX, BASE_Y);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.lineWidth = 4;
    for(let i=0; i<3; i++) {
        ctx.beginPath();
        ctx.moveTo(canvas.width /2, VANISH_Y);
        ctx.lineTo(LANES_BASE[i], BASE_Y);
        ctx.stroke();
    }

    // 3. Render Coins 
    coins.forEach(c => {
        const proj = getPerspectiveProjection(c.progress, c.lane);
        const r = 10 * proj.scale; // Sized nicely for Android width scaling
        if (r <= 1) return;

        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#ffea00";
        ctx.fillStyle = "#ffea00";
        ctx.beginPath();
        ctx.arc(proj.x, proj.y - 10, r, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    });

    // 4. Render Obstacles
    obstacles.forEach(obs => {
        const proj = getPerspectiveProjection(obs.progress, obs.lane);
        const w = 76 * proj.scale; // Width optimized for 360px layout frame bounds
        const h = (obs.type === 'high' ? 50 : 80) * proj.scale;
        
        if (w <= 2) return;

        if (obs.type === 'low') {
            ctx.fillStyle = '#ff0055';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ff0055';
            ctx.fillRect(proj.x - w/2, proj.y - h, w, h);
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(proj.x - w/4, proj.y - h + 5, w/2, h - 10);
        } else {
            ctx.strokeStyle = '#00f0ff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00f0ff';
            ctx.lineWidth = 4 * proj.scale;
            
            ctx.beginPath();
            ctx.moveTo(proj.x - w/2, proj.y);
            ctx.lineTo(proj.x - w/2, proj.y - h);
            ctx.lineTo(proj.x + w/2, proj.y - h);
            ctx.lineTo(proj.x + w/2, proj.y);
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
            ctx.fillRect(proj.x - w/2, proj.y - h, w, 15 * proj.scale);
        }
        ctx.shadowBlur = 0; 
    });

    // 5. Render Explosion Particles
    if (!isGameOver) {
        particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();
        });
    }

    // 6. Draw Player (3D Shaded Neon Rolling Ball - Clean Layout)
    if (!isGameOver) {
        ctx.save();
        let drawY = player.y - player.yOffset;
        let radius = player.width / 2 + 2; 
        
        if (player.isDucking) {
            drawY += player.height * 0.3;
        }

        if (!player.isJumping) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            ctx.beginPath();
            ctx.ellipse(player.currentX, player.y + player.height - 5, radius * (player.isDucking ? 1.4 : 1.1), 6, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowBlur = player.isJumping ? 25 : 15;
        ctx.shadowColor = '#00f0ff';
        
        let highlightY = player.isDucking ? drawY - 2 : drawY - 8;
        let ballGradient = ctx.createRadialGradient(
            player.currentX - 5, highlightY, 2,          
            player.currentX, drawY, radius                
        );
        ballGradient.addColorStop(0, '#ffffff');         
        ballGradient.addColorStop(0.3, '#33f5ff');       
        ballGradient.addColorStop(1, '#0077aa');         
        ctx.fillStyle = ballGradient;
        
        ctx.beginPath();
        if (player.isDucking) {
            ctx.ellipse(player.currentX, drawY + radius, radius * 1.3, radius * 0.6, 0, 0, Math.PI * 2);
        } else {
            ctx.arc(player.currentX, drawY + radius, radius, 0, Math.PI * 2);
        }
        ctx.fill();

        ctx.restore();
    }

    ctx.restore(); 

    if (isGameOver) {
        particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();
        });
    }

    if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 0, 85, ${flashAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashAlpha -= 0.04;
    }
}

function endGame() {
    isGameOver = true;
    isPlaying = false;
    
    shakeTime = 25; 
    shakeIntensity = 15; 
    flashAlpha = 0.8; 

    let drawY = player.y - player.yOffset + (player.width / 2 + 2);
    for (let i = 0; i < 40; i++) {
        particles.push({
            x: player.currentX + (Math.random() - 0.5) * 20,
            y: drawY + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 16,
            vy: (Math.random() - 0.5) * 16 - 3, 
            alpha: 1,
            color: Math.random() > 0.3 ? '#00f0ff' : '#ffffff', 
            radius: Math.random() * 4 + 2
        });
    }

    setTimeout(() => {
        gameOverScreen.classList.remove("hidden");
        finalScore.innerText = score;
        finalCoins.innerText = coinsCollected;
    }, 600);
}

function resetGame() {
    obstacles = [];
    coins = [];
    particles = [];
    score = 0;
    coinsCollected = 0;
    obstacleSpawnTimer = 0;
    coinSpawnTimer = 0;
    shakeTime = 0;
    flashAlpha = 0;
    player.lane = 1;
    player.currentX = LANES_BASE[1];
    player.yOffset = 0;
    player.isJumping = false;
    player.isDucking = false;
    isGameOver = false;
    isPaused = false;
    isPlaying = true;
    
    pauseBtn.innerText = "⏸";
    pauseBtn.classList.remove("paused-state");
    ctx.textAlign = "left";
    
    gameOverScreen.classList.add("hidden");
    lastTime = performance.now(); 
    requestAnimationFrame(loop);
}

function loop(timestamp) {
    if (!isPlaying && !isGameOver) return; 
    if (isPaused) return;

    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1; 
    lastTime = timestamp;

    update(dt);
    draw();
    
    if (isGameOver && particles.length > 0) {
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx; p.y += p.vy; p.alpha -= 0.02;
            if (p.alpha <= 0) particles.splice(i, 1);
        }
        draw();
    }

    requestAnimationFrame(loop);
}