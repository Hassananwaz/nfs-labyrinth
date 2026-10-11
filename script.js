        // --- GLOBAL VARIABLES ---
        var scene, camera, renderer, clock;
        var garageScene, garageCamera, garageRenderer, garageAnimId = null;
        
        // Entities & Particles
        var playerCarGroup, playerCarMesh;
        var skidMarks = [], smokeParticles = [];
        
        // --- LEVEL & MAZE SYSTEM ---
        var currentLevel = 1;
        var GRID_SIZE = 10; 
        const CELL_SIZE = 40; 
        const WALL_THICKNESS = 3;
        var MAP_OFFSET = 0;
        
        var mazeGrid = []; 
        var mazeWallsGroup = new THREE.Group(); 
        var colliders = []; 
        var portals = [];
        var collectibles = [];
        var exitCell = {x: 0, y: 0};

        // Animation states
        var mazeAnimState = 'none'; // 'none', 'sinking', 'rising'
        var mazeAnimY = 0;

        // Contexts
        var minimapCtx;
        
        // Cameras
        var currentCamera = 0;
        var cameraConfigs = [
            { offset: new THREE.Vector3(0, 3.5, -9), look: new THREE.Vector3(0, 1, 10), fov: 60 },  // Action Chase
            { offset: new THREE.Vector3(0, 1.2, 0.5), look: new THREE.Vector3(0, 1.2, 10), fov: 80 }, // Hood View
            { offset: new THREE.Vector3(0, 12, -18), look: new THREE.Vector3(0, 0, 5), fov: 65 }     // Far Chase
        ];
        
        // Physics Engine State
        var isGameRunning = false;
        var carPos = new THREE.Vector3(0, 0, 0); 
        var carVelocity = new THREE.Vector3(0, 0, 0); 
        var carHeading = 0; 
        var carSpeed = 0;
        
        // Tuned Physics (High Speed, Responsive)
        var maxSpeed = 120.0; // Scaled up!
        var baseAcceleration = 60.0; 
        var currentAcceleration = baseAcceleration;
        var braking = 120.0;
        var friction = 0.992; // Much less drag for longer coasts
        var turnSpeed = 2.8;
        var carRadius = 1.3; 
        
        // Game State
        var keys = { w:false, a:false, s:false, d:false, space:false };
        var mazeTimer = 180; 

        var carConfig = { height: 0.35, wheelRadius: 0.65, color: '#00ffff' };

        // --- INIT & GARAGE ---
        function enterGarage() {
            document.getElementById('intro-screen').style.display = 'none';
            document.getElementById('garage-screen').style.display = 'flex';
            if(!garageScene) initGarage();
        }

        function deployToIsland() {
            document.getElementById('garage-screen').style.display = 'none';
            document.getElementById('ui-layer').style.display = 'flex';
            if (garageAnimId) cancelAnimationFrame(garageAnimId);
            document.getElementById('garage-3d').innerHTML = '';
            
            var canvas = document.getElementById('minimap');
            minimapCtx = canvas.getContext('2d');
            
            initGame();
        }

        function initGarage() {
            var container = document.getElementById('garage-3d');
            garageScene = new THREE.Scene();
            garageCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
            garageCamera.position.set(6, 3, -6);
            garageCamera.lookAt(0, 0, 0);

            garageRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            garageRenderer.setSize(container.clientWidth, container.clientHeight);
            garageRenderer.toneMapping = THREE.ACESFilmicToneMapping;
            container.appendChild(garageRenderer.domElement);

            garageScene.add(new THREE.AmbientLight(0xffffff, 0.6));
            var spot1 = new THREE.SpotLight(0x00ffff, 2); spot1.position.set(5, 10, -5); garageScene.add(spot1);
            var spot2 = new THREE.SpotLight(0xff00ff, 2); spot2.position.set(-5, 10, 5); garageScene.add(spot2);

            playerCarMesh = buildHighEndCar(carConfig);
            garageScene.add(playerCarMesh);

            document.getElementById('mod-height').addEventListener('input', updateGarageCar);
            document.getElementById('mod-wheel').addEventListener('input', updateGarageCar);
            document.getElementById('mod-color').addEventListener('input', updateGarageCar);
            animateGarage();
        }

        function updateGarageCar() {
            carConfig.height = parseFloat(document.getElementById('mod-height').value);
            carConfig.wheelRadius = parseFloat(document.getElementById('mod-wheel').value);
            carConfig.color = document.getElementById('mod-color').value;
            garageScene.remove(playerCarMesh);
            playerCarMesh = buildHighEndCar(carConfig);
            garageScene.add(playerCarMesh);
        }

        function animateGarage() {
            garageAnimId = requestAnimationFrame(animateGarage);
            if (playerCarMesh) playerCarMesh.rotation.y += 0.005;
            garageRenderer.render(garageScene, garageCamera);
        }

        // --- MESH & TEXTURES ---
        function createConcreteTexture() {
            var canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0,0,256,256);
            for(let i=0; i<2000; i++) {
                ctx.fillStyle = Math.random()>0.5?'#222':'#111';
                ctx.fillRect(Math.random()*256, Math.random()*256, Math.random()*15, 3);
            }
            var tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            return tex;
        }

        function buildHighEndCar(cfg) {
            var group = new THREE.Group();
            var bodyMat = new THREE.MeshPhysicalMaterial({ color: cfg.color, metalness: 0.8, roughness: 0.2, clearcoat: 1.0 });
            var darkMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });
            var glassMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0.9, roughness: 0.0, transparent: true, opacity: 0.7 });
            var rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 });

            var width = 2.0; var length = 4.6;
            var chassisY = cfg.wheelRadius + cfg.height - 0.2;

            var base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, length), darkMat); base.position.y = chassisY; group.add(base);
            var body = new THREE.Mesh(new THREE.BoxGeometry(width*0.96, 0.4, length*0.96), bodyMat); body.position.y = chassisY + 0.3; group.add(body);
            var cabin = new THREE.Mesh(new THREE.BoxGeometry(width*0.8, 0.4, length*0.4), glassMat); cabin.position.set(0, chassisY + 0.7, -0.2); group.add(cabin);
            
            var hood = new THREE.Mesh(new THREE.BoxGeometry(width*0.9, 0.2, length*0.3), bodyMat);
            hood.position.set(0, chassisY + 0.4, length*0.35); hood.rotation.x = -0.15; group.add(hood);

            var wing = new THREE.Mesh(new THREE.BoxGeometry(width*0.9, 0.05, 0.3), darkMat);
            wing.position.set(0, chassisY + 0.8, -length*0.45); 
            var sL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.2), darkMat); sL.position.set(-width*0.35, chassisY+0.6, -length*0.45);
            var sR = sL.clone(); sR.position.x = width*0.35;
            group.add(wing); group.add(sL); group.add(sR);

            var wGeo = new THREE.CylinderGeometry(cfg.wheelRadius, cfg.wheelRadius, 0.4, 24); wGeo.rotateZ(Math.PI/2);
            var rimGeo = new THREE.CylinderGeometry(cfg.wheelRadius*0.7, cfg.wheelRadius*0.7, 0.45, 12); rimGeo.rotateZ(Math.PI/2);

            var wPositions = [ [-width/2, cfg.wheelRadius, length*0.35], [width/2, cfg.wheelRadius, length*0.35], [-width/2, cfg.wheelRadius, -length*0.35], [width/2, cfg.wheelRadius, -length*0.35] ];
            group.wheels = []; group.frontWheels = []; group.rearWheels = [];

            wPositions.forEach((p, i) => {
                var wGroup = new THREE.Group(); wGroup.position.set(p[0], p[1], p[2]);
                var tire = new THREE.Mesh(wGeo, darkMat); var rim = new THREE.Mesh(rimGeo, rimMat);
                wGroup.add(tire); wGroup.add(rim); group.add(wGroup);
                group.wheels.push(wGroup);
                if(i<2) group.frontWheels.push(wGroup); else group.rearWheels.push(wGroup);
            });

            var hl = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshBasicMaterial({color: 0xffffff}));
            hl.position.set(-0.6, chassisY+0.35, length/2 + 0.01);
            var hlR = hl.clone(); hlR.position.x = 0.6; group.add(hl); group.add(hlR);

            // Add True Headlights for better night vision
            var spotL = new THREE.SpotLight(0xffffff, 5, 400, Math.PI/5, 0.5, 1); spotL.position.set(-0.6, chassisY+0.5, length/2); spotL.target.position.set(-0.6, 0, length/2 + 30);
            var spotR = new THREE.SpotLight(0xffffff, 5, 400, Math.PI/5, 0.5, 1); spotR.position.set(0.6, chassisY+0.5, length/2); spotR.target.position.set(0.6, 0, length/2 + 30);
            group.add(spotL); group.add(spotL.target); group.add(spotR); group.add(spotR.target);

            var neonLight = new THREE.PointLight(cfg.color, 2, 8); neonLight.position.set(0, 0.5, 0); group.add(neonLight);
            return group;
        }

        // --- DYNAMIC MAZE ENGINE ---
        function generateMazeData() {
            GRID_SIZE = 8 + (currentLevel * 2); // Scales up complexity
            MAP_OFFSET = (GRID_SIZE * CELL_SIZE) / 2;
            exitCell = {x: GRID_SIZE-1, y: GRID_SIZE-1};

            mazeGrid = [];
            for (let x = 0; x < GRID_SIZE; x++) {
                mazeGrid[x] = [];
                for (let y = 0; y < GRID_SIZE; y++) {
                    mazeGrid[x][y] = { x: x, y: y, visited: false, walls: { top:true, right:true, bottom:true, left:true }};
                }
            }
            
            let stack = []; let curr = mazeGrid[0][0]; curr.visited = true;

            while(true) {
                let neighbors = [];
                let x = curr.x, y = curr.y;
                if (y > 0 && !mazeGrid[x][y-1].visited) neighbors.push({c: mazeGrid[x][y-1], d:'top', o:'bottom'});
                if (x < GRID_SIZE-1 && !mazeGrid[x+1][y].visited) neighbors.push({c: mazeGrid[x+1][y], d:'right', o:'left'});
                if (y < GRID_SIZE-1 && !mazeGrid[x][y+1].visited) neighbors.push({c: mazeGrid[x][y+1], d:'bottom', o:'top'});
                if (x > 0 && !mazeGrid[x-1][y].visited) neighbors.push({c: mazeGrid[x-1][y], d:'left', o:'right'});

                if (neighbors.length > 0) {
                    let next = neighbors[Math.floor(Math.random() * neighbors.length)];
                    stack.push(curr);
                    curr.walls[next.d] = false; next.c.walls[next.o] = false;
                    curr = next.c; curr.visited = true;
                } else if (stack.length > 0) curr = stack.pop();
                else break;
            }

            // Remove random walls for racing loops
            for(let i=0; i<GRID_SIZE; i++) {
                let rx = Math.floor(Math.random() * (GRID_SIZE-1)); let ry = Math.floor(Math.random() * (GRID_SIZE-1));
                if(Math.random()>0.5) { mazeGrid[rx][ry].walls.right = false; mazeGrid[rx+1][ry].walls.left = false; } 
                else { mazeGrid[rx][ry].walls.bottom = false; mazeGrid[rx][ry+1].walls.top = false; }
            }
            mazeGrid[exitCell.x][exitCell.y].walls.bottom = true; 
        }

        function buildMaze3D() {
            // Clear old
            while(mazeWallsGroup.children.length > 0){ mazeWallsGroup.remove(mazeWallsGroup.children[0]); }
            colliders = [];
            portals.forEach(p => scene.remove(p.group)); portals = [];
            collectibles.forEach(c => scene.remove(c.mesh)); collectibles = [];
            
            generateMazeData();

            var wallGeo = new THREE.BoxGeometry(CELL_SIZE + WALL_THICKNESS, 12, WALL_THICKNESS);
            var wallMat = new THREE.MeshStandardMaterial({ map: createConcreteTexture(), roughness: 0.9 });
            
            // Build Instanced Mesh
            let wallCount = 0;
            for(let x=0; x<GRID_SIZE; x++){
                for(let y=0; y<GRID_SIZE; y++){
                    if(mazeGrid[x][y].walls.top && y===0) wallCount++;
                    if(mazeGrid[x][y].walls.bottom) wallCount++;
                    if(mazeGrid[x][y].walls.left && x===0) wallCount++;
                    if(mazeGrid[x][y].walls.right) wallCount++;
                }
            }

            var instancedWalls = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
            instancedWalls.castShadow = true; instancedWalls.receiveShadow = true;
            
            let dummy = new THREE.Object3D(); let idx = 0;

            function addWall(cx, cy, isHoriz) {
                dummy.position.set(cx, 6, cy); dummy.rotation.y = isHoriz ? 0 : Math.PI/2; dummy.updateMatrix();
                instancedWalls.setMatrixAt(idx++, dummy.matrix);
                var hW = isHoriz ? (CELL_SIZE/2) : (WALL_THICKNESS/2); var hD = isHoriz ? (WALL_THICKNESS/2) : (CELL_SIZE/2);
                colliders.push({ minX: cx - hW, maxX: cx + hW, minZ: cy - hD, maxZ: cy + hD });
            }

            for(let x=0; x<GRID_SIZE; x++){
                for(let y=0; y<GRID_SIZE; y++){
                    let cx = x * CELL_SIZE - MAP_OFFSET + CELL_SIZE/2; let cy = y * CELL_SIZE - MAP_OFFSET + CELL_SIZE/2;
                    if(mazeGrid[x][y].walls.top && y===0) addWall(cx, cy - CELL_SIZE/2, true);
                    if(mazeGrid[x][y].walls.bottom) addWall(cx, cy + CELL_SIZE/2, true);
                    if(mazeGrid[x][y].walls.left && x===0) addWall(cx - CELL_SIZE/2, cy, false);
                    if(mazeGrid[x][y].walls.right) addWall(cx + CELL_SIZE/2, cy, false);
                }
            }
            mazeWallsGroup.add(instancedWalls);

            // Floor Tile under maze to look clean
            var floorGeo = new THREE.PlaneGeometry(GRID_SIZE*CELL_SIZE, GRID_SIZE*CELL_SIZE);
            var floorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
            var mFloor = new THREE.Mesh(floorGeo, floorMat); mFloor.rotation.x = -Math.PI/2; mFloor.receiveShadow = true;
            mazeWallsGroup.add(mFloor);

            // Entities
            spawnLevelEntities();

            mazeWallsGroup.position.y = mazeAnimY; // Respect animation state
        }

        function spawnLevelEntities() {
            // Portals
            for(let i=0; i<Math.min(3, currentLevel+1); i++) {
                let px = Math.floor(Math.random()*(GRID_SIZE-2)); let py = Math.floor(Math.random()*(GRID_SIZE-2));
                if(px<2 && py<2) continue; // away from start
                
                let pGroup = new THREE.Group();
                pGroup.position.set(px*CELL_SIZE - MAP_OFFSET + CELL_SIZE/2, 3, py*CELL_SIZE - MAP_OFFSET + CELL_SIZE/2);
                
                let ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.4, 16, 32), new THREE.MeshBasicMaterial({color: 0x9900ff}));
                let core = new THREE.Mesh(new THREE.SphereGeometry(2,16,16), new THREE.MeshBasicMaterial({color: 0x4400ff, transparent:true, opacity:0.8}));
                pGroup.add(ring); pGroup.add(core); pGroup.add(new THREE.PointLight(0x9900ff, 3, 30));
                
                mazeWallsGroup.add(pGroup);
                portals.push({ group: pGroup, ring: ring, gridX: px, gridY: py, startY: 3 });
            }

            // Collectibles
            for(let i=0; i<currentLevel + 2; i++) {
                let px = Math.floor(Math.random()*GRID_SIZE); let py = Math.floor(Math.random()*GRID_SIZE);
                if(px<1 && py<1) continue;
                
                let type = Math.random() > 0.5 ? 'nitro' : 'time';
                let col = type === 'nitro' ? 0x00ffff : 0xffff00;
                
                let mesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.5), new THREE.MeshBasicMaterial({color: col, wireframe: true}));
                mesh.position.set(px*CELL_SIZE - MAP_OFFSET + CELL_SIZE/2, 2.5, py*CELL_SIZE - MAP_OFFSET + CELL_SIZE/2);
                mazeWallsGroup.add(mesh);
                mazeWallsGroup.add(new THREE.PointLight(col, 2, 15));
                collectibles.push({ mesh: mesh, type: type, active: true });
            }

            // Exit
            var exitMesh = new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE), new THREE.MeshBasicMaterial({color: 0x00ff00, transparent:true, opacity:0.3}));
            exitMesh.rotation.x = -Math.PI/2;
            exitMesh.position.set(exitCell.x*CELL_SIZE - MAP_OFFSET + CELL_SIZE/2, 0.1, exitCell.y*CELL_SIZE - MAP_OFFSET + CELL_SIZE/2);
            var exitLight = new THREE.PointLight(0x00ff00, 2, 40); exitLight.position.set(0, 5, 0); exitMesh.add(exitLight);
            mazeWallsGroup.add(exitMesh);
        }

        // --- INIT SCENE ---
        function initGame() {
            clock = new THREE.Clock();
            
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x020205); 
            scene.fog = new THREE.FogExp2(0x020205, 0.002);

            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1500);
            
            renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); 
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            document.body.appendChild(renderer.domElement);

            scene.add(new THREE.HemisphereLight(0x444455, 0x111122, 1.5)); // Brighter hemisphere light

            // Add strong moonlight for global illumination
            var moonLight = new THREE.DirectionalLight(0x88bbff, 1.5);
            moonLight.position.set(100, 200, 50);
            scene.add(moonLight);

            // Ambient light for base visibility
            scene.add(new THREE.AmbientLight(0xffffff, 0.4));

            // Outer void ground
            var voidGeo = new THREE.PlaneGeometry(5000, 5000);
            var voidMat = new THREE.MeshStandardMaterial({ color: 0x050505 });
            var voidMesh = new THREE.Mesh(voidGeo, voidMat); voidMesh.rotation.x = -Math.PI/2; voidMesh.position.y = -5;
            scene.add(voidMesh);

            scene.add(mazeWallsGroup);
            buildMaze3D();

            // Set Player
            carPos.set(CELL_SIZE/2 - MAP_OFFSET, 0, CELL_SIZE/2 - MAP_OFFSET);
            carHeading = 0; // facing +Z

            playerCarGroup = new THREE.Group();
            playerCarMesh = buildHighEndCar(carConfig);
            playerCarGroup.add(playerCarMesh);
            playerCarGroup.position.copy(carPos);
            scene.add(playerCarGroup);

            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('keyup', onKeyUp);
            window.addEventListener('resize', onWindowResize);

            document.getElementById('level-ui').innerText = "SECTOR: " + currentLevel;

            isGameRunning = true;
            animateGame();
        }

        function startNextLevel() {
            document.getElementById('transition-screen').style.display = 'none';
            document.getElementById('level-ui').innerText = "SECTOR: " + currentLevel;
            shiftMazeTransition(); // Trigger animation
        }

        // --- INPUTS ---
        function onKeyDown(e) {
            var key = e.key.toLowerCase();
            if (keys.hasOwnProperty(key)) keys[key] = true;
            if (key === 'arrowup') keys.w = true;
            if (key === 'arrowdown') keys.s = true;
            if (key === 'arrowleft') keys.a = true;
            if (key === 'arrowright') keys.d = true;
            if (e.code === 'Space') keys.space = true;
            if (key === 'c') currentCamera = (currentCamera + 1) % cameraConfigs.length;
        }

        function onKeyUp(e) {
            var key = e.key.toLowerCase();
            if (keys.hasOwnProperty(key)) keys[key] = false;
            if (key === 'arrowup') keys.w = false;
            if (key === 'arrowdown') keys.s = false;
            if (key === 'arrowleft') keys.a = false;
            if (key === 'arrowright') keys.d = false;
            if (e.code === 'Space') keys.space = false;
        }

        function showMessage(text, color) {
            var el = document.getElementById('powerup-msg');
            el.innerText = text; el.style.color = color; el.style.textShadow = `0 0 20px ${color}`;
            el.style.opacity = 1;
            setTimeout(() => { el.style.opacity = 0; }, 2000);
        }

        // --- PHYSICS & LOGIC ---
        function animateGame() {
            requestAnimationFrame(animateGame);
            var dt = Math.min(clock.getDelta(), 0.1); 

            if (mazeAnimState !== 'none') {
                handleMazeAnimation(dt);
            }

            if (isGameRunning) {
                updateMazeTimer(dt);

                // Substep Physics for Rigid Safety
                var steps = 5; var subDt = dt / steps;
                for(let i=0; i<steps; i++) { updateCarPhysics(subDt); }
                
                checkInteractions();
            }
            
            animateEntities(dt);
            updateCamera(dt);
            updateParticles(dt);
            if(isGameRunning) drawMinimap();

            renderer.render(scene, camera);
        }

        function handleMazeAnimation(dt) {
            if (mazeAnimState === 'sinking') {
                mazeAnimY -= dt * 40;
                if (mazeAnimY < -20) {
                    mazeAnimState = 'rising';
                    buildMaze3D(); // Generates new layout while hidden
                    // Reset Car
                    carPos.set(CELL_SIZE/2 - MAP_OFFSET, 0, CELL_SIZE/2 - MAP_OFFSET);
                    carVelocity.set(0,0,0); carSpeed = 0; carHeading = 0;
                    playerCarGroup.position.copy(carPos); playerCarGroup.rotation.y = carHeading;
                }
            } else if (mazeAnimState === 'rising') {
                mazeAnimY += dt * 40;
                if (mazeAnimY >= 0) {
                    mazeAnimY = 0;
                    mazeAnimState = 'none';
                    isGameRunning = true; // Resume gameplay
                }
            }
            mazeWallsGroup.position.y = mazeAnimY;
        }

        function shiftMazeTransition() {
            isGameRunning = false; // pause physics
            mazeAnimState = 'sinking';
            mazeAnimY = 0;
            mazeTimer = 180; // Reset timer
            skidMarks.forEach(m => scene.remove(m)); skidMarks = [];
            document.body.style.backgroundColor = '#fff';
            setTimeout(() => { document.body.style.backgroundColor = '#050505'; }, 100);
        }

        function updateMazeTimer(dt) {
            mazeTimer -= dt;
            let timerEl = document.getElementById('timer-ui');
            
            if (mazeTimer <= 30 && mazeTimer > 0) {
                let sec = Math.ceil(mazeTimer);
                timerEl.innerText = "SHIFT IN: " + sec + "s";
                timerEl.style.color = (sec % 2 === 0) ? '#f00' : '#fff';
                timerEl.style.borderColor = (sec % 2 === 0) ? '#f00' : '#fff';
                timerEl.style.transform = (sec % 2 === 0) ? 'scale(1.1)' : 'scale(1)';
            } else {
                timerEl.innerText = "SHIFT: " + Math.floor(mazeTimer/60) + ":" + Math.floor(mazeTimer%60).toString().padStart(2,'0');
                timerEl.style.color = '#0ff';
                timerEl.style.borderColor = '#0ff';
                timerEl.style.transform = 'scale(1)';
            }

            if (mazeTimer <= 0) {
                showMessage("MAZE SHIFTING!", "#ff0000");
                shiftMazeTransition();
            }
        }

        function checkInteractions() {
            // Exit Level
            let currX = Math.floor((carPos.x + MAP_OFFSET) / CELL_SIZE);
            let currZ = Math.floor((carPos.z + MAP_OFFSET) / CELL_SIZE);
            
            if (currX === exitCell.x && currZ === exitCell.y) {
                isGameRunning = false;
                currentLevel++;
                document.getElementById('level-stats').innerText = "Sector " + (currentLevel-1) + " Secured.";
                document.getElementById('transition-screen').style.display = 'flex';
                return;
            }

            // Portals
            for(let i=0; i<portals.length; i++){
                let p = portals[i];
                let pWorldPos = new THREE.Vector3().setFromMatrixPosition(p.group.matrixWorld);
                if(carPos.distanceTo(pWorldPos) < 6) {
                    let targetX = Math.floor(Math.random() * GRID_SIZE); 
                    let targetZ = Math.floor(Math.random() * GRID_SIZE);
                    carPos.x = targetX * CELL_SIZE - MAP_OFFSET + CELL_SIZE/2;
                    carPos.z = targetZ * CELL_SIZE - MAP_OFFSET + CELL_SIZE/2;
                    showMessage("WARPED!", "#9900ff");
                    document.body.style.backgroundColor = '#90f';
                    setTimeout(() => { document.body.style.backgroundColor = '#050505'; }, 100);
                    break;
                }
            }

            // Collectibles
            for(let i=0; i<collectibles.length; i++){
                let c = collectibles[i];
                if(!c.active) continue;
                let cWorldPos = new THREE.Vector3().setFromMatrixPosition(c.mesh.matrixWorld);
                if(carPos.distanceTo(cWorldPos) < 4) {
                    c.active = false;
                    c.mesh.visible = false;
                    if (c.type === 'nitro') {
                        currentAcceleration = baseAcceleration * 2.0; // Boost!
                        showMessage("NITRO BOOST!", "#00ffff");
                        setTimeout(() => { currentAcceleration = baseAcceleration; }, 5000);
                    } else if (c.type === 'time') {
                        mazeTimer += 30;
                        showMessage("+30 SECONDS", "#ffff00");
                    }
                }
            }
        }

        function animateEntities(dt) {
            var now = Date.now();
            portals.forEach(p => {
                p.ring.rotation.y += dt * 2;
                p.ring.rotation.x += dt;
                p.group.position.y = p.startY + Math.sin(now * 0.003) * 0.5;
            });
            collectibles.forEach(c => {
                if(c.active) { c.mesh.rotation.y += dt * 3; c.mesh.rotation.x += dt * 2; }
            });
        }

        function updateCarPhysics(dt) {
            var engineForce = 0;
            if (keys.w) engineForce = currentAcceleration;
            else if (keys.s) engineForce = -braking;

            carSpeed += engineForce * dt;
            
            // Apply speed-dependent drag for realism (friction)
            carSpeed *= Math.pow(friction, dt * 60);

            if (Math.abs(carSpeed) < 0.1 && engineForce === 0) carSpeed = 0;
            
            var dynamicMax = currentAcceleration > baseAcceleration ? maxSpeed * 1.3 : maxSpeed;
            if (carSpeed > dynamicMax) carSpeed = dynamicMax;
            if (carSpeed < -dynamicMax/2) carSpeed = -dynamicMax/2;

            var steerDir = 0;
            if (keys.a) steerDir = 1; 
            if (keys.d) steerDir = -1; 
            
            if (Math.abs(carSpeed) > 1.0) {
                // Steer response tightens at very high speeds
                var speedFactor = Math.abs(carSpeed)/dynamicMax;
                var steerEffect = turnSpeed * dt * Math.max(0.3, (1.0 - speedFactor * 0.6));
                carHeading += steerDir * steerEffect * (carSpeed > 0 ? 1 : -1);
            }

            if (playerCarMesh && playerCarMesh.frontWheels) {
                playerCarMesh.frontWheels.forEach(w => w.rotation.y = steerDir * 0.5);
            }

            var forwardVector = new THREE.Vector3(Math.sin(carHeading), 0, Math.cos(carHeading));
            var currentGrip = keys.space ? 0.90 : 0.99; // Smooth drift transition
            
            if (Math.abs(carSpeed) > 5.0) {
                var targetVelocity = forwardVector.clone().multiplyScalar(carSpeed);
                carVelocity.lerp(targetVelocity, currentGrip * dt * 30);
            } else {
                carVelocity = forwardVector.clone().multiplyScalar(carSpeed);
            }

            var trueSpeed = carVelocity.length();
            var isReversing = carSpeed < 0;

            var wheelRot = trueSpeed * dt * 1.5 * (isReversing ? -1 : 1);
            if (playerCarMesh && playerCarMesh.wheels) {
                playerCarMesh.wheels.forEach(w => {
                    if (w.children) w.children.forEach(c => c.rotation.x += wheelRot);
                });
            }

            var slipAngle = forwardVector.angleTo(carVelocity.clone().normalize());
            if (slipAngle > 0.25 && trueSpeed > 15 && Math.random() > 0.4) {
                spawnSkidMark();
                spawnSmoke();
            }

            // --- RIGID WALL COLLISION ---
            var nextPos = carPos.clone().add(carVelocity.clone().multiplyScalar(dt));
            for(var i = 0; i < colliders.length; i++) {
                var box = colliders[i];
                var closestX = Math.max(box.minX, Math.min(nextPos.x, box.maxX));
                var closestZ = Math.max(box.minZ, Math.min(nextPos.z, box.maxZ));
                
                var dx = nextPos.x - closestX;
                var dz = nextPos.z - closestZ;
                var distSq = dx*dx + dz*dz;
                
                if (distSq < carRadius * carRadius) {
                    var dist = Math.sqrt(distSq);
                    var overlap = carRadius - dist;
                    if (dist > 0) {
                        nextPos.x += (dx/dist) * overlap;
                        nextPos.z += (dz/dist) * overlap;
                    } else { nextPos.x += 0.1; } // Failsafe push
                    
                    // Crash penalty
                    carVelocity.multiplyScalar(0.7); 
                    carSpeed *= 0.7; 
                }
            }

            carPos.copy(nextPos);
            playerCarGroup.position.copy(carPos);
            playerCarGroup.rotation.y = carHeading;

            // Tilt
            var tiltPitch = engineForce * 0.002;
            var tiltRoll = steerDir * (trueSpeed/dynamicMax) * 0.06;
            playerCarMesh.rotation.x = THREE.MathUtils.lerp(playerCarMesh.rotation.x, tiltPitch, dt * 10);
            playerCarMesh.rotation.z = THREE.MathUtils.lerp(playerCarMesh.rotation.z, tiltRoll, dt * 10);

            // UI (Convert so max speed ~ 320 KM/H on UI)
            var displayKmh = Math.floor(trueSpeed * 2.8); 
            document.getElementById('speed-val').innerText = displayKmh;
            var rpmPercent = Math.min(100, (trueSpeed / dynamicMax) * 100 + (keys.w ? 8 : 0));
            document.getElementById('rpm-fill').style.width = rpmPercent + '%';
            document.getElementById('rpm-fill').style.background = currentAcceleration > baseAcceleration ? '#0ff' : 'linear-gradient(90deg, #0ff, #f0f)';
        }

        // --- SKIDS & SMOKE ---
        function spawnSkidMark() {
            var geo = new THREE.PlaneGeometry(0.8, 1); geo.rotateX(-Math.PI/2);
            var mat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.7, depthWrite: false });
            var left = new THREE.Mesh(geo, mat); var right = new THREE.Mesh(geo, mat);
            
            var backOff = new THREE.Vector3(0, 0, -1.5).applyQuaternion(playerCarGroup.quaternion);
            var lOff = new THREE.Vector3(-0.9, 0.02, 0).applyQuaternion(playerCarGroup.quaternion);
            var rOff = new THREE.Vector3(0.9, 0.02, 0).applyQuaternion(playerCarGroup.quaternion);

            left.position.copy(carPos).add(backOff).add(lOff); right.position.copy(carPos).add(backOff).add(rOff);
            left.rotation.y = right.rotation.y = carHeading;
            left.userData.birth = right.userData.birth = Date.now();
            
            scene.add(left); scene.add(right);
            skidMarks.push(left, right);
        }

        function spawnSmoke() {
            var geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
            var mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.4 });
            var smoke = new THREE.Mesh(geo, mat);
            var backOff = new THREE.Vector3((Math.random()-0.5)*2, 0.5, -2).applyQuaternion(playerCarGroup.quaternion);
            smoke.position.copy(carPos).add(backOff);
            smoke.userData = { birth: Date.now(), vel: new THREE.Vector3((Math.random()-0.5)*3, Math.random()*3, (Math.random()-0.5)*3) };
            scene.add(smoke); smokeParticles.push(smoke);
        }

        function updateParticles(dt) {
            var now = Date.now();
            for (var i = skidMarks.length - 1; i >= 0; i--) {
                var m = skidMarks[i]; var age = now - m.userData.birth;
                if (age > 1500) m.material.opacity = Math.max(0, 0.7 - (age-1500)/1000);
                if (age > 2500) { scene.remove(m); skidMarks.splice(i, 1); }
            }
            for (var i = smokeParticles.length - 1; i >= 0; i--) {
                var s = smokeParticles[i]; var age = now - s.userData.birth;
                s.position.add(s.userData.vel.clone().multiplyScalar(dt)); s.scale.addScalar(dt * 3);
                s.material.opacity = Math.max(0, 0.4 - age/1000);
                if (age > 1000) { scene.remove(s); smokeParticles.splice(i, 1); }
            }
        }

        // --- CAMERA ---
        function updateCamera(dt) {
            var cfg = cameraConfigs[currentCamera];
            var fovTarget = cfg.fov + (carVelocity.length() / maxSpeed) * 25; 
            camera.fov = THREE.MathUtils.lerp(camera.fov, fovTarget, dt * 5);
            camera.updateProjectionMatrix();

            var offset = cfg.offset.clone();
            if (currentCamera !== 1) offset.z -= (carVelocity.length() / maxSpeed) * 4; 
            
            var targetPos = carPos.clone().add(offset.applyQuaternion(playerCarGroup.quaternion));
            camera.position.lerp(targetPos, dt * 10);
            var lookTarget = carPos.clone().add(cfg.look.clone().applyQuaternion(playerCarGroup.quaternion));
            camera.lookAt(lookTarget);
        }

        // --- MINIMAP ---
        function drawMinimap() {
            if(!minimapCtx) return;
            var w = minimapCtx.canvas.width;
            minimapCtx.clearRect(0, 0, w, w);
            
            var cellW = w / GRID_SIZE;
            
            minimapCtx.strokeStyle = '#0ff'; minimapCtx.lineWidth = 1;
            for(let x=0; x<GRID_SIZE; x++) {
                for(let y=0; y<GRID_SIZE; y++) {
                    let cell = mazeGrid[x][y];
                    let px = x * cellW; let py = y * cellW;
                    minimapCtx.beginPath();
                    if(cell.walls.top) { minimapCtx.moveTo(px, py); minimapCtx.lineTo(px+cellW, py); }
                    if(cell.walls.bottom) { minimapCtx.moveTo(px, py+cellW); minimapCtx.lineTo(px+cellW, py+cellW); }
                    if(cell.walls.left) { minimapCtx.moveTo(px, py); minimapCtx.lineTo(px, py+cellW); }
                    if(cell.walls.right) { minimapCtx.moveTo(px+cellW, py); minimapCtx.lineTo(px+cellW, py+cellW); }
                    minimapCtx.stroke();
                }
            }

            minimapCtx.fillStyle = '#0f0';
            minimapCtx.fillRect(exitCell.x * cellW + 2, exitCell.y * cellW + 2, cellW-4, cellW-4);

            minimapCtx.fillStyle = '#90f';
            portals.forEach(p => {
                minimapCtx.beginPath(); minimapCtx.arc(p.gridX*cellW + cellW/2, p.gridY*cellW + cellW/2, cellW/3, 0, Math.PI*2); minimapCtx.fill();
            });

            collectibles.forEach(c => {
                if(c.active) {
                    minimapCtx.fillStyle = '#0ff';
                    let cPos = new THREE.Vector3().setFromMatrixPosition(c.mesh.matrixWorld);
                    let mx = (cPos.x + MAP_OFFSET) / CELL_SIZE; let mz = (cPos.z + MAP_OFFSET) / CELL_SIZE;
                    minimapCtx.beginPath(); minimapCtx.arc(mx*cellW, mz*cellW, cellW/4, 0, Math.PI*2); minimapCtx.fill();
                }
            });

            let currX = (carPos.x + MAP_OFFSET) / CELL_SIZE; let currZ = (carPos.z + MAP_OFFSET) / CELL_SIZE;
            minimapCtx.fillStyle = '#f00';
            minimapCtx.beginPath(); minimapCtx.arc(currX * cellW, currZ * cellW, 3, 0, Math.PI*2); minimapCtx.fill();
            
            // Draw player heading line
            minimapCtx.strokeStyle = '#f00'; minimapCtx.beginPath();
            minimapCtx.moveTo(currX * cellW, currZ * cellW);
            minimapCtx.lineTo(currX * cellW + Math.sin(carHeading)*6, currZ * cellW + Math.cos(carHeading)*6);
            minimapCtx.stroke();
        }

        function onWindowResize() {
            if(!camera) return;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }