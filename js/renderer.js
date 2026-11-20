window.RunRenderer = (function () {
  const W = 450;
  const H = 270;
  const GROUND_Y = 224;

  let particles = [];
  let dustPuffs = [];
  let floaters = [];

  // ===================== PRELOAD ALL CHARACTER + DESIGN SPRITES =====================
  const CHAR_SPRITES = [
    'motion_idle', 'motion_walk', 'motion_run', 'motion_jump',
    'motion_hit', 'motion_item', 'motion_win',
    'skin_basic', 'skin_raincoat', 'skin_padding',
    'skin_hanbok', 'skin_santa', 'skin_skier'
  ];

  const DESIGN_SPRITES = [
    'obs_dirt_block', 'obs_crate', 'obs_stone_block', 'obs_ice_block', 'obs_spikes',
    'obs_fence', 'obs_barricade', 'obs_ice_spikes', 'obs_storm_cloud', 'obs_snowman',
    'obs_fire', 'obs_mace', 'obs_warning_sign', 'obs_tornado', 'obs_meteor',
    'item_coin', 'item_coin_side', 'item_star',
    'orb_star', 'orb_magnet', 'orb_bolt', 'orb_potion',
    'tile_grass', 'tile_stone', 'tile_ice',
    'tree_green', 'tree_snow', 'prop_lamp',
    'ui_chest', 'ui_fever', 'pet_dog'
  ];

  const sprites = {};

  CHAR_SPRITES.forEach((key) => {
    const img = new Image();
    img.src = `assets/sprites/${key}.png`;
    sprites[key] = img;
  });

  DESIGN_SPRITES.forEach((key) => {
    const img = new Image();
    img.src = `assets/design/${key}.png`;
    sprites[key] = img;
  });

  function getSprite(key) {
    const img = sprites[key];
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }

  function initParticles() {
    particles = [];
    for (let i = 0; i < 58; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        v: 0.7 + Math.random() * 1.4,
        s: 1 + Math.floor(Math.random() * 2),
        p: Math.random() * Math.PI * 2
      });
    }
  }
  initParticles();

  function clearFloaters() {
    floaters = [];
    dustPuffs = [];
  }

  function spawnFloater(text, color, x, y) {
    floaters.push({ text, color, x, y, life: 0.95, maxLife: 0.95 });
  }

  function spawnDust(x, y, isStar = false) {
    dustPuffs.push({
      x,
      y,
      vx: -35 - Math.random() * 30,
      vy: -8 - Math.random() * 14,
      r: isStar ? 4 : 4 + Math.random() * 4,
      isStar,
      life: isStar ? 0.55 : 0.42,
      maxLife: isStar ? 0.55 : 0.42
    });
  }

  // ===================== MOCKUP-INSPIRED BACKGROUND & TILESET =====================
  function drawBackground(ctx, w, h, groundY, seasonId, scroll, t) {
    const season = window.RUN_DATA.SEASONS.find((s) => s.id === seasonId) || window.RUN_DATA.SEASONS[0];
    const [top, mid, bot] = season.sky;
    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, top);
    grad.addColorStop(0.58, mid);
    grad.addColorStop(1, bot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, groundY);

    // Fluffy pixel clouds (matching top mockup style!)
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 145 - scroll * 0.06 + t * 6) % (w + 120) + (w + 120)) % (w + 120) - 70;
      const cy = 22 + (i % 2) * 20;
      ctx.fillStyle = 'rgba(210, 226, 255, 0.8)';
      ctx.fillRect(Math.floor(cx) + 4, cy + 12, 54, 10);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fillRect(Math.floor(cx), cy + 6, 62, 12);
      ctx.fillRect(Math.floor(cx) + 10, cy - 4, 38, 12);
      ctx.fillRect(Math.floor(cx) + 20, cy - 10, 20, 8);
    }

    // Distant Namsan Mountain + N Seoul Tower (centerpiece of mockup!)
    ctx.fillStyle = seasonId === 'winter' ? '#89a7db' : '#7ea2d6';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(0, groundY - 40);
    ctx.lineTo(w * 0.22, groundY - 68);
    ctx.lineTo(w * 0.52, groundY - 96);
    ctx.lineTo(w * 0.80, groundY - 64);
    ctx.lineTo(w, groundY - 78);
    ctx.lineTo(w, groundY);
    ctx.closePath();
    ctx.fill();

    // N Seoul Tower crisp pixel silhouette on peak
    const tx = Math.floor(w * 0.52);
    const ty = groundY - 96;
    ctx.fillStyle = '#5c7db5';
    ctx.fillRect(tx - 2, ty - 34, 4, 36);
    ctx.fillRect(tx - 7, ty - 26, 14, 7);
    ctx.fillStyle = '#d4e8ff';
    ctx.fillRect(tx - 5, ty - 24, 10, 3);
    ctx.fillStyle = '#5c7db5';
    ctx.fillRect(tx - 1, ty - 48, 2, 14);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(tx - 1, ty - 50, 2, 3);

    // Pastel Korean City Skyline Silhouette (far parallax)
    const cityOff = Math.floor(scroll * 0.16) % 240;
    for (let rep = -1; rep < 4; rep++) {
      const bx = rep * 240 - cityOff;
      drawPastelBuilding(ctx, bx + 12, groundY - 72, 36, 72, '#9db4de');
      drawPastelBuilding(ctx, bx + 54, groundY - 90, 42, 90, '#91aad6');
      drawPastelBuilding(ctx, bx + 110, groundY - 64, 34, 64, '#a4bae0');
      drawPastelBuilding(ctx, bx + 166, groundY - 82, 44, 82, '#8fa6d4');
    }

    // Midground Pixel Pine Trees & Streetlamps from uploaded tileset!
    const treeSpr = getSprite(season.tree);
    const lampSpr = getSprite('prop_lamp');
    const propOff = Math.floor(scroll * 0.55) % 260;
    for (let rep = -1; rep <= 3; rep++) {
      const px = rep * 260 - propOff;
      if (treeSpr) {
        const th = seasonId === 'winter' ? 54 : 42;
        const tw = Math.round(th * (treeSpr.naturalWidth / treeSpr.naturalHeight));
        ctx.drawImage(treeSpr, Math.floor(px + 20), Math.floor(groundY - th + 3), tw, th);
        ctx.drawImage(treeSpr, Math.floor(px + 135), Math.floor(groundY - Math.round(th * 0.82) + 3), Math.round(tw * 0.82), Math.round(th * 0.82));
      }
      if (lampSpr) {
        const lh = 48;
        const lw = Math.round(lh * (lampSpr.naturalWidth / lampSpr.naturalHeight));
        ctx.drawImage(lampSpr, Math.floor(px + 92), Math.floor(groundY - lh + 2), lw, lh);
      }
    }

    // Tiled Pixel Ground (using extracted tile_grass / tile_stone / tile_ice!)
    const tileSpr = getSprite(season.tile) || getSprite('tile_grass');
    const tileW = 36;
    const tileH = 34;
    const tileOff = Math.floor(scroll) % tileW;

    // Deep underground soil/ice base below tile row
    ctx.fillStyle = seasonId === 'winter' ? '#3d5078' : (seasonId === 'autumn' ? '#4a4559' : '#57392c');
    ctx.fillRect(0, groundY, w, h - groundY);

    if (tileSpr) {
      for (let gx = -tileOff; gx < w + tileW; gx += tileW) {
        ctx.drawImage(tileSpr, Math.floor(gx), groundY - 2, tileW, tileH);
      }
      // Second dark brick sub-layer to fill bottom cleanly
      ctx.fillStyle = 'rgba(20, 18, 36, 0.35)';
      ctx.fillRect(0, groundY + tileH - 3, w, h - (groundY + tileH - 3));
    } else {
      ctx.fillStyle = '#5fc256';
      ctx.fillRect(0, groundY - 2, w, 6);
      ctx.fillStyle = '#85553b';
      ctx.fillRect(0, groundY + 4, w, h - groundY);
    }
  }

  function drawPastelBuilding(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(235, 245, 255, 0.45)';
    for (let r = 0; r < Math.floor((h - 14) / 11); r++) {
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(x + 5 + c * 10, y + 8 + r * 11, 6, 5);
      }
    }
  }

  // ===================== WEATHER PARTICLES & DUST PUFFS =====================
  function drawDustPuffs(ctx, dt) {
    for (let i = dustPuffs.length - 1; i >= 0; i--) {
      const p = dustPuffs[i];
      p.life -= dt;
      if (p.life <= 0) { dustPuffs.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      if (p.isStar) {
        ctx.fillStyle = '#ffe966';
        ctx.fillRect(Math.floor(p.x) - 3, Math.floor(p.y) - 1, 6, 2);
        ctx.fillRect(Math.floor(p.x) - 1, Math.floor(p.y) - 3, 2, 6);
      } else {
        ctx.fillStyle = '#fff3df';
        ctx.beginPath();
        ctx.arc(Math.floor(p.x), Math.floor(p.y), p.r * (0.6 + (1 - alpha) * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawParticles(ctx, w, h, seasonId, dt, t) {
    particles.forEach((p) => {
      if (seasonId === 'summer') {
        p.x -= 95 * dt * p.v;
        p.y += 225 * dt * p.v;
        ctx.fillStyle = 'rgba(210, 236, 255, 0.78)';
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 9);
      } else if (seasonId === 'winter') {
        p.x -= (48 + Math.sin(t * 2 + p.p) * 18) * dt;
        p.y += 50 * dt * p.v;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.s + 1, p.s + 1);
      } else if (seasonId === 'autumn') {
        p.x -= 115 * dt * p.v;
        p.y += (30 + Math.sin(t * 4 + p.p) * 18) * dt;
        ctx.fillStyle = p.s === 1 ? '#ff9638' : '#ffd24d';
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 3, 2);
      } else {
        // Spring sakura petals + subtle dust
        p.x -= 64 * dt * p.v;
        p.y += (26 + Math.sin(t * 3 + p.p) * 14) * dt;
        ctx.fillStyle = p.s === 1 ? '#ffc4dc' : 'rgba(255, 240, 175, 0.85)';
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 3, 2);
      }
      if (p.y > h) { p.y = -6; p.x = Math.random() * (w + 60); }
      if (p.x < -10) { p.x = w + 10; p.y = Math.random() * h; }
    });
  }

  // ===================== SHIBA PUPPY COMPANION PET =====================
  function drawPuppyPet(ctx, x, y, t) {
    const dog = getSprite('pet_dog');
    if (!dog) return;
    const hop = Math.abs(Math.sin(t * 14 + 0.8)) * 4;
    const h = 30;
    const w = Math.round(h * (dog.naturalWidth / dog.naturalHeight));
    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(Math.floor(x - w * 0.35), Math.floor(GROUND_Y - 1), Math.floor(w * 0.7), 3);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(dog, Math.floor(x - w / 2), Math.floor(y - h - hop), w, h);
  }

  // ===================== UPLOADED PIXEL K-CHARACTER SPRITE RENDERER =====================
  function pickCharacterSprite(charDef, opts, t) {
    if (charDef.useFullMotions) {
      if (opts.hitPoseTimer > 0) return getSprite('motion_hit');
      if (opts.sliding) return getSprite('motion_hit');
      if (opts.inAir) return getSprite('motion_jump');
      if (opts.winPoseTimer > 0) return getSprite('motion_win');
      if (opts.itemPoseTimer > 0) return getSprite('motion_item');
      if (opts.running) {
        const frame = Math.floor(t * 9) % 2;
        return getSprite(frame === 0 ? 'motion_run' : 'motion_walk');
      }
      return getSprite('motion_idle');
    }
    return getSprite(charDef.spriteKey) || getSprite('motion_idle');
  }

  function drawCharacter(ctx, charDef, x, y, opts, t) {
    const {
      sliding, inAir, gliding, invulnTimer, shield, feverTimer, running,
      scaleHeight = 52
    } = opts;

    if (invulnTimer > 0 && Math.floor(t * 20) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }

    const col = charDef.colors || {};
    const cx = Math.floor(x);
    const cy = Math.floor(y);

    if (!inAir) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(cx - (sliding ? 18 : 13), cy - 1, sliding ? 36 : 26, 4);
    }

    // Fever rainbow aura / Shield ring
    if (feverTimer > 0) {
      ctx.strokeStyle = Math.floor(t * 14) % 2 === 0 ? '#ffe85c' : '#63e8ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy - (sliding ? 13 : scaleHeight * 0.48), sliding ? 24 : scaleHeight * 0.56, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shield) {
      ctx.strokeStyle = 'rgba(110, 220, 255, 0.92)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy - (sliding ? 13 : scaleHeight * 0.48), sliding ? 23 : scaleHeight * 0.54, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Umbrella canopy when 우비 소년 glides in midair
    if (col.umbrella && gliding) {
      ctx.fillStyle = '#2d3a4f';
      ctx.fillRect(cx + 8, cy - scaleHeight - 16, 2, 34);
      ctx.fillStyle = '#2672d9';
      ctx.fillRect(cx - 18, cy - scaleHeight - 20, 40, 7);
      ctx.fillRect(cx - 12, cy - scaleHeight - 25, 28, 6);
      ctx.fillStyle = '#ffd447';
      ctx.fillRect(cx - 4, cy - scaleHeight - 24, 12, 3);
    }

    if (sliding) {
      ctx.fillStyle = 'rgba(255, 245, 230, 0.85)';
      const dustShift = Math.floor((t * 48) % 8);
      ctx.fillRect(cx - 26 - dustShift, cy - 5, 11, 4);
      ctx.fillRect(cx - 20 - dustShift, cy - 10, 7, 3);
    }

    const spr = pickCharacterSprite(charDef, opts, t);
    if (spr) {
      const targetH = sliding ? Math.round(scaleHeight * 0.56) : scaleHeight;
      const ratio = spr.naturalWidth / spr.naturalHeight;
      const drawW = Math.round(targetH * ratio);
      const drawH = targetH;

      const bob = running && !inAir && !sliding ? Math.abs(Math.sin(t * 16)) * 3.5 : 0;
      let rot = 0;
      if (!charDef.useFullMotions) {
        if (sliding) rot = -0.32;
        else if (inAir) rot = gliding ? 0.05 : -0.14;
        else if (running) rot = 0.08 + Math.sin(t * 16) * 0.06;
      } else if (sliding) {
        rot = 0.04;
      }

      ctx.save();
      ctx.translate(cx, Math.floor(cy - bob));
      if (rot !== 0) ctx.rotate(rot);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, Math.floor(-drawW / 2), Math.floor(-drawH), drawW, drawH);

      if (col.coffeeCup && !sliding) {
        ctx.fillStyle = 'rgba(225, 248, 255, 0.95)';
        ctx.fillRect(Math.floor(drawW * 0.34), Math.floor(-drawH * 0.52), 7, 10);
        ctx.fillStyle = '#4a2c16';
        ctx.fillRect(Math.floor(drawW * 0.34) + 1, Math.floor(-drawH * 0.52) + 3, 5, 6);
        ctx.fillStyle = '#9ce8ff';
        ctx.fillRect(Math.floor(drawW * 0.34) + 1, Math.floor(-drawH * 0.52) + 2, 2, 2);
        ctx.fillStyle = '#24c464';
        ctx.fillRect(Math.floor(drawW * 0.34) + 3, Math.floor(-drawH * 0.52) - 4, 2, 5);
      }

      ctx.restore();
    } else {
      ctx.fillStyle = col.top || '#f5b82e';
      ctx.fillRect(cx - 10, cy - (sliding ? 18 : 36), 20, sliding ? 18 : 36);
    }

    ctx.globalAlpha = 1;
  }

  // ===================== DESIGN SHEET OBSTACLES =====================
  function drawObstacle(ctx, ob, t) {
    // Right-edge warning badge before fast flying aerial obstacle enters
    if (ob.warn && ob.x > W - 18) {
      const wy = Math.floor(ob.y + ob.h / 2);
      const blink = Math.floor(t * 14) % 2 === 0;
      ctx.fillStyle = blink ? '#e83a3a' : '#ff9914';
      ctx.fillRect(W - 26, wy - 12, 20, 24);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W - 26, wy - 12, 20, 24);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', W - 16, wy + 6);
      ctx.textAlign = 'left';
      return;
    }

    const spr = getSprite(ob.sprite);
    const x = Math.floor(ob.x);
    let y = Math.floor(ob.y);

    if (ob.lane === 'air') {
      y += Math.round(Math.sin(t * 9 + ob.x * 0.04) * 3);
    }

    if (spr) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (ob.sprite === 'obs_mace' || ob.sprite === 'obs_meteor') {
        ctx.translate(x + ob.w / 2, y + ob.h / 2);
        ctx.rotate(-t * (ob.sprite === 'obs_mace' ? 5.5 : 3.2));
        ctx.drawImage(spr, -ob.w / 2, -ob.h / 2, ob.w, ob.h);
      } else {
        ctx.drawImage(spr, x, y, ob.w, ob.h);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(x, y, ob.w, ob.h);
    }
  }

  // ===================== DESIGN SHEET COINS & ITEMS =====================
  function drawItem(ctx, it, t) {
    const x = Math.floor(it.x);
    const y = Math.floor(it.y + Math.sin(t * 7 + it.x * 0.05) * 2.5);
    ctx.imageSmoothingEnabled = false;

    if (it.kind === 'coin' || it.kind === 'big_coin') {
      const spin = Math.floor(t * 7 + it.x * 0.03) % 4 === 0;
      const spr = getSprite(spin ? 'item_coin_side' : 'item_coin');
      const sz = it.kind === 'big_coin' ? 28 : 20;
      if (spr) {
        const dw = spin ? Math.round(sz * 0.55) : sz;
        ctx.drawImage(spr, Math.floor(x - dw / 2), Math.floor(y - sz / 2), dw, sz);
      } else {
        ctx.fillStyle = '#ffd447';
        ctx.beginPath(); ctx.arc(x, y, sz / 2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (it.kind === 'star') {
      const spr = getSprite('item_star');
      if (spr) ctx.drawImage(spr, x - 12, y - 12, 24, 24);
    } else if (it.kind === 'coffee') {
      const spr = getSprite('orb_potion');
      if (spr) ctx.drawImage(spr, x - 15, y - 15, 30, 30);
    } else if (it.kind === 'magnet') {
      const spr = getSprite('orb_magnet');
      if (spr) ctx.drawImage(spr, x - 15, y - 15, 30, 30);
    } else if (it.kind === 'umbrella_fever') {
      const spr = getSprite('orb_bolt');
      if (spr) ctx.drawImage(spr, x - 15, y - 15, 30, 30);
    } else if (it.kind === 'chest') {
      const spr = getSprite('ui_chest');
      if (spr) ctx.drawImage(spr, x - 16, y - 14, 32, 28);
    }
  }

  function drawFeverBadge(ctx, t) {
    const spr = getSprite('ui_fever');
    if (!spr) return;
    const scale = 1 + Math.sin(t * 14) * 0.07;
    const dw = Math.round(118 * scale);
    const dh = Math.round(47 * scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spr, Math.floor((W - dw) / 2), 42, dw, dh);
  }

  function drawFloaters(ctx, dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        floaters.splice(i, 1);
        continue;
      }
      const prog = 1 - f.life / f.maxLife;
      const fx = Math.max(54, Math.min(W - 54, Math.floor(f.x)));
      const fy = Math.max(22, Math.floor(f.y - prog * 28));
      ctx.globalAlpha = Math.min(1, f.life * 2.2);
      ctx.font = 'bold 13px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#191430';
      ctx.strokeText(f.text, fx, fy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, fx, fy);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }

  // ===================== PUBLIC RENDERERS =====================
  let dustTimer = 0;
  function renderRunFrame(ctx, run, charDef, dt, t) {
    ctx.imageSmoothingEnabled = false;
    drawBackground(ctx, W, H, GROUND_Y, run.seasonId, run.scroll, t);

    // Emit cute running dust & FEVER stars!
    if (dt > 0) {
      dustTimer -= dt;
      if (dustTimer <= 0) {
        dustTimer = run.feverTimer > 0 ? 0.06 : 0.14;
        if (run.playerY >= GROUND_Y - 2) {
          spawnDust(run.playerX - 14, GROUND_Y - 3, run.feverTimer > 0);
        } else if (run.feverTimer > 0) {
          spawnDust(run.playerX - 10, run.playerY - 18, true);
        }
      }
    }

    drawDustPuffs(ctx, dt);

    // Collectibles
    run.items.forEach((it) => drawItem(ctx, it, t));

    // Obstacles
    run.obstacles.forEach((ob) => drawObstacle(ctx, ob, t));

    // Loyal Shiba Puppy Pet running right behind!
    drawPuppyPet(ctx, run.playerX - 42, run.petY, t);

    // Runner Character
    drawCharacter(ctx, charDef, run.playerX, run.playerY, {
      sliding: run.sliding,
      inAir: run.playerY < GROUND_Y - 1,
      gliding: run.gliding,
      invulnTimer: run.invulnTimer,
      shield: run.shield,
      feverTimer: run.feverTimer,
      hitPoseTimer: run.hitPoseTimer || 0,
      itemPoseTimer: run.itemPoseTimer || 0,
      winPoseTimer: run.winPoseTimer || 0,
      running: true,
      scaleHeight: 50
    }, t);

    // Weather particles
    drawParticles(ctx, W, H, run.seasonId, dt, t);

    // FEVER! Pixel Ribbon Banner when active
    if (run.feverTimer > 0) {
      drawFeverBadge(ctx, t);
    }

    drawFloaters(ctx, dt);
  }

  function renderHomePreview(ctx, charDef, t) {
    const pw = 380, ph = 175, gy = 146;
    ctx.imageSmoothingEnabled = false;
    const seasonIdx = Math.floor(t / 6) % 4;
    const seasonId = window.RUN_DATA.SEASONS[seasonIdx].id;
    drawBackground(ctx, pw, ph, gy, seasonId, t * 44, t);
    // Cute Shiba Puppy accompanying on Home Screen too!
    const dog = getSprite('pet_dog');
    if (dog) {
      const hop = Math.abs(Math.sin(t * 14 + 0.8)) * 4;
      const dh = 36;
      const dw = Math.round(dh * (dog.naturalWidth / dog.naturalHeight));
      ctx.drawImage(dog, Math.floor(pw / 2 - 58 - dw / 2), Math.floor(gy + 2 - dh - hop), dw, dh);
    }
    drawCharacter(ctx, charDef, pw / 2 + 10, gy + 2, {
      sliding: false,
      inAir: false,
      gliding: false,
      invulnTimer: 0,
      shield: false,
      feverTimer: 0,
      running: true,
      scaleHeight: 72
    }, t);
    drawParticles(ctx, pw, ph, seasonId, 0.016, t);
  }

  return {
    W,
    H,
    GROUND_Y,
    clearFloaters,
    spawnFloater,
    spawnDust,
    renderRunFrame,
    renderHomePreview
  };
})();
