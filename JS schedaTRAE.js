(() => {
  const STORAGE_KEY = "ttrpg.sheet.v1";

  // --- CONFIGURAZIONE E COSTANTI ---
  const SKILL_ABILITY_MAP = {
    acrobazia: "dex",
    atletica: "str",
    arcana: "dex",
    creazione: "dex",
    comunicazione: "int",
    diplomazia: "int",
    furtivita: "int",
    inganno: "int",
    intuizione: "int",
    intimidazione: "wis",
    manualita: "wis",
    medicina: "wis",
    memoria: "wis",
    natura: "wis",
    religione: "cha",
    performance: "cha",
    persuasione: "cha",
    sopravvivenza: "cha",
  };

  const SAVE_ABILITY_MAP = {
    fortitude: "con",
    reflex: "dex",
    will: "wis",
    perception: "wis"
  };

  const SAVE_FIELD_MAP = {
    fortitude: "save_fortitude",
    reflex: "save_reflex",
    will: "save_will",
    perception: "perception_value"
  };

  const COLOR_STOPS = [
    [44, 24, 16],   // scuro
    [110, 110, 110],// grigio
    [79, 122, 79],  // verde
    [74, 111, 165], // blu
    [122, 79, 122], // viola
    [201, 163, 74]  // oro
  ];

  /** @type {any} */
  let state = {
    notes: {
      benedizioni: "",
      privilegi: ""
    },
    cards: [
      { name: "", ability: "", hit: "", dmg: "", desc: "", rank: 0 },
      { name: "", ability: "", hit: "", dmg: "", desc: "", rank: 0 }
    ],
    inventory: [
      { name: "", qty: 0, weight: 0 }
    ],
    spellbooks: [
      {
        class: "",
        ability: "int", // Default
        rank: 0,
        prepared: 0,
        maxLvl: 0,
        bonus: 0,
        dc: 10,
        mana_actual: 0,
        mana_max: 0,
        regen: [0, 0, 0],
        spells: [] // { name, level, school, time, comp, range, dur, class, desc, nextLvl }
      }
    ],
    name: "",
    race: "",
    class_hp: 0,
    race_hp: 0,
    className: "",
    alignment: "",
    level: 1,
    xp: "",
    abilities: {
      str: { score: 10 },
      dex: { score: 10 },
      con: { score: 10 },
      int: { score: 10 },
      wis: { score: 10 },
      cha: { score: 10 },
    },
    skills: {}, // Popolato dinamicamente
    save_fortitude: { rank: 0 },
    save_reflex: { rank: 0 },
    save_will: { rank: 0 },
    perception_value: { rank: 0 },
    ac: 10,
    bonus_ac: 0,
    shield_ac: 0,
    shield_parry: 0,
    durability: 0,
    shield_hp: 0,
    init_modifier: 0,
    movement: 30,
    hp_regen: 0,
    hp_actual: 0,
    hp_bonus: 0,
    death_save_success: 0,
    death_save_failure: 0,
    coins: { CP: 0, SP: 0, EP: 0, GP: 0, PP: 0 }
  };

  // Inizializza skills se non presenti
  Object.keys(SKILL_ABILITY_MAP).forEach(s => {
    if (!state.skills[s]) state.skills[s] = { rank: 0 };
  });

  // --- UTILITY ---
  const debounce = (fn, delay = 150) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  const debouncedRender = debounce(() => render(), 150);

  const clampInt = (n, min, max, fallback) => {
    const x = Number.parseInt(String(n), 10);
    if (Number.isNaN(x)) return fallback;
    return Math.min(max, Math.max(min, x));
  };

  const getByPath = (obj, path) => {
    return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
  };

  const setByPath = (obj, path, value) => {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
  };

  // --- LOGICA DI CALCOLO ---
  const modFromScore = (score) => Math.floor((score - 10) / 2);
  const fmtSigned = (n) => (n >= 0 ? `+${n}` : `${n}`);
  const adventurerRank = (level) => 1 + Math.floor(Math.max(1, level - 1) / 3);
  const profBonusFromRank = (rank) => (rank <= 0 ? 0 : 2 * rank - 1);

  function interpolateColor(rank) {
    const max = 6;
    if (rank <= 0) return "transparent";
    const t = Math.min(rank, max) / max * (COLOR_STOPS.length - 1);
    const i = Math.floor(t);
    const f = t - i;
    if (i >= COLOR_STOPS.length - 1) return `rgb(${COLOR_STOPS[COLOR_STOPS.length - 1].join(',')})`;
    const c1 = COLOR_STOPS[i];
    const c2 = COLOR_STOPS[i + 1];
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * f);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * f);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * f);
    return `rgb(${r},${g},${b})`;
  }

  const compute = () => {
    const level = clampInt(state.level, 1, 30, 1);
    const advRank = adventurerRank(level);
    const rankInteger = advRank;
    const rankDecimal = ((level - 1) % 3) + 1;
    const rankDisplay = `${rankInteger}.${rankDecimal}`;

    const mods = Object.fromEntries(
      Object.entries(state.abilities).map(([k, v]) => [k, modFromScore(clampInt(v.score, 0, 30, 10))])
    );

    // HP Max
    const conMod = mods.con ?? 0;
    const classHP = state.class_hp || 0;
    const raceHP = state.race_hp || 0;
    let hpMax = conMod + classHP + raceHP;
    if (level > 1) {
      const perLevel = conMod + Math.floor(classHP / 2) + 1;
      hpMax += perLevel * (level - 1);
    }

    // Calcolo Skill e Save con logica unificata
    const calcBonus = (ability, rank) => {
      let total = mods[ability] ?? 0;
      if (rank > 0) total += profBonusFromRank(rank) + Math.floor(advRank);
      return total;
    };

    const skills = Object.fromEntries(
      Object.entries(SKILL_ABILITY_MAP).map(([key, ability]) => {
        const rank = clampInt(state.skills?.[key]?.rank, 0, 6, 0);
        return [key, { total: calcBonus(ability, rank), rank }];
      })
    );

    const saves = Object.fromEntries(
      Object.entries(SAVE_ABILITY_MAP).map(([key, ability]) => {
        const field = SAVE_FIELD_MAP[key];
        const rank = clampInt(state[field]?.rank, 0, 6, 0);
        return [key, { total: calcBonus(ability, rank), rank }];
      })
    );

    const totalAC = (state.ac || 0) + (state.bonus_ac || 0) + (state.shield_ac || 0) + (state.shield_parry || 0);

    // Calcolo Spellbook
    const spellbook = state.spellbooks?.[0];
    if (spellbook) {
      const ability = spellbook.ability || "int";
      const rank = clampInt(spellbook.rank, 0, 6, 0);
      const maxLvl = clampInt(spellbook.maxLvl, 0, 10, 0);
      const profBonus = profBonusFromRank(rank);
      
      spellbook.bonus = calcBonus(ability, rank);
      spellbook.dc = 10 + spellbook.bonus;

      // Calcolo Rigenerazione Mana
      spellbook.regen = [
        maxLvl + Math.floor(maxLvl / 2),           // Emergenza
        maxLvl + profBonus,                        // Breve
        5 * (maxLvl + profBonus)                // Lungo
      ];
    }

    return { level, rankDisplay, mods, advRank, skills, saves, hpMax, totalAC };
  };

  // --- GESTIONE DATI ---
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.error("Save error", e); }
  };

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = { ...state, ...parsed };
      }
    } catch (e) { console.error("Load error", e); }
  };

  // --- RENDER ---
  const render = () => {
    const c = compute();

    // Sincronizza HP Max nello stato
    state.hp_max = c.hpMax;
    const hpMaxEl = document.querySelector('[data-computed="hp_max"]');
    if (hpMaxEl) hpMaxEl.textContent = c.hpMax;

    // Header & Stats Base
    const selectors = {
      '[data-computed="header:rank"]': c.rankDisplay,
      '[data-computed="ac_total"]': c.totalAC,
      '[data-computed="init"]': fmtSigned(c.mods.dex + (state.init_modifier || 0)),
      '[data-computed="perception"]': fmtSigned(c.saves.perception.total),
      '[data-computed="spellbook.bonus"]': fmtSigned(state.spellbooks?.[0]?.bonus || 0),
      '[data-computed="spellbook.dc"]': state.spellbooks?.[0]?.dc || 10,
      '[data-computed="spellbook.regen.0"]': state.spellbooks?.[0]?.regen?.[0] || 0,
      '[data-computed="spellbook.regen.1"]': state.spellbooks?.[0]?.regen?.[1] || 0,
      '[data-computed="spellbook.regen.2"]': state.spellbooks?.[0]?.regen?.[2] || 0
    };
    Object.entries(selectors).forEach(([sel, val]) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = val;
    });

    // Abilità (Wheel)
    Object.entries(c.mods).forEach(([ability, mod]) => {
      const modEl = document.querySelector(`[data-computed="wheel:ability:${ability}:mod"]`);
      if (modEl) modEl.textContent = fmtSigned(mod);
      const scoreInput = document.querySelector(`input[data-ability="${ability}"]`);
      if (scoreInput) scoreInput.value = state.abilities[ability].score;
    });

    // Skills (Wheel)
    Object.entries(c.skills).forEach(([key, s]) => {
      const el = document.querySelector(`[data-computed="skill:${key}"]`);
      if (el) el.textContent = fmtSigned(s.total);
    });

    // Saves
    Object.entries(SAVE_FIELD_MAP).forEach(([key, field]) => {
      const el = document.querySelector(`[data-computed="${field}"]`);
      if (el) el.value = fmtSigned(c.saves[key].total);
    });

    // Esagoni (Skills e Saves e Spellbook)
    document.querySelectorAll(".hex-seg[data-skill], .hex-seg[data-save], .hex-seg[data-spellbook-hex]").forEach(seg => {
      const skill = seg.getAttribute("data-skill");
      const saveKey = seg.getAttribute("data-save");
      const sbIdx = seg.getAttribute("data-spellbook-hex");
      const rank = Number(seg.getAttribute("data-rank") || 0);
      let currentRank = 0;

      if (skill) currentRank = state.skills[skill]?.rank || 0;
      else if (saveKey) currentRank = state[SAVE_FIELD_MAP[saveKey]]?.rank || 0;
      else if (sbIdx !== null) currentRank = state.spellbooks[sbIdx]?.rank || 0;

      seg.setAttribute("fill", rank <= currentRank ? interpolateColor(currentRank) : "transparent");
      seg.setAttribute("stroke", "#2c1810");
      seg.setAttribute("stroke-width", "0.5");
    });

    renderHP(c.hpMax);
    renderMana();
    renderDeathSaves();
    renderCards(c.mods, c.advRank);
    renderInventory();
    renderSpellbook();
  };

  const renderHP = (max) => {
    const totalMax = max + (state.hp_bonus || 0);
    // Cappa gli HP attuali al massimo totale (Max + Bonus)
    if (state.hp_actual > totalMax) {
      state.hp_actual = totalMax;
    }

    // Sincronizza input testuale se non è in focus
    const hpInput = document.querySelector('[data-field="hp_actual"]');
    if (hpInput && document.activeElement !== hpInput) {
      hpInput.value = state.hp_actual;
    }

    const actual = clampInt(state.hp_actual, 0, totalMax, 0);
    const fill = document.getElementById("hpFill");
    if (!fill) return;

    const percent = Math.max(0, Math.min(1, actual / max));
    const h = 20 * percent;
    fill.setAttribute("height", h);
    fill.setAttribute("y", 20 - h);

    const r = Math.round(200 * (1 - percent));
    const g = Math.round(200 * percent);
    fill.setAttribute("fill", `rgb(${r}, ${g}, 0)`);

    const heart = fill.closest("svg");
    if (heart) {
      heart.style.filter = state.hp_bonus > 0 ? "drop-shadow(0 0 8px rgba(80,120,255,0.7))" : `drop-shadow(0 0 ${8 * (1 - percent)}px red)`;
      heart.style.animation = percent < 0.15 ? "pulse 0.8s infinite" : "none";
    }
  };

  const renderMana = () => {
      const sb = state.spellbooks?.[0];
      if (!sb) return;

      const manaFill = document.getElementById("manaFill");
      if (manaFill) {
          const max = parseFloat(sb.mana_max) || 1;
          let cur = parseFloat(sb.mana_actual) || 0;

          // Cappa il Mana attuale al massimo
    if (cur > max) {
      cur = max;
      sb.mana_actual = max;
    }

    // Sincronizza input testuale se non è in focus
    const manaInput = document.querySelector('[data-field="spellbooks.0.mana_actual"]');
    if (manaInput && document.activeElement !== manaInput) {
      manaInput.value = cur;
    }

    const percent = Math.max(0, Math.min(1, cur / max));

          const totalHeight = 42;
          const h = totalHeight * percent;

          manaFill.setAttribute("height", h);
          manaFill.setAttribute("y", totalHeight - h);

            // Colore “magico” con leggera variazione verticale
          const topHue = 200;   // azzurro brillante
          const topSat = 100;
          const topLight = 65;

          const bottomHue = 280; // viola scuro
          const bottomSat = 90;
          const bottomLight = 25;

          const hue = bottomHue + (topHue - bottomHue) * percent;
          const sat = bottomSat + (topSat - bottomSat) * percent;
          const light = bottomLight + (topLight - bottomLight) * percent;

          // Piccolo oscillamento casuale per effetto “magico”
          const flicker = Math.random() * 5; // +/-5% light
          const color = `hsl(${hue}, ${sat}%, ${Math.min(100, light + flicker)}%)`;

          manaFill.setAttribute("fill", color);
      }
  };

  const renderDeathSaves = () => {
    document.querySelectorAll('[data-death-save^="success"]').forEach((el, i) => el.classList.toggle('filled', i < state.death_save_success));
    document.querySelectorAll('[data-death-save^="failure"]').forEach((el, i) => el.classList.toggle('filled', i < state.death_save_failure));
  };

  const renderCards = (mods, advRank) => {
    const container = document.getElementById("cards-container");
    if (!container) return;

    // Salva il focus attuale nelle card
    const activeEl = document.activeElement;
    const activeField = activeEl?.dataset.field;
    let cursorPosition = 0;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      cursorPosition = activeEl.selectionStart;
    }

    container.innerHTML = "";

    state.cards.forEach((card, i) => {
      const el = document.createElement("div");
      el.className = "card";
      const bonus = (mods[card.ability] || 0) + profBonusFromRank(card.rank) + Math.floor(advRank);

      el.innerHTML = `
        <button class="delete-card" data-index="${i}">✖</button>
        <div class="attack-header">
          <input class="attack-name" data-field="cards.${i}.name" placeholder="Nome" value="${card.name || ''}">
          <select class="attack-ability" data-field="cards.${i}.ability">
            <option value="">Stat</option>
            ${Object.keys(state.abilities).map(a => `<option value="${a}" ${card.ability === a ? 'selected' : ''}>${a.toUpperCase()}</option>`).join('')}
          </select>
          <input class="attack-hit" readonly value="${fmtSigned(bonus)}">
          <input class="attack-dmg" data-field="cards.${i}.dmg" placeholder="Danni" value="${card.dmg || ''}">
          <svg class="attack-hex" viewBox="-10 -10 20 20">
            ${[1, 2, 3, 4, 5, 6].map(r => `<path class="hex-seg" data-card-idx="${i}" data-rank="${r}" d="M0 0 L9 0 L4.5 7.79 Z" transform="rotate(${(r - 1) * 60 + 240})" fill="${r <= card.rank ? 'rgba(200,150,50,0.8)' : 'transparent'}" stroke="#333"/>`).join('')}
          </svg>
        </div>
        <textarea class="card-desc" data-field="cards.${i}.desc" placeholder="Descrizione...">${card.desc || ''}</textarea>
      `;
      container.appendChild(el);
    });

    // Ripristina il focus nelle card
    if (activeField && activeField.startsWith('cards.')) {
      const newEl = document.querySelector(`[data-field="${activeField}"]`);
      if (newEl) {
        newEl.focus();
        if (newEl.tagName === 'INPUT' || newEl.tagName === 'TEXTAREA') {
          newEl.setSelectionRange(cursorPosition, cursorPosition);
        }
      }
    }

    container.querySelectorAll(".card textarea").forEach(tx => {
      tx.style.height = 'auto';
      tx.style.height = tx.scrollHeight + 'px';
      tx.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
      });
    });

    bindDynamicFields();
  };

  const renderInventory = () => {
    const cols = [document.getElementById("inv-col-1"), document.getElementById("inv-col-2")];
    if (!cols[0]) return;

    // Salva il focus attuale
    const activeEl = document.activeElement;
    const activeDataIdx = activeEl?.dataset.invIdx;
    const activeProp = activeEl?.dataset.prop;

    cols.forEach(c => c.querySelectorAll(".inv-row").forEach(r => r.remove()));

    let totalWeight = 0;
    state.inventory.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "inv-row";
      row.innerHTML = `<input data-inv-idx="${i}" data-prop="name" value="${item.name || ''}">
                       <input type="number" data-inv-idx="${i}" data-prop="qty" value="${item.qty || 0}">
                       <input type="number" data-inv-idx="${i}" data-prop="weight" value="${item.weight || 0}">`;
      cols[i % 2].appendChild(row);
      totalWeight += (item.qty || 0) * (item.weight || 0);
    });

    // Ripristina il focus
    if (activeDataIdx !== undefined) {
      const newEl = document.querySelector(`input[data-inv-idx="${activeDataIdx}"][data-prop="${activeProp}"]`);
      if (newEl) {
        newEl.focus();
        // Sposta il cursore alla fine per i campi di testo
        if (newEl.type === "text" || !newEl.type) {
          const val = newEl.value;
          newEl.value = '';
          newEl.value = val;
        }
      }
    }

    const coinWeight = Object.values(state.coins || {}).reduce((a, b) => a + b, 0) / 50;
    const weightEl = document.querySelector(".weight-value");
    if (weightEl) weightEl.textContent = `${(totalWeight + coinWeight).toFixed(1)} lb`;
  };

  /** Spellbook Rendering */
  const renderSpellbook = () => {
    const generatorBtn = document.getElementById("generate-spellbook");
    const spellbookSheet = document.getElementById("spellbook-sheet");
    const container = document.getElementById("spellbook-cards");
    
    if (!state.spellbooks || state.spellbooks.length === 0) {
      if (spellbookSheet) spellbookSheet.style.display = "none";
      if (generatorBtn) generatorBtn.style.display = "block";
      return;
    }

    if (spellbookSheet) spellbookSheet.style.display = "block";
    if (generatorBtn) generatorBtn.style.display = "none";

    if (!container) return;

    // Salva il focus attuale
    const activeEl = document.activeElement;
    const activeSpellIdx = activeEl?.dataset.spellIdx;
    const activeProp = activeEl?.dataset.prop;
    let cursorPosition = 0;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      cursorPosition = activeEl.selectionStart;
    }

    const sb = state.spellbooks[0];
    const preparedCount = parseInt(sb.prepared) || 0;

    // Sincronizza slot
    if (sb.spells.length < preparedCount) {
      while (sb.spells.length < preparedCount) {
        sb.spells.push({ 
          name: "", 
          level: "T", // Default Trucchetti
          school: "",
          time: "", 
          comp: "", 
          range: "", 
          dur: "", 
          class: "", 
          desc: "", 
          nextLvl: "" 
        });
      }
    } else if (sb.spells.length > preparedCount) {
      sb.spells = sb.spells.slice(0, preparedCount);
    }

    // Raggruppa per livello
    const grouped = {};
    sb.spells.forEach((s, i) => {
      const lvl = s.level || "T";
      if (!grouped[lvl]) grouped[lvl] = [];
      grouped[lvl].push({ ...s, originalIndex: i });
    });

    // Ordine livelli: T, 1, 2, ..., 10
    const levelOrder = ["T", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    
    container.innerHTML = "";

    levelOrder.forEach(lvl => {
      if (!grouped[lvl]) return;

      const section = document.createElement("div");
      section.className = "spell-level-section";
      section.innerHTML = `<h3 class="spell-level-title">${lvl === "T" ? "Trucchetti" : "Livello " + lvl}</h3>`;
      
      const cardsGrid = document.createElement("div");
      cardsGrid.className = "spell-cards-grid";

      grouped[lvl].forEach(spell => {
        const card = document.createElement("div");
        card.className = "spell-card";
        card.innerHTML = `
          <div class="spell-header">
            <input class="spell-name" placeholder="Nome Incantesimo" value="${spell.name || ""}" data-spell-idx="${spell.originalIndex}" data-prop="name">
            <button class="cast-spell-btn" data-level="${lvl}" title="Lancia incantesimo">✨</button>
            <select class="spell-level-select" data-spell-idx="${spell.originalIndex}" data-prop="level">
              ${levelOrder.map(l => `<option value="${l}" ${spell.level === l ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="spell-skeleton">
            <div class="skel-row"><span>Scuola:</span><input data-spell-idx="${spell.originalIndex}" data-prop="school" value="${spell.school || ""}"></div>
            <div class="skel-row"><span>Tempo di lancio:</span><input data-spell-idx="${spell.originalIndex}" data-prop="time" value="${spell.time || ""}"></div>
            <div class="skel-row"><span>Componenti:</span><input data-spell-idx="${spell.originalIndex}" data-prop="comp" value="${spell.comp || ""}"></div>
            <div class="skel-row"><span>Portata:</span><input data-spell-idx="${spell.originalIndex}" data-prop="range" value="${spell.range || ""}"></div>
            <div class="skel-row"><span>Durata:</span><input data-spell-idx="${spell.originalIndex}" data-prop="dur" value="${spell.dur || ""}"></div>
            <div class="skel-row"><span>Classi:</span><input data-spell-idx="${spell.originalIndex}" data-prop="class" value="${spell.class || ""}"></div>
          </div>
          <textarea class="spell-desc" placeholder="Descrizione..." data-spell-idx="${spell.originalIndex}" data-prop="desc">${spell.desc || ""}</textarea>
          <textarea class="spell-next" placeholder="Ai livelli successivi..." data-spell-idx="${spell.originalIndex}" data-prop="nextLvl">${spell.nextLvl || ""}</textarea>
        `;
        cardsGrid.appendChild(card);
      });

      section.appendChild(cardsGrid);
      container.appendChild(section);
    });

    // Ripristina il focus
    if (activeSpellIdx !== undefined) {
      const newEl = container.querySelector(`[data-spell-idx="${activeSpellIdx}"][data-prop="${activeProp}"]`);
      if (newEl) {
        newEl.focus();
        if (newEl.tagName === 'INPUT' || newEl.tagName === 'TEXTAREA') {
          newEl.setSelectionRange(cursorPosition, cursorPosition);
        }
      }
    }

    // Auto-resize textareas
    container.querySelectorAll('textarea').forEach(tx => {
      tx.style.height = 'auto';
      tx.style.height = tx.scrollHeight + 'px';
      tx.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
      });
    });
  };

  // --- EVENT BINDING ---
  const bindFields = () => {
    document.querySelectorAll("[data-field]").forEach(el => {
      const path = el.getAttribute("data-field");
      el.addEventListener("input", () => {
        const val = el.type === "checkbox" ? el.checked : el.type === "number" ? parseFloat(el.value) || 0 : el.value;
        setByPath(state, path, val);
        save();
        // Forza il render per campi che influenzano calcoli globali o visualizzazioni dinamiche
        if (path === "spellbooks.0.ability" || 
            path.includes("mana") || 
            path === "spellbooks.0.maxLvl" || 
            path === "level" || 
            path.includes("abilities")) {
          render();
        }
        // Non triggerare il render globale per card, seconda pagina o spellbook durante l'input di testo
        else if (!el.closest(".card") && !el.closest(".second-page") && !el.closest("#spellbook-sheet")) {
          debouncedRender();
        }
      });
    });

    // Inizializza i valori negli input dal caricamento
    document.querySelectorAll("[data-field]").forEach(el => {
      const val = getByPath(state, el.getAttribute("data-field"));
      if (el.type === "checkbox") el.checked = !!val;
      else el.value = val ?? "";
    });
  };

  const bindDynamicFields = () => {
    document.querySelectorAll(".card [data-field]").forEach(el => {
      el.addEventListener("input", () => {
        const path = el.getAttribute("data-field");
        setByPath(state, path, el.value);
        save();
        render(); // Render immediato per le card per aggiornare bonus
      });
    });
  };

  const bindEvents = () => {
    document.addEventListener("click", (e) => {
      const t = e.target;

      // Reset HP Full
      if (t.matches(".hp-reset")) {
        const maxHP = parseFloat(state.hp_max) || 0;
        state.hp_actual = maxHP;
        save(); render();
      }

      // Reset Mana Full
      if (t.matches(".mana-reset")) {
        if (state.spellbooks && state.spellbooks[0]) {
          const maxMana = parseFloat(state.spellbooks[0].mana_max) || 0;
          state.spellbooks[0].mana_actual = maxMana;
          save(); render();
        }
      }

      if (t.matches(".cast-spell-btn")) {
        const skill = t.getAttribute("data-skill");
        const saveKey = t.getAttribute("data-save");
        const cardIdx = t.getAttribute("data-card-idx");
        const sbHexIdx = t.getAttribute("data-spellbook-hex");
        const rank = Number(t.getAttribute("data-rank"));

        if (skill) state.skills[skill].rank = state.skills[skill].rank === rank ? rank - 1 : rank;
        else if (saveKey) {
          const field = SAVE_FIELD_MAP[saveKey];
          state[field].rank = state[field].rank === rank ? rank - 1 : rank;
        } else if (cardIdx) {
          state.cards[cardIdx].rank = state.cards[cardIdx].rank === rank ? rank - 1 : rank;
        } else if (sbHexIdx !== null) {
          const sb = state.spellbooks[sbHexIdx];
          if (sb) sb.rank = sb.rank === rank ? rank - 1 : rank;
        }
        save(); render();
      }

      if (t.matches(".delete-card")) {
        state.cards.splice(t.dataset.index, 1);
        save(); render();
      }

      if (t.matches(".death-dot")) {
        const type = t.dataset.deathSave.startsWith("success") ? "success" : "failure";
        const idx = parseInt(t.dataset.deathSave.split("_")[1]);
        state[`death_save_${type}`] = state[`death_save_${type}`] === idx ? idx - 1 : idx;
        save(); render();
      }

      if (t.matches("#generate-spellbook")) {
        state.spellbooks = [{
          class: "",
          prepared: 0,
          maxLvl: 0,
          bonus: 0,
          dc: 0,
          mana_actual: 0,
          mana_max: 0,
          regen: [0, 0, 0],
          spells: []
        }];
        save();
        render();
      }

      if (t.matches("#remove-spellbook") || t.closest("#remove-spellbook")) {
        state.spellbooks = [];
        save();
        render();
      }

      if (t.matches(".cast-spell-btn")) {
        const lvl = t.dataset.level;
        const costs = { "T": 0, "1": 2, "2": 3, "3": 5, "4": 6, "5": 8, "6": 10, "7": 11, "8": 13, "9": 15, "10": 17 };
        const cost = costs[lvl] || 0;

        if (state.spellbooks && state.spellbooks[0]) {
          const sb = state.spellbooks[0];
          sb.mana_actual = Math.max(0, (parseFloat(sb.mana_actual) || 0) - cost);
          save();
          render();
        }
      }
    });

    document.getElementById("add-card")?.addEventListener("click", () => {
      state.cards.push({ name: "", ability: "", hit: "", dmg: "", desc: "", rank: 0 });
      save(); render();
    });

    document.getElementById("add-item")?.addEventListener("click", () => {
      state.inventory.push({ name: "", qty: 1, weight: 0 });
      save(); render();
    });

    document.getElementById("remove-item")?.addEventListener("click", () => {
      if (state.inventory.length > 0) {
        state.inventory.pop();
        save(); render();
      }
    });

    document.querySelectorAll('input[data-ability]').forEach(el => {
      el.addEventListener('input', () => {
        state.abilities[el.dataset.ability].score = parseInt(el.value) || 10;
        save(); debouncedRender();
      });
    });

    document.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.invIdx) {
        const { invIdx, prop } = t.dataset;
        state.inventory[invIdx][prop] = prop === "name" ? t.value : parseFloat(t.value) || 0;
        save(); renderInventory();
      }

      if (t.dataset.spellIdx) {
        const { spellIdx, prop } = t.dataset;
        if (state.spellbooks && state.spellbooks[0]) {
          state.spellbooks[0].spells[spellIdx][prop] = t.value;
          save();
          // Se cambia il livello, dobbiamo ri-renderizzare per spostare la card
          if (prop === "level") renderSpellbook();
        }
      }
    });

    // Aggiunto listener per 'change' sui select delle spell
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.spellIdx && t.tagName === "SELECT") {
        const { spellIdx, prop } = t.dataset;
        if (state.spellbooks && state.spellbooks[0]) {
          state.spellbooks[0].spells[spellIdx][prop] = t.value;
          save();
          renderSpellbook();
        }
      }
    });

    // --- EXPORT/IMPORT JSON ---
    document.getElementById("export-json")?.addEventListener("click", () => {
      const dataStr = JSON.stringify(state, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${state.name || "Personaggio"}_Historia.json`;
      link.click();
    });

    document.getElementById("import-json")?.addEventListener("click", () => {
      document.getElementById("import-file").click();
    });

    document.getElementById("import-file")?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (confirm("Caricare i dati? Questo sovrascriverà la scheda attuale.")) {
            state = { ...state, ...imported };
            save();
            render();
            alert("Dati caricati correttamente!");
          }
        } catch (err) {
          alert("Errore nel caricamento del file JSON.");
        }
      };
      reader.readAsText(file);
    });

    document.getElementById("export-pdf")?.addEventListener("click", async () => {
      const btn = document.getElementById("export-pdf");
      const btnSave = document.getElementById("export-json");
      const btnLoad = document.getElementById("import-json");
      
      if (btn) btn.style.display = "none"; 
      if (btnSave) btnSave.style.display = "none";
      if (btnLoad) btnLoad.style.display = "none";

      try {
        const { PDFDocument, rgb } = PDFLib;
        const pdfDoc = await PDFDocument.create();

        const selectors = ['.sheet:not(.second-page)', '.sheet.second-page'];
        const spellbookSheet = document.getElementById('spellbook-sheet');
        if (spellbookSheet && spellbookSheet.style.display !== 'none') {
            selectors.push('#spellbook-sheet');
        }

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (!el) continue;

          // Forza dimensioni fisse per cattura stabile
          const originalStyle = el.style.cssText;
          el.style.width = "1100px";
          el.style.minHeight = "1120px";
          el.style.margin = "0";
          el.style.position = "fixed";
          el.style.left = "0";
          el.style.top = "0";
          el.style.zIndex = "9999";

          const canvas = await html2canvas(el, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#f4ecd8",
            scrollX: 0,
            scrollY: 0,
            windowWidth: 1100,
            onclone: (clonedDoc) => {
              const style = clonedDoc.createElement('style');
              style.innerHTML = `
                * { transition: none !important; animation: none !important; }
                .blessing-box, .spell-card, .card { height: auto !important; transform: none !important; box-shadow: none !important; }
                input, textarea, select { border: none !important; background: transparent !important; color: black !important; }
                svg { filter: none !important; }
                button { display: none !important; }
              `;
              clonedDoc.head.appendChild(style);
            }
          });

          el.style.cssText = originalStyle;

          const imgData = canvas.toDataURL('image/jpeg', 0.85);
          const pdfPage = pdfDoc.addPage([595.28, 841.89]);
          const { width, height } = pdfPage.getSize();

          const img = await pdfDoc.embedJpg(imgData);
          pdfPage.drawImage(img, { x: 0, y: 0, width, height });

          // Aggiunta campi editabili semplificata per evitare conflitti
          const form = pdfDoc.getForm();
          const inputs = el.querySelectorAll('input, textarea');
          const rect = el.getBoundingClientRect();

          inputs.forEach((input, idx) => {
            if (input.type === 'hidden' || input.id.includes('export')) return;
            const iRect = input.getBoundingClientRect();
            
            const pX = ((iRect.left - rect.left) / rect.width) * width;
            const pY = height - (((iRect.top - rect.top) + iRect.height) / rect.height) * height;
            const pW = (iRect.width / rect.width) * width;
            const pH = (iRect.height / rect.height) * height;

            try {
              const field = form.createTextField(`f_${selector.replace(/[.#]/g,'')}_${idx}`);
              field.setText(input.value || "");
              field.addToPage(pdfPage, { x: pX, y: pY, width: pW, height: pH, borderWidth: 0, backgroundColor: rgb(1,1,1,0) });
              if (input.tagName === 'TEXTAREA') field.enableMultiline();
            } catch (e) {}
          });
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${state.name || 'Scheda_Historia'}.pdf`;
        link.click();

      } catch (err) {
        console.error("PDF Export Error:", err);
        alert("Errore nell'esportazione PDF. Usa 'Salva' (JSON) per condividere i dati.");
      } finally {
        if (btn) btn.style.display = "block";
        if (btnSave) btnSave.style.display = "block";
        if (btnLoad) btnLoad.style.display = "block";
      }
    });

  };

  // --- INIT ---
  load();
  // Se è stato passato uno stato iniziale tramite esportazione HTML, usalo
  if (typeof initialSharedState !== 'undefined') {
    state = { ...state, ...initialSharedState };
    save();
  }
  bindFields();
  bindEvents();
  render();
})();