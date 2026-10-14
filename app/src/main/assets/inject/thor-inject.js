// Showdown Thor — runs inside play.pokemonshowdown.com (injected after every page load).
// Reports what the official client is showing (its battle controls, both sides, the field) to the bottom panel, and
// performs the panel's choices by clicking the page's own buttons. It never sends battle commands itself, so every
// choice goes through the official client's normal checks and timing.
(function () {
	'use strict';
	if (window.ThorInject) { window.ThorInject.resync(); return; }

	// Outside battles the client's own layout for this screen (its natural ~834 CSS px: two columns on Home, news
	// above the menu, chat rooms beside it). In a battle 960, so the client's layout drops the side chat room and
	// the battle scene gets the room it needs.
	var BATTLE_WIDTH = 960;
	var panelShown = true;
	// Full battle (default): the scene scaled to the whole top screen, log and chat on the bottom panel instead
	var bigBattle = true;
	try { bigBattle = localStorage.getItem('thorBigBattle') !== '0'; } catch (e) {}

	function setViewport() {
		var m = document.getElementById('viewport') || document.querySelector('meta[name=viewport]');
		// Fixed scale (screen width / layout width): Android's browser engine otherwise zooms in when a text box gets
		// focus (e.g. signing in) or on a double tap, and the zoom sticks. ThorScreenWidth comes from the app.
		var screenWidth = window.ThorScreenWidth || Math.max(screen.width, screen.height);
		var width = panelShown && battleRoom() && window.app && app.curRoom === battleRoom() ? BATTLE_WIDTH : Math.round(screenWidth);
		var scale = (screenWidth / width).toFixed(4);
		var want = 'width=' + width + ', initial-scale=' + scale + ', minimum-scale=' + scale + ', maximum-scale=' + scale +
			', user-scalable=no';
		if (m && m.getAttribute('content') !== want) m.setAttribute('content', want);
		document.documentElement.classList.toggle('thor-panel', panelShown);
		var room = battleRoom();
		var big = panelShown && bigBattle && room && window.app && app.curRoom === room;
		document.documentElement.classList.toggle('thor-big', !!big);
		if (big && room.el) {
			var w = room.el.clientWidth, h = room.el.clientHeight, scale = Math.min(h / 360, w / 640);
			room.el.style.setProperty('--thor-scale', scale.toFixed(4));
			room.el.style.setProperty('--thor-left', Math.max(0, (w - 640 * scale) / 2).toFixed(1) + 'px');
		}
	}

	// With the bottom panel up, the battle controls move off-screen (not display:none: the panel reads which of the
	// client's button sets is visible, e.g. Z-moves or Max moves).
	(function addStyle() {
		var st = document.createElement('style');
		st.id = 'thor-style';
		st.textContent = '.thor-panel .battle-controls { position: absolute !important; left: -10000px !important; }\n' +
			'.thor-big .ps-room .battle { transform-origin: 0 0; transform: scale(var(--thor-scale, 1)) !important; left: var(--thor-left, 0) !important; }\n' +
			'.thor-big .ps-room .battle-log, .thor-big .ps-room .battle-log-add, .thor-big .ps-room .battle-userlist { display: none !important; }\n' +
			// Ad slots, only with "Hide ads" on (the app then blocks the ad network; these would stay as empty boxes)
			(window.ThorHideAds ? '#mainmenu-mobile, #roomlist1-desktop, #roomlist2-desktop { display: none !important; }' : '');
		(document.head || document.documentElement).appendChild(st);
	})();

	// Shown by the client, ignoring its compact two-step menus (Attack / Switch first) that narrow layouts use: the
	// panel offers those choices directly. Still skips the button sets it swaps out (Z-moves, Max moves).
	function visible(el, root) {
		for (var p = el; p && p !== root; p = p.parentElement) {
			if (p.classList && (p.classList.contains('movemenu') || p.classList.contains('switchmenu'))) continue;
			var cs = getComputedStyle(p);
			if (cs.display === 'none' || cs.visibility === 'hidden') return false;
		}
		return true;
	}
	function httpsUrls(style) { return (style || '').replace(/url\((['"]?)\/\//g, 'url($1https://'); }

	function text(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }

	// Descriptions live in the client's text store, not on the move / item / ability objects
	function shortDesc(thing) {
		try { return (Dex.text.get(thing) || {}).shortDesc || ''; } catch (e) { return ''; }
	}

	function battleRoom() {
		var a = window.app;
		if (!a) return null;
		if (a.curRoom && a.curRoom.battle) return a.curRoom;
		if (a.curSideRoom && a.curSideRoom.battle) return a.curSideRoom;
		return null;
	}

	function iconStyle(p) {
		try { return window.Dex ? httpsUrls(Dex.getPokemonIcon(p)) : ''; } catch (e) { return ''; }
	}

	// 0 immune, 0.25 / 0.5 / 1 / 2 / 4
	function effectiveness(attackType, defTypes) {
		var chart = window.BattleTypeChart;
		if (!chart || !attackType || !defTypes || !defTypes.length) return null;
		var mult = 1;
		for (var i = 0; i < defTypes.length; i++) {
			var row = chart[String(defTypes[i]).toLowerCase()];
			if (!row) continue;
			var code = row.damageTaken[attackType];
			if (code === 1) mult *= 2;
			else if (code === 2) mult *= 0.5;
			else if (code === 3) return 0;
		}
		return mult;
	}

	function typesOf(p) {
		try { return p.getTypeList(); } catch (e) {}
		try { return Dex.species.get(p.speciesForme).types.slice(); } catch (e) { return []; }
	}

	function boosts(p) {
		var out = {};
		var b = p.boosts || {};
		for (var k in b) if (b[k]) out[k] = b[k];
		return out;
	}

	// Volatile ids as words: a move / ability / item name when there is one ("slowstart" → "Slow Start")
	var VOLATILE_NAMES = { itemremoved: 'Item removed', typechange: 'Type changed', typeadd: 'Type added', mustrecharge: 'Must recharge',
		confusion: 'Confused', lockedmove: 'Locked in', choicelock: 'Choice-locked', protosynthesis: 'Protosynthesis', quarkdrive: 'Quark Drive',
		flashfire: 'Flash Fire', dynamax: 'Dynamax', transform: 'Transformed', formechange: 'Forme change', stockpile1: 'Stockpile 1',
		stockpile2: 'Stockpile 2', stockpile3: 'Stockpile 3', perish1: 'Perish 1', perish2: 'Perish 2', perish3: 'Perish 3' };
	function volatileName(id) {
		if (VOLATILE_NAMES[id]) return VOLATILE_NAMES[id];
		try {
			var x = Dex.moves.get(id); if (x && x.exists) return x.name;
			x = Dex.abilities.get(id); if (x && x.exists) return x.name;
			x = Dex.items.get(id); if (x && x.exists) return x.name;
		} catch (e) {}
		return id;
	}

	function pokemonInfo(p, exact) {
		if (!p) return null;
		var species = p.speciesForme || p.species || p.name;
		var maxhp = p.maxhp || 100;
		return {
			name: p.name, species: species, level: p.level,
			hp: p.hp, maxhp: maxhp, pct: maxhp ? Math.round(100 * p.hp / maxhp) : 0, exactHp: !!exact,
			status: p.status || '', fainted: !!p.fainted || p.hp === 0,
			types: typesOf(p), tera: p.terastallized || '', teraType: p.teraType || '',
			boosts: boosts(p), volatiles: Object.keys(p.volatiles || {}).map(volatileName),
			item: p.item || '', ability: p.ability || p.baseAbility || '',
			// lost its item (Knock Off, Trick, a used berry or gem): the coach stops guessing one
			itemGone: !p.item && !!(p.prevItem || (p.volatiles && p.volatiles.itemremoved)),
			moves: (p.moveTrack || []).map(function (m) { return m[0]; }),
			icon: iconStyle(p)
		};
	}

	function sideInfo(side, request) {
		if (!side) return null;
		var mine = request && request.side && request.side.pokemon;
		var active = (side.active || []).map(function (p) { return pokemonInfo(p, !!mine); });
		if (mine) {
			// Fill in what only our own side knows: item, ability, stats, tera type
			active.forEach(function (a, i) {
				var sp = mine.filter(function (x) { return x.active; })[i];
				if (!a || !sp) return;
				a.item = sp.item ? (Dex.items.get(sp.item).name || sp.item) : a.item;
				a.ability = sp.ability ? (Dex.abilities.get(sp.ability).name || sp.ability) : a.ability;
				a.stats = sp.stats || null;
				a.teraType = sp.teraType || a.teraType;
			});
		}
		var team = (side.pokemon || []).map(function (p) {
			return { name: p.name, species: p.speciesForme, pct: p.maxhp ? Math.round(100 * p.hp / p.maxhp) : 0,
				status: p.status || '', fainted: !!p.fainted || p.hp === 0, icon: iconStyle(p) };
		});
		// Side conditions with their layers (Spikes 1-3), for the coach's damage and speed checks
		var sc = {};
		Object.keys(side.sideConditions || {}).forEach(function (k) { var c = side.sideConditions[k]; sc[k] = (c && c[1]) || 1; });
		return { name: side.name, active: active, team: team, total: side.totalPokemon || team.length,
			conditions: Object.keys(side.sideConditions || {}), sc: sc };
	}

	// Your whole team from the request (what the official client shows in its switch tooltips)
	function myTeam(request, foeTypes) {
		var mine = request && request.side && request.side.pokemon;
		if (!mine || !window.Dex) return null;
		return mine.map(function (sp, i) {
			var details = String(sp.details || '').split(', ');
			var species = details[0];
			var level = (details.filter(function (d) { return /^L\d+$/.test(d); })[0] || 'L100').slice(1);
			var cond = String(sp.condition || '');
			var hp = cond.split(' ')[0].split('/');
			var fainted = / fnt$/.test(cond) || cond === '0 fnt';
			var ability = sp.ability || sp.baseAbility;
			return {
				index: i, name: String(sp.ident || '').replace(/^p\d+[a-z]?: /, ''), species: species, level: level,
				hp: parseInt(hp[0], 10) || 0, maxhp: parseInt(hp[1], 10) || parseInt(hp[0], 10) || 0,
				status: fainted ? 'fnt' : (cond.split(' ')[1] || ''), fainted: fainted, active: !!sp.active,
				item: sp.item ? Dex.items.get(sp.item).name : '', ability: ability ? Dex.abilities.get(ability).name : '',
				teraType: sp.teraType || '', stats: sp.stats || null,
				types: Dex.species.get(species).types.slice(), icon: httpsUrls(Dex.getPokemonIcon(species)),
				moves: (sp.moves || []).map(function (id) {
					var m = Dex.moves.get(id);
					return { name: m.name, type: m.type, cat: m.category, bp: m.basePower || 0,
						acc: m.accuracy === true ? 0 : (m.accuracy || 0), desc: shortDesc(m),
						eff: m.category === 'Status' ? null : effectiveness(m.type, foeTypes) };
				})
			};
		});
	}

	function buttonInfo(el) {
		return { name: el.getAttribute('name'), value: el.value || '', label: text(el),
			disabled: el.disabled || el.classList.contains('disabled') };
	}

	function controls(room, foeTypesList, team) {
	var foeTypes = foeTypesList && foeTypesList[0];
		var c = room.$controls && room.$controls[0];
		var out = { moves: [], switches: [], preview: [], targets: [], gimmicks: [], buttons: [], whatdo: '' };
		if (!c) return out;
		var w = c.querySelector('.whatdo');
		if (w) { w = w.cloneNode(true); w.querySelectorAll('button, small').forEach(function (x) { x.remove(); }); }
		out.whatdo = text(w);
		function picon(el) { var i = el.querySelector('.picon'); return i ? httpsUrls(i.getAttribute('style')) : ''; }
		c.querySelectorAll('button[name=chooseMove]').forEach(function (el) {
			if (!visible(el, c)) return;
			var name = el.getAttribute('data-move');
			var m = window.Dex ? Dex.moves.get(name) : {};
			var type = (el.className.match(/type-(\w+)/) || [])[1] || m.type;
			out.moves.push({ value: el.value, name: name, type: type, pp: text(el.querySelector('.pp')),
				disabled: el.disabled || el.classList.contains('disabled'),
				cat: m.category || '', bp: m.basePower || 0, acc: m.accuracy === true ? 0 : (m.accuracy || 0),
				desc: shortDesc(m), target: el.getAttribute('data-target') || '',
				eff: m.category === 'Status' ? null : effectiveness(type, foeTypes),
				// doubles: against each foe on the field
				effs: m.category === 'Status' || !foeTypesList || foeTypesList.length < 2 ? null :
					foeTypesList.map(function (t) { return t ? effectiveness(type, t) : null; }) });
		});
		c.querySelectorAll('button[name=chooseSwitch], button[name=chooseDisabled]').forEach(function (el) {
			if (!visible(el, c)) return;
			var bar = el.querySelector('.hpbar span');
			var why = el.getAttribute('name') === 'chooseDisabled' ? (el.value.split(',')[1] || 'disabled') : '';
			var nick = why ? el.value.split(',')[0] : '';
			var idx = why ? (team || []).map(function (t) { return t.name; }).indexOf(nick) : parseInt(el.value, 10);
			out.switches.push({ value: el.value, idx: idx, name: text(el), disabled: !!why, why: why,
				pct: bar ? parseInt(bar.style.width, 10) || 0 : null,
				icon: picon(el) });
		});
		c.querySelectorAll('button[name=chooseTeamPreview]').forEach(function (el) {
			if (!visible(el, c)) return;
			out.preview.push({ value: el.value, name: text(el), icon: picon(el) });
		});
		c.querySelectorAll('button[name=chooseMoveTarget]').forEach(function (el) {
			if (!visible(el, c)) return;
			out.targets.push({ value: el.value, name: text(el), disabled: el.disabled, icon: picon(el) });
		});
		c.querySelectorAll('input[type=checkbox]').forEach(function (el) {
			if (!visible(el, c)) return;
			out.gimmicks.push({ name: el.name, checked: el.checked, label: text(el.parentNode) });
		});
		['skipTurn', 'goToEnd', 'undoChoice', 'clearChoice', 'selectMove', 'selectSwitch', 'chooseShift', 'openTimer',
			'closeAndRematch', 'saveReplay', 'instantReplay', 'leaveRoom', 'closeroom'].forEach(function (name) {
			c.querySelectorAll('button[name=' + name + ']').forEach(function (el) { if (visible(el, c)) out.buttons.push(buttonInfo(el)); });
		});
		return out;
	}

	// The last lines of the battle log (moves, damage, chat), for the bottom panel in full-battle mode
	function recentLog(room, n) {
		var inner = room.el && room.el.querySelector('.battle-log .inner');
		if (!inner) return [];
		var lines = [];
		for (var el = inner.lastElementChild; el && lines.length < n; el = el.previousElementSibling) {
			var t = text(el);
			if (t) lines.unshift({ t: t, chat: el.classList.contains('chat'), turn: el.tagName === 'H2' });
		}
		return lines;
	}


	// ── Teambuilder ─────────────────────────────────────────────────────────────────
	// The panel's own keyboard types into the selected Teambuilder box (Android's keyboard would cover most of the
	// top screen), and its result cards pick from the Teambuilder's own search results.
	var tbKeyboard = true;
	try { tbKeyboard = localStorage.getItem('thorTbKeyboard') !== '0'; } catch (e) {}

	function tbRoom() {
		var a = window.app;
		return a && a.curRoom && a.curRoom.id === 'teambuilder' && a.curRoom.el ? a.curRoom : null;
	}

	// inputmode=none keeps Android's keyboard away while the panel keyboard is on
	function syncTbInputs(room) {
		var off = tbKeyboard && panelShown;
		room.el.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea').forEach(function (i) {
			if (off) { if (i.getAttribute('inputmode') !== 'none') i.setAttribute('inputmode', 'none'); }
			else if (i.getAttribute('inputmode') === 'none') i.removeAttribute('inputmode');
		});
	}

	function tbActiveInput(room) {
		var el = document.activeElement;
		if (el && room.el.contains(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'checkbox') return el;
		return room.curChartName ? room.el.querySelector('input[name=' + room.curChartName + ']') : null;
	}

	var NATURES = window.BattleNatures || {};
	function calcStats(set, species, gen) {
		var bs = species.baseStats || {};
		var level = set.level || 100;
		var nat = NATURES[set.nature] || {};
		var out = {};
		['hp', 'atk', 'def', 'spa', 'spd', 'spe'].forEach(function (k) {
			var ev = set.evs && set.evs[k] !== undefined ? set.evs[k] : (gen <= 2 ? 252 : 0);
			var iv = set.ivs && set.ivs[k] !== undefined ? set.ivs[k] : 31;
			var core = Math.floor((2 * bs[k] + iv + Math.floor(ev / 4)) * level / 100);
			if (k === 'hp') out.hp = bs.hp === 1 ? 1 : core + level + 10;
			else out[k] = Math.floor((core + 5) * (nat.plus === k ? 1.1 : nat.minus === k ? 0.9 : 1));
		});
		return out;
	}

	function setSummary(s, i, dex, gen) {
		var sp = dex.species.get(s.species || '');
		var moves = (s.moves || []).filter(Boolean).map(function (m) {
			var mv = dex.moves.get(m);
			return { name: mv.name || m, type: mv.type, cat: mv.category, bp: mv.basePower || 0 };
		});
		return {
			i: i, name: s.name || '', species: sp.name || s.species || '', item: s.item || '', ability: s.ability || '',
			nature: s.nature || '', level: s.level || 100, tera: s.teraType || '', types: (sp.types || []).slice(),
			evs: s.evs || {}, ivs: s.ivs || {}, moves: moves, icon: s.species ? httpsUrls(Dex.getPokemonIcon(s.species)) : '',
			bs: sp.baseStats || null, stats: sp.exists !== false && sp.baseStats ? calcStats(s, sp, gen) : null
		};
	}


	// Team overview: weaknesses per attacking type (abilities that grant immunities count), speed order, and the
	// types no attacking move on the team hits super-effectively
	var ABILITY_IMMUNE = { Levitate: 'Ground', 'Earth Eater': 'Ground', 'Volt Absorb': 'Electric', 'Lightning Rod': 'Electric',
		'Motor Drive': 'Electric', 'Water Absorb': 'Water', 'Storm Drain': 'Water', 'Dry Skin': 'Water', 'Flash Fire': 'Fire',
		'Well-Baked Body': 'Fire', 'Sap Sipper': 'Grass' };
	function teamOverview(sums) {
		var chart = window.BattleTypeChart || {};
		var types = Object.keys(chart).filter(function (t) { return t !== 'stellar'; }).map(function (t) { return t.charAt(0).toUpperCase() + t.slice(1); });
		var mons = sums.filter(function (x) { return x.species && x.types.length; });
		var weak = types.map(function (atk) {
			var w = 0, r = 0, im = 0;
			mons.forEach(function (m) {
				var e = ABILITY_IMMUNE[m.ability] === atk ? 0 : effectiveness(atk, m.types);
				if (e === 0) im++; else if (e > 1) w++; else if (e < 1) r++;
			});
			return { type: atk, weak: w, resist: r, immune: im };
		});
		var speed = mons.filter(function (m) { return m.stats; }).map(function (m) {
			return { name: m.name || m.species, icon: m.icon, spe: m.stats.spe, base: m.bs ? m.bs.spe : 0 };
		}).sort(function (a, b) { return b.spe - a.spe; });
		var attackTypes = {};
		mons.forEach(function (m) { m.moves.forEach(function (mv) { if (mv.cat !== 'Status' && mv.bp) attackTypes[mv.type] = 1; }); });
		var noCover = types.filter(function (def) {
			return !Object.keys(attackTypes).some(function (atk) { return effectiveness(atk, [def]) > 1; });
		});
		return { weak: weak, speed: speed, noCover: Object.keys(attackTypes).length ? noCover : null };
	}

	function tbResults(room, dex) {
		var rs = (room.search && room.search.resultSet) || [];
		var out = [], n = 0;
		for (var i = 0; i < rs.length && n < 60; i++) {
			var r = rs[i], k = r[0], id = r[1];
			if (k === 'header') { out.push({ h: String(id) }); continue; }
			if (k === 'pokemon') {
				var sp = dex.species.get(id);
				if (!sp.exists) continue;
				out.push({ k: k, entry: 'pokemon|' + sp.name, name: sp.name, types: sp.types.slice(), bs: sp.baseStats,
					abil: Object.keys(sp.abilities || {}).map(function (x) { return sp.abilities[x]; }), tier: sp.tier || '',
					icon: httpsUrls(Dex.getPokemonIcon(sp.name)) });
			} else if (k === 'move') {
				var m = dex.moves.get(id);
				if (!m.exists) continue;
				out.push({ k: k, entry: 'move|' + m.name, name: m.name, type: m.type, cat: m.category, bp: m.basePower || 0,
					acc: m.accuracy === true ? 0 : m.accuracy, pp: m.pp, desc: shortDesc(m) });
			} else if (k === 'item') {
				var it = dex.items.get(id);
				if (!it.exists) continue;
				out.push({ k: k, entry: 'item|' + it.name, name: it.name, desc: shortDesc(it),
					icon: httpsUrls(Dex.getItemIcon(it)) });
			} else if (k === 'ability') {
				var ab = dex.abilities.get(id);
				if (!ab.exists) continue;
				out.push({ k: k, entry: 'ability|' + ab.name, name: ab.name, desc: shortDesc(ab) });
			} else continue;
			n++;
		}
		return out;
	}

	// While the bottom screen has the touch focus, the top page's focus events are held back, so the Teambuilder's
	// own focus handler (which picks the search type) doesn't run: call it for whichever box is now selected.
	var lastTbActive = null;
	function syncTbFocus(room, el) {
		if (!el) {
			// Only when the selected box changed: Stats / Details are chosen without one, and mustn't be undone
			el = document.activeElement;
			if (el === lastTbActive) return;
		}
		lastTbActive = el;
		if (el && room.el.contains(el) && el.classList && el.classList.contains('chartinput') && room.curChartName !== el.name) {
			try { room.chartFocus({ currentTarget: el }); } catch (e) {}
		}
	}

	function tbInfo(room, user) {
		syncTbInputs(room);
		syncTbFocus(room);
		var team = room.curTeam, set = room.curSet;
		var out = { mode: 'teambuilder', user: user, view: !team ? 'list' : set ? 'set' : 'team', kbd: tbKeyboard };
		if (!team) {
			out.teams = (window.Storage && Storage.teams || []).slice(0, 80).map(function (t, i) {
				var sets = [];
				try { sets = Storage.fastUnpackTeam(t.team) || []; } catch (e) {}
				return { i: i, name: t.name, format: t.format, icons: sets.map(function (x) { return httpsUrls(Dex.getPokemonIcon(x.species)); }) };
			});
			return out;
		}
		var dex = team.dex || Dex, gen = team.gen || 9;
		out.team = { name: team.name, format: team.format, gen: gen,
			sets: (room.curSetList || []).map(function (x, i) { return setSummary(x, i, dex, gen); }) };
		out.team.overview = teamOverview(out.team.sets);
		out.natures = Object.keys(NATURES).map(function (n) { return { name: n, plus: NATURES[n].plus || '', minus: NATURES[n].minus || '' }; });
		out.evCap = /champions/.test(team.format || '') ? 32 : 252;
		if (set) {
			var inp = room.curChartName ? room.el.querySelector('input[name=' + room.curChartName + ']') : null;
			out.set = setSummary(set, room.curSetLoc, dex, gen);
			out.field = room.curChartName || '';
			out.chart = room.curChartType || '';
			out.query = inp ? inp.value : '';
			out.results = room.curChartType in { pokemon: 1, item: 1, ability: 1, move: 1 } ? tbResults(room, dex) : [];
		}
		return out;
	}

	function tbAct(room, act) {
		var inp;
		if (act.kind === 'tb-click') {
			var sel = 'button[name="' + act.name + '"]' + (act.value !== undefined && act.value !== '' ? '[value="' + act.value + '"]' : '');
			var b = [].slice.call(room.el.querySelectorAll(sel)).filter(function (x) { return x.offsetParent !== null; })[0] ||
				room.el.querySelector(sel);
			if (b) b.click();
		} else if (act.kind === 'tb-edit') {
			room.edit(+act.i);
		} else if (act.kind === 'tb-select') {
			room.selectPokemon(+act.i);
		} else if (act.kind === 'tb-focus') {
			// Stats / details: the Teambuilder's own handlers for those buttons (a synthetic click doesn't reach them)
			if (act.field === 'stats' || act.field === 'details') {
				if (document.activeElement && room.el.contains(document.activeElement)) document.activeElement.blur();
				lastTbActive = document.activeElement;
				if (room.curSet && room[act.field]) room[act.field](room.curSetLoc);
			}
			else { inp = room.el.querySelector('input[name=' + act.field + ']'); if (inp) { inp.focus(); inp.select(); syncTbFocus(room, inp); } }
		} else if (act.kind === 'tb-type' || act.kind === 'tb-key') {
			inp = tbActiveInput(room);
			if (!inp) return;
			if (act.kind === 'tb-type') inp.value += act.text;
			else if (act.key === 'back') inp.value = inp.value.slice(0, -1);
			else if (act.key === 'clear') inp.value = '';
			$(inp).trigger('keyup');
			if (!inp.classList.contains('chartinput')) $(inp).trigger('change');
		} else if (act.kind === 'tb-pick') {
			var a = [].slice.call(room.el.querySelectorAll('.utilichart a[data-entry]')).filter(function (x) {
				return x.getAttribute('data-entry') === act.entry;
			})[0];
			if (a) a.click();
			else if (room.curChartName) room.chartSet(act.entry.slice(act.entry.indexOf('|') + 1), true);
		} else if (act.kind === 'tb-ev' || act.kind === 'tb-iv') {
			// The stat form's own boxes, as if typed (its keyup handler caps the value and updates the set)
			inp = room.el.querySelector('input[name=' + (act.kind === 'tb-ev' ? 'stat-' : 'iv-') + act.stat + ']');
			if (inp) { inp.value = String(act.value); $(inp).trigger('keyup').trigger('change'); }
		} else if (act.kind === 'tb-nature') {
			var sel = room.el.querySelector('select[name=nature]');
			if (sel) { sel.value = act.nature; $(sel).trigger('change'); }
		} else if (act.kind === 'tb-kbd') {
			tbKeyboard = !!act.on;
			try { localStorage.setItem('thorTbKeyboard', tbKeyboard ? '1' : '0'); } catch (e) {}
			syncTbInputs(room);
		}
	}


	// ── The panel keyboard for any text box on the page ─────────────────────────────
	// While it's on, Android's keyboard stays away (inputmode=none) and the bottom-screen keyboard types into whichever
	// box is selected on the top screen: chat, private messages, prompts (find a user, choose name), Teambuilder.
	var panelKeyboard = true;
	try { panelKeyboard = (localStorage.getItem('thorKeyboard') || localStorage.getItem('thorTbKeyboard')) !== '0'; } catch (e) {}
	var TEXT_TYPES = { text: 1, search: 1, password: 1, email: 1, url: 1, tel: 1, number: 1, '': 1 };

	function isEditable(el) {
		if (!el || el.disabled || el.readOnly) return false;
		if (el.tagName === 'TEXTAREA') return true;
		return el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() in TEXT_TYPES;
	}

	function syncInputModes() {
		var off = panelKeyboard && panelShown;
		document.querySelectorAll('input, textarea').forEach(function (i) {
			if (!isEditable(i)) return;
			if (off) { if (i.getAttribute('inputmode') !== 'none') i.setAttribute('inputmode', 'none'); }
			else if (i.getAttribute('inputmode') === 'none') i.removeAttribute('inputmode');
		});
	}

	// Rooms focus their own chat box (joining a battle, switching tabs), so a chat box only brings up the keyboard once
	// it's tapped, or right after the panel opens a private message. Prompts, forms and Teambuilder boxes open on purpose.
	var armedEl = null, armUntil = 0;
	document.addEventListener('pointerdown', function (e) {
		var el = e.target && e.target.closest ? e.target.closest('input, textarea') : null;
		armedEl = isEditable(el) ? el : null;
	}, true);
	document.addEventListener('focusin', function (e) {
		if (Date.now() < armUntil && isEditable(e.target)) { armedEl = e.target; armUntil = 0; }
	}, true);

	function typingTarget() {
		var el = document.activeElement;
		if (isEditable(el) && el.offsetParent !== null && (el.tagName !== 'TEXTAREA' || el === armedEl)) return el;
		var tb = tbRoom();
		if (tb && tb.curSet && tb.curChartName && tb.curChartType in { pokemon: 1, item: 1, ability: 1, move: 1 }) {
			return tb.el.querySelector('input[name=' + tb.curChartName + ']');
		}
		return null;
	}

	function typingInfo() {
		var el = typingTarget();
		if (!el) return null;
		var kind = el.type === 'password' ? 'password' : el.tagName === 'TEXTAREA' ? 'chat' : el.classList.contains('chartinput') ? 'chart' : 'text';
		var label = el.getAttribute('placeholder') || el.getAttribute('aria-label') || '';
		if (!label) {
			var lab = el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]'));
			label = lab ? text(lab) : el.name || '';
		}
		if (kind === 'chat') {
			var room = window.app && app.curRoom;
			var pm = el.closest('.pm-window');
			label = pm ? 'Message ' + (pm.getAttribute('data-name') || $(pm).data('name') || '') : 'Chat' + (room && room.title ? ' · ' + room.title : '');
		}
		return { kind: kind, label: label, value: kind === 'password' ? el.value.replace(/./g, '•') : el.value,
			enter: kind === 'chat' ? 'Send' : kind === 'chart' ? 'Pick first' : 'OK' };
	}

	function fire(el, type, extra) {
		var ev = $.Event(type, extra || {});
		$(el).trigger(ev);
	}

	function typeText(el, str) {
		var start = el.value.length, end = start;
		try { if (typeof el.selectionStart === 'number') { start = el.selectionStart; end = el.selectionEnd; } } catch (e) {}
		var v = el.value;
		el.value = v.slice(0, start) + str + v.slice(end);
		try { el.setSelectionRange(start + str.length, start + str.length); } catch (e) {}
		afterEdit(el);
	}

	function afterEdit(el) {
		el.dispatchEvent(new Event('input', { bubbles: true }));
		fire(el, 'keyup');
		// Teambuilder nickname / team name save on change; chart boxes commit on their own
		if (el.tagName === 'INPUT' && !el.classList.contains('chartinput')) fire(el, 'change');
	}

	function pressEnter(el) {
		if (el.tagName === 'TEXTAREA' || el.classList.contains('chartinput') || !el.form) {
			fire(el, 'keydown', { keyCode: 13, which: 13, key: 'Enter' });
			return;
		}
		// Forms (prompts, server pages): a submit event, without the browser's own navigation
		el.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
	}

	function keyAct(act) {
		var el = typingTarget();
		if (act.kind === 'kbd') {
			panelKeyboard = !!act.on;
			try { localStorage.setItem('thorKeyboard', panelKeyboard ? '1' : '0'); } catch (e) {}
			syncInputModes();
			return;
		}
		if (!el) return;
		if (act.kind === 'type') { typeText(el, act.text); return; }
		if (act.key === 'back') {
			var st = el.value.length, en = st;
			try { if (typeof el.selectionStart === 'number') { st = el.selectionStart; en = el.selectionEnd; } } catch (e) {}
			if (st === en && st > 0) st--;
			el.value = el.value.slice(0, st) + el.value.slice(en);
			try { el.setSelectionRange(st, st); } catch (e) {}
			afterEdit(el);
		} else if (act.key === 'clear') {
			el.value = '';
			afterEdit(el);
		} else if (act.key === 'enter') {
			pressEnter(el);
		} else if (act.key === 'done') {
			if (el.tagName === 'INPUT' && !el.classList.contains('chartinput')) fire(el, 'change');
			el.blur();
		}
	}

	// ── Main menu: format / team for Battle!, and challenges (they live in the PM windows) ──
	function mainMenu() { return window.app && app.rooms[''] && app.rooms[''].el ? app.rooms[''] : null; }

	function formatInfo(id) {
		var f = window.BattleFormats && BattleFormats[id];
		return { id: id || '', name: f ? f.name : (id || ''), needsTeam: !!(f && !f.team) };
	}

	function formatList(kind) {
		var out = [], F = window.BattleFormats || {};
		for (var id in F) {
			var f = F[id];
			if (f.effectType !== 'Format' || f.battleFormat || !f[kind + 'Show']) continue;
			out.push({ id: id, name: f.name, section: f.section || '', team: !f.team });
		}
		return out;
	}

	function teamList(formatId) {
		var F = window.BattleFormats || {}, f = F[(formatId || '').split('@@@')[0]] || {};
		var tf = f.teambuilderFormat || (f.isTeambuilderFormat ? formatId : '');
		return (window.Storage && Storage.teams || []).map(function (t, i) {
			return { i: i, name: t.name, format: t.format, match: !!tf && t.format === tf };
		}).sort(function (a, b) { return (b.match - a.match) || (a.i - b.i); }).slice(0, 80);
	}

	function teamButtonInfo(btn) {
		if (!btn) return null;
		var v = btn.value;
		return { value: v, label: v === 'random' ? 'Random team' : v === '' || v === undefined ? 'Select a team' :
			(Storage.teams[+v] ? Storage.teams[+v].name : text(btn)), disabled: btn.disabled };
	}

	function challengesInfo() {
		var menu = mainMenu();
		if (!menu) return [];
		return [].slice.call(menu.el.querySelectorAll('.pm-window')).map(function (w) {
			var c = w.querySelector('.challenge');
			if (!c || !c.querySelector('form, p')) return null;
			var has = function (n) { return !!c.querySelector('button[name=' + n + ']'); };
			var state = has('acceptChallenge') ? 'incoming' : has('makeChallenge') ? 'compose' : has('cancelChallenge') ? 'outgoing' : has('dismissChallenge') ? 'cancelled' : '';
			if (!state) return null;
			var fb = c.querySelector('button[name=format]');
			var fmt = fb ? formatInfo(fb.value) : formatInfo('');
			var priv = c.querySelector('input[name=private]');
			return { user: w.getAttribute('data-userid') || $(w).data('userid'), name: $(w).data('name') || '', state: state,
				format: fmt, formatLocked: !fb || fb.disabled, team: teamButtonInfo(c.querySelector('button[name=team]')),
				teams: state === 'incoming' || state === 'compose' ? teamList(fmt.id) : null, private: !!(priv && priv.checked) };
		}).filter(Boolean);
	}

	function challengeAct(act) {
		var menu = mainMenu();
		if (!menu) return;
		var w = menu.el.querySelector('.pm-window[data-userid="' + act.user + '"]');
		var c = w && w.querySelector('.challenge');
		if (!c) return;
		if (act.kind === 'ch') {
			var name = act.action + 'Challenge';
			var b = c.querySelector('button[name=' + name + ']');
			if (b && menu[name]) menu[name](null, b);
		} else if (act.kind === 'ch-team') {
			var tb = c.querySelector('button[name=team]');
			if (tb) $(tb).val(act.i).html(TeamPopup.renderTeam(+act.i));
		} else if (act.kind === 'ch-format') {
			var fb = c.querySelector('button[name=format]');
			if (fb) {
				$(fb).replaceWith(menu.renderFormats(act.format));
				var t = c.querySelector('button[name=team]');
				if (t) $(t).replaceWith(menu.renderTeams(act.format));
			}
		} else if (act.kind === 'ch-private') {
			var p = c.querySelector('input[name=private]');
			if (p) p.checked = !!act.on;
		}
	}

	function menuFormAct(act) {
		var menu = mainMenu();
		if (!menu) return;
		var form = menu.el.querySelector('.mainmenu button[name=search], .mainmenu button[name=format]');
		form = form && form.closest('form');
		if (!form) return;
		if (act.kind === 'menu-format') {
			menu.curFormat = act.format;
			menu.curTeamIndex = -1;
			var fb = form.querySelector('button[name=format]');
			if (fb) $(fb).replaceWith(menu.renderFormats(act.format));
			var tb = form.querySelector('button[name=team]');
			if (tb) $(tb).replaceWith(menu.renderTeams(act.format));
		} else if (act.kind === 'menu-team') {
			var t = form.querySelector('button[name=team]');
			if (t) {
				$(t).val(act.i).html(TeamPopup.renderTeam(+act.i));
				menu.curTeamIndex = +act.i;
				menu.curTeamFormat = (form.querySelector('button[name=format]') || {}).value;
			}
		} else if (act.kind === 'search') {
			if (isSearching(menu, form)) menu.cancelSearch();
			else menu.search(null, form.querySelector('button[name=search]'));
		}
	}

	// The menu's own test (updateSearch): `searching` is a list, empty when idle; p.cancel = connecting
	function isSearching(menu, form) {
		var sr = menu.searching;
		return (Array.isArray(sr) ? sr.length > 0 : !!sr) || !!(form && form.querySelector('p.cancel'));
	}

	function lobbyForm() {
		var menu = mainMenu();
		var form = menu && menu.el.querySelector('.mainmenu button[name=format]');
		form = form && form.closest('form');
		if (!form) return null;
		var fb = form.querySelector('button[name=format]');
		var fmt = formatInfo(fb ? fb.value : '');
		return { format: fmt, team: teamButtonInfo(form.querySelector('button[name=team]')), teams: teamList(fmt.id),
			searching: isSearching(menu, form) };
	}

	// ── Watch a battle (the battles room's own list) and friends (the server's friends page) ──
	function battlesInfo(room, user) {
		var rooms = (room.data && room.data.rooms) || {};
		var list = [], counts = {};
		for (var id in rooms) {
			var m = window.ChatRoom && ChatRoom.parseBattleID ? ChatRoom.parseBattleID(id) : null;
			if (!m) continue;
			var r = rooms[id];
			counts[m[1]] = (counts[m[1]] || 0) + 1;
			if (list.length < 80) list.push({ id: id, format: m[1], formatName: formatInfo(m[1]).name, p1: r.p1 || '', p2: r.p2 || '', elo: r.minElo || '' });
		}
		return { mode: 'battles', user: user, format: room.format || '', formatName: room.format ? formatInfo(room.format).name : 'All formats',
			list: list, formats: Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 12).map(function (f) {
				return { id: f, name: formatInfo(f).name, n: counts[f] };
			}) };
	}

	function friendsInfo(room, user) {
		var friends = [];
		[].slice.call(room.el.querySelectorAll('.infobox')).forEach(function (box) {
			var u = box.querySelector('username, .username');
			var name = u ? text(u) : text(box.querySelector('i'));
			if (!name) return;
			var st = text(box.querySelector('small')).replace(/[()]/g, '').replace(/[◉◌]/g, '').trim();
			friends.push({ name: name, status: st || (u ? 'Online' : 'Offline'), online: !!u && !/offline/i.test(st) });
		});
		return { mode: 'friends', user: user, page: room.id, friends: friends, empty: friends.length ? '' : text(room.el.querySelector('em')) };
	}

	var transientNote = '';
	function watchUser(name) {
		var id = toID(name);
		app.once('response:userdetails', function (data) {
			var rooms = Object.keys((data && data.rooms) || {}).map(function (k) { return k.replace(/^[^a-z0-9]+/, ''); })
				.filter(function (k) { return k.indexOf('battle-') === 0; });
			if (rooms.length) app.joinRoom(rooms[0]);
			else { transientNote = name + " isn't in a battle right now."; setTimeout(function () { transientNote = ''; }, 6000); }
		});
		app.send('/cmd userdetails ' + id);
	}

	// Light/Dark theme, the chosen background, and the Home menu colours (Showdown tints them to the background),
	// so the bottom panel looks like the page. Read every 2 s; computed styles are cheap but not free.
	var themeCache = null, themeAt = 0;
	function themeInfo() {
		if (themeCache && Date.now() - themeAt < 2000) return themeCache;
		var bs = getComputedStyle(document.body);
		var menu = [];
		for (var i = 1; i <= 6; i++) {
			var b = document.querySelector('.mainmenu .button.mainmenu' + i);
			if (!b) { menu.push(null); continue; }
			var c = getComputedStyle(b);
			menu.push({ bg: c.backgroundImage, border: c.borderTopColor });
		}
		themeCache = { dark: document.documentElement.classList.contains('dark') || document.body.classList.contains('dark'),
			bg: bs.backgroundImage && bs.backgroundImage !== 'none' ? bs.backgroundImage : '', bgc: bs.backgroundColor, menu: menu };
		themeAt = Date.now();
		return themeCache;
	}

	function snapshot() {
		var a = window.app;
		if (!a || !a.user) return { mode: 'loading', theme: themeInfo() };
		var user = { name: a.user.get('name') || '', named: !!a.user.get('named') };
		var out = snapshotMode(a, user);
		out.typing = typingInfo();
		out.kbd = panelKeyboard;
		out.challenges = challengesInfo();
		out.note = transientNote;
		out.theme = themeInfo();
		return out;
	}

	function snapshotMode(a, user) {
		var tbr = tbRoom();
		if (tbr) return tbInfo(tbr, user);
		var cur = a.curRoom;
		if (cur && cur.id === 'battles' && cur.data !== undefined) return battlesInfo(cur, user);
		// On a wide page the battles list opens beside Home, so Home stays the current room
		var side = a.curSideRoom;
		if ((!cur || !cur.id || cur.id === 'rooms') && side && side.id === 'battles' && side.data !== undefined) return battlesInfo(side, user);
		if (cur && cur.id && cur.id.indexOf('view-friends') === 0 && cur.el) return friendsInfo(cur, user);
		var room = battleRoom();
		if (!room) {
			var battles = [];
			for (var id in a.rooms) if (id.indexOf('battle-') === 0) battles.push({ id: id, title: a.rooms[id].title || id });
			var format = '';
			try { format = text(document.querySelector('.mainmenu .formatselect')); } catch (e) {}
			return { mode: 'lobby', user: user, room: a.curRoom ? a.curRoom.id : '', battles: battles, format: format,
				searching: !!(a.rooms[''] && a.rooms[''].$('button[name=cancelSearch]').length), form: lobbyForm(),
				formats: formatList('search'), challengeFormats: formatList('challenge') };
		}
		var b = room.battle;
		var me = b.nearSide || b.mySide, foe = b.farSide;
		var foeInfo = sideInfo(foe, null);
		var foeActive = foeInfo && foeInfo.active[0];
		var foeTypesList = foeInfo ? foeInfo.active.map(function (p) { return p && !p.fainted ? p.types : null; }) : null;
		var team = myTeam(room.request, foeActive ? foeActive.types : null);
		var ctl = controls(room, foeTypesList, team);
		return {
			mode: 'battle', id: room.id, title: room.title || '', user: user,
			turn: b.turn, ended: !!b.ended, spectator: !room.side,
			gen: b.gen, tier: b.tier || '', rated: !!b.rated,
			weather: b.weather || '', pseudo: (b.pseudoWeather || []).map(function (w) { return w[0]; }),
			you: sideInfo(me, room.request), foe: foeInfo, team: team,
			waiting: !!(room.request && room.request.wait),
			big: bigBattle, log: recentLog(room, 8),
			controls: ctl
		};
	}

	var last = '';
	function send() {
		setViewport(); // the client resets it to device-width once, on its first layout pass
		syncInputModes();
		var s;
		try { s = JSON.stringify(snapshot()); } catch (e) { s = JSON.stringify({ mode: 'error', error: String(e) }); }
		if (s !== last) {
			last = s;
			if (window.ShowdownThor) ShowdownThor.state(s);
		}
	}

	function clickIn(root, selector) {
		var el = root && root.querySelector(selector);
		if (!el) return false;
		el.click();
		return true;
	}

	window.ThorInject = {
		resync: function () { last = ''; setViewport(); send(); },
		// false while the bottom screen isn't available: the top screen keeps its own battle controls
		setPanel: function (on) { panelShown = !!on; setViewport(); },
		// {kind:'click', name, value} = one of the battle control buttons; {kind:'toggle', name} = a gimmick
		// checkbox (Terastallize etc.); {kind:'search'} = the main menu's Battle! button; {kind:'room', id} = focus a room
		act: function (json) {
			var a = window.app, act;
			try { act = JSON.parse(json); } catch (e) { return; }
			if (!a) return;
			if (act.kind === 'search' || act.kind === 'menu-format' || act.kind === 'menu-team') {
				menuFormAct(act);
			} else if (act.kind === 'type' || act.kind === 'key' || act.kind === 'kbd') {
				keyAct(act);
			} else if (act.kind in { ch: 1, 'ch-team': 1, 'ch-format': 1, 'ch-private': 1 }) {
				challengeAct(act);
			} else if (act.kind === 'menu') {
				var mm = mainMenu();
				if (act.name === 'finduser' && mm) mm.finduser();
				else if (act.name === 'friends') a.joinRoom('view-friends-all');
				else if (act.name === 'battles') a.joinRoom('battles');
			} else if (act.kind === 'pm') {
				armUntil = Date.now() + 2000;
				var m1 = mainMenu(); if (m1) m1.focusPM(act.name);
			} else if (act.kind === 'challengeUser') {
				var m2 = mainMenu(); if (m2) m2.challenge(act.name);
			} else if (act.kind === 'watchUser') {
				watchUser(act.name);
			} else if (act.kind === 'battles-format') {
				var bl = a.rooms.battles; if (bl && bl.changeFormat) bl.changeFormat(act.format || '');
			} else if (act.kind === 'battles-refresh') {
				var bl2 = a.rooms.battles; if (bl2 && bl2.refresh) bl2.refresh();
			} else if (act.kind === 'leave') {
				var lr = act.room ? a.rooms[act.room] : battleRoom();
				if (lr) a.leaveRoom(lr.id);
			} else if (act.kind === 'forfeit') {
				var fr = battleRoom(); if (fr && fr.side) fr.send('/forfeit');
			} else if (act.kind === 'room') {
				a.joinRoom(act.id);
			} else if (act.kind.indexOf('tb-') === 0) {
				var tb = tbRoom();
				if (tb) tbAct(tb, act);
			} else if (act.kind === 'layout') {
				bigBattle = !!act.big;
				try { localStorage.setItem('thorBigBattle', bigBattle ? '1' : '0'); } catch (e) {}
				setViewport();
			} else {
				var room = battleRoom();
				var c = room && room.$controls && room.$controls[0];
				if (!c) return;
				if (act.kind === 'toggle') {
					clickIn(c, 'input[type=checkbox][name="' + act.name + '"]');
				} else if (act.kind === 'click') {
					var sel = 'button[name="' + act.name + '"]';
					if (act.value !== undefined && act.value !== '') sel += '[value="' + String(act.value).replace(/"/g, '\\"') + '"]';
					clickIn(c, sel);
				}
			}
			setTimeout(send, 50);
		}
	};

	setViewport();
	setInterval(send, 250);
	send();
})();
